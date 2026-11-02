import re
import unicodedata
import uuid
import zoneinfo
from datetime import datetime, timedelta
from typing import Any
from pathlib import Path
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from ml.promotion import write_json_atomic
from backend.app.prediction_service import get_subject_paths, load_subject_data, SubjectNotFoundError
from backend.app.care_repository import CareRecordRepository, SubjectRepository
from backend.app.schemas import ActorContext, ProvenanceV2

router = APIRouter(prefix="/api/v1/subjects", tags=["Subjects"])
SUBJECTS_ROOT = Path(__file__).resolve().parents[3] / "data" / "subjects"


class OnboardSubjectRequest(BaseModel):
    subject_id: str | None = Field(default=None, min_length=1)
    display_name: str | None = Field(default=None, min_length=1)
    timezone: str
    baseline: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=lambda: {"source": "caregiver_onboarding", "synthetic": False})
    sensory_context: dict[str, Any] = Field(default_factory=dict)
    habitual_context: dict[str, Any] = Field(default_factory=dict)
    historical_supports: list[dict[str, Any]] = Field(default_factory=list)
    authorized_tutor_ids: list[str] = Field(default_factory=list)


class OnboardSubjectResponse(BaseModel):
    contract_version: str = "2.0"
    subject_id: str
    display_name: str
    initials: str
    timezone: str
    cold_start: bool = True
    provisional_baseline: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any]


class SubjectListResponse(BaseModel):
    contract_version: str = "2.0"
    subjects: list[OnboardSubjectResponse]


class CareRecordWrite(BaseModel):
    occurred_at: datetime
    idempotency_key: str = Field(min_length=1)
    provenance: ProvenanceV2
    sleep_quality: str | None = None
    gi_status: str | None = None
    wake_mode: str | None = None
    start_autonomy: str | None = None
    medication_adherence: str | None = None
    day_regulation_level: str | None = None


class EventWrite(BaseModel):
    occurred_at: datetime
    idempotency_key: str = Field(min_length=1)
    provenance: ProvenanceV2
    event_type: str
    intensity_value: int = Field(ge=1, le=10)


DYREGULATION_EVENT_TYPE = "Desregulación Emocional"

# Texto -> número para los campos de la Bitácora. El texto original se conserva
# en `raw: {...}` y el número queda en la raíz con un nombre estable que el
# motor (`engine/features.py`) agrega automáticamente.
SLEEP_QUALITY_MAP = {"Reparador": 8, "Interrumpido": 5, "Dificultad de Conciliación": 2}
WAKE_STATE_MAP = {
    "Tranquilo/Alegre": 2,
    "Cansado/Con Sueño": 5,
    "Cansado": 5,
    "Irritable/Llorando": 8,
}
START_AUTONOMY_MAP = {"Por sí solo": 0, "Con alarma": 1, "Con insistencia": 2}
MEDICATION_MAP = {"Sí": 1, "No": 0}  # "No Aplica" queda fuera a propósito
GI_LEVEL_MAP = {"Normal": 0, "Estreñimiento": 1, "Diarrea": 2}
DAY_REGULATION_MAP = {"Excelente": 0, "Estable con Apoyo": 1, "Desregulación Frecuente": 2}


def _normalize_label(value: str) -> str:
    """Normaliza una etiqueta para matching robusto: sin tildes, minúsculas y espacios colapsados."""
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(ascii_value.casefold().split())


def _normalized_map(mapping: dict[str, int]) -> dict[str, int]:
    return {_normalize_label(label): number for label, number in mapping.items()}


# (campo del request, nombre numérico estable, mapa normalizado texto -> número)
_CARE_FIELD_ENCODINGS: list[tuple[str, str, dict[str, int]]] = [
    ("sleep_quality", "sleep_quality", _normalized_map(SLEEP_QUALITY_MAP)),
    ("wake_mode", "wake_state", _normalized_map(WAKE_STATE_MAP)),
    ("start_autonomy", "start_autonomy_level", _normalized_map(START_AUTONOMY_MAP)),
    ("medication_adherence", "medication_taken", _normalized_map(MEDICATION_MAP)),
    ("gi_status", "gi_level", _normalized_map(GI_LEVEL_MAP)),
    ("day_regulation_level", "day_regulation_level_num", _normalized_map(DAY_REGULATION_MAP)),
]


def _encode_care_record(req: CareRecordWrite) -> dict[str, Any]:
    """Codifica los campos de texto de un registro: texto a `raw` y número a la raíz."""
    item: dict[str, Any] = {
        "occurred_at": req.occurred_at.isoformat(),
        "idempotency_key": req.idempotency_key,
        "provenance": req.provenance.model_dump(mode="json"),
    }
    raw: dict[str, Any] = {}
    for request_field, numeric_field, mapping in _CARE_FIELD_ENCODINGS:
        value = getattr(req, request_field)
        if value is None:
            continue
        raw[request_field] = value
        number = mapping.get(_normalize_label(value))
        if number is not None:
            # Un texto no reconocido (o "No Aplica") no genera campo numérico,
            # para no contaminar la cobertura ni el conteo.
            item[numeric_field] = number
    if raw:
        item["raw"] = raw
    return item


def severity_from_intensity(intensity_value: int) -> str:
    if intensity_value <= 3:
        return "mild"
    if intensity_value <= 7:
        return "moderate"
    return "severe"


def require_aware(value: datetime, field_name: str = "occurred_at") -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(status_code=422, detail=f"{field_name} must be a timezone-aware ISO timestamp.")
    return value


def care_repository() -> CareRecordRepository:
    return CareRecordRepository(SUBJECTS_ROOT)


def is_cutoff_eligible(item: dict[str, Any], start: datetime, cutoff: datetime) -> bool:
    source_timestamp = datetime.fromisoformat(item["source_timestamp"])
    availability_timestamp = datetime.fromisoformat(item["availability_timestamp"])
    return availability_timestamp <= cutoff and start <= source_timestamp <= cutoff


def get_care_actor(
    x_actor_id: str | None = Header(default=None),
    x_actor_role: str | None = Header(default=None),
) -> ActorContext:
    if not x_actor_id or not x_actor_role:
        raise HTTPException(status_code=401, detail="Actor context is required.")
    try:
        return ActorContext(actor_id=x_actor_id, role=x_actor_role)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Actor role is not authorized.") from exc


def subject_id_from_identity(display_name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", display_name.casefold()).strip("-")
    if not normalized:
        raise HTTPException(status_code=422, detail="A subject name is required.")
    return normalized


def subject_initials(display_name: str) -> str:
    return "".join(part[0] for part in display_name.split()[:2]).upper() or "?"


@router.post("", response_model=OnboardSubjectResponse, status_code=201)
def onboard_subject(req: OnboardSubjectRequest) -> OnboardSubjectResponse:
    # 1. Validate timezone
    try:
        zoneinfo.ZoneInfo(req.timezone)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid IANA timezone: {req.timezone}")

    display_name = req.display_name or req.subject_id
    if not display_name:
        raise HTTPException(status_code=422, detail="A subject name is required.")
    subject_id = req.subject_id or subject_id_from_identity(display_name)

    profile_data = {
        "contract_version": "2.0",
        "subject_id": subject_id,
        "display_name": display_name,
        "initials": subject_initials(display_name),
        "timezone": req.timezone,
        "baseline": req.baseline,
        "provenance": req.provenance,
        "sensory_context": req.sensory_context,
        "habitual_context": req.habitual_context,
        "historical_supports": req.historical_supports,
        "authorized_tutor_ids": req.authorized_tutor_ids,
    }

    stored = SubjectRepository(SUBJECTS_ROOT).save(profile_data)
    subject_dir = SUBJECTS_ROOT / subject_id
    # Initialize empty records and occurrences for subsequent slices.
    if not (subject_dir / "records.json").exists():
        write_json_atomic(subject_dir / "records.json", [])
    if not (subject_dir / "occurrences.json").exists():
        write_json_atomic(subject_dir / "occurrences.json", [])

    return OnboardSubjectResponse(
        **stored,
        cold_start=True,
        provisional_baseline=stored.get("baseline", {})
    )


@router.get("", response_model=SubjectListResponse)
def list_subjects() -> SubjectListResponse:
    return SubjectListResponse(subjects=[OnboardSubjectResponse(**profile) for profile in SubjectRepository(SUBJECTS_ROOT).list()])


@router.get("/{subject_id}")
def get_subject(subject_id: str) -> dict[str, Any]:
    try:
        return SubjectRepository(SUBJECTS_ROOT).get(subject_id)
    except KeyError:
        pass
    try:
        profile, _, _ = load_subject_data(subject_id)
        return profile
    except SubjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")


@router.post("/{subject_id}/daily-records", status_code=201)
def save_daily_record(subject_id: str, req: CareRecordWrite, actor: ActorContext = Depends(get_care_actor)) -> dict[str, Any]:
    occurred_at = require_aware(req.occurred_at)
    item = _encode_care_record(req)
    item.update({
        "contract_version": "2.0",
        "subject_id": subject_id,
        "author_id": actor.actor_id,
        "source_timestamp": occurred_at.isoformat(),
        "availability_timestamp": occurred_at.isoformat(),
        "date": occurred_at.date().isoformat(),
        "prediction_availability": "immediate",
    })
    try:
        return care_repository().save(subject_id, "records", item, "record_id")
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")


@router.post("/{subject_id}/events", status_code=201)
def save_event(subject_id: str, req: EventWrite, actor: ActorContext = Depends(get_care_actor)) -> dict[str, Any]:
    occurred_at = require_aware(req.occurred_at)
    item = req.model_dump(mode="json")
    if req.event_type == DYREGULATION_EVENT_TYPE:
        item["severity"] = severity_from_intensity(req.intensity_value)
    item.update({
        "contract_version": "2.0",
        "subject_id": subject_id,
        "author_id": actor.actor_id,
        "source_timestamp": occurred_at.isoformat(),
        "availability_timestamp": occurred_at.isoformat(),
        "prediction_availability": "immediate",
    })
    try:
        saved = care_repository().save(subject_id, "occurrences", item, "event_id")
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")
    _refresh_daily_event_counts(subject_id, occurred_at, actor.actor_id)
    return saved


@router.post("/{subject_id}/end-of-day", status_code=201)
def save_end_of_day(subject_id: str, req: CareRecordWrite, actor: ActorContext = Depends(get_care_actor)) -> dict[str, Any]:
    occurred_at = require_aware(req.occurred_at)
    try:
        profile = SubjectRepository(SUBJECTS_ROOT).get(subject_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")
    local_zone = zoneinfo.ZoneInfo(profile["timezone"])
    local_time = occurred_at.astimezone(local_zone)
    availability = datetime.combine(local_time.date() + timedelta(days=1), datetime.min.time(), tzinfo=local_zone)
    item = _encode_care_record(req)
    item.update({
        "contract_version": "2.0",
        "subject_id": subject_id,
        "author_id": actor.actor_id,
        "source_timestamp": occurred_at.isoformat(),
        "availability_timestamp": availability.isoformat(),
        "date": local_time.date().isoformat(),
        "prediction_availability": "prior_day_only",
    })
    return care_repository().save(subject_id, "records", item, "record_id")


def _refresh_daily_event_counts(subject_id: str, occurred_at: datetime, author_id: str) -> None:
    """Recalcula event_count/dysregulation_count/max_intensity en el registro diario local.

    Si no existe un registro diario para el día local del evento, crea uno mínimo
    para que el motor pueda consumir el conteo como variable.
    """
    try:
        profile = SubjectRepository(SUBJECTS_ROOT).get(subject_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")
    local_zone = zoneinfo.ZoneInfo(profile["timezone"])
    local_date_str = occurred_at.astimezone(local_zone).date().isoformat()

    repo = care_repository()
    occurrences = repo.list(subject_id, "occurrences")
    records = repo.list(subject_id, "records")

    def _local_date(timestamp: str) -> str:
        return datetime.fromisoformat(timestamp).astimezone(local_zone).date().isoformat()

    day_occurrences = [occ for occ in occurrences if _local_date(occ["source_timestamp"]) == local_date_str]

    event_count = len(day_occurrences)
    dysregulation_count = sum(
        1 for occ in day_occurrences if occ.get("event_type") == DYREGULATION_EVENT_TYPE
    )
    intensities = [
        occ["intensity_value"]
        for occ in day_occurrences
        if isinstance(occ.get("intensity_value"), (int, float))
    ]
    max_intensity = max(intensities) if intensities else 0

    # Prefiere el registro basal ("immediate") de ese día; si no, cualquiera del día.
    target: dict[str, Any] | None = None
    for record in records:
        if record.get("date") != local_date_str:
            continue
        if record.get("prediction_availability") == "immediate":
            target = record
            break
        if target is None:
            target = record

    counts = {
        "event_count": event_count,
        "dysregulation_count": dysregulation_count,
        "max_intensity": max_intensity,
    }

    if target is not None:
        target.update(counts)
    else:
        records.append({
            "contract_version": "2.0",
            "subject_id": subject_id,
            "author_id": author_id,
            "idempotency_key": f"event-count:{subject_id}:{local_date_str}",
            "record_id": uuid.uuid4().hex,
            "source_timestamp": occurred_at.isoformat(),
            "availability_timestamp": occurred_at.isoformat(),
            "date": local_date_str,
            "prediction_availability": "immediate",
            **counts,
        })

    write_json_atomic(SUBJECTS_ROOT / subject_id / "records.json", records)


@router.get("/{subject_id}/timeline")
def get_subject_timeline(
    subject_id: str,
    as_of: str = Query(..., description="Timezone-aware datetime string"),
    days: int = Query(7, ge=1)
) -> dict[str, Any]:
    # 1. Parse aware as_of
    try:
        as_of_dt = datetime.fromisoformat(as_of)
        if as_of_dt.tzinfo is None:
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=422, detail="as_of must be a timezone-aware ISO timestamp.")

    # 2. Load data from the subject-scoped repository so route storage and cutoff rules share one source.
    try:
        records = care_repository().list(subject_id, "records")
        occurrences = care_repository().list(subject_id, "occurrences")
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")

    # 3. Filter cutoff-safe records in window [as_of - days, as_of]
    eligible_records = []
    start_time = as_of_dt - timedelta(days=days)
    
    for r in records:
        if is_cutoff_eligible(r, start_time, as_of_dt):
            source_timestamp = datetime.fromisoformat(r["source_timestamp"])
            eligible_records.append({
                "entry_id": r["record_id"], "kind": "daily_record", "timestamp": source_timestamp.isoformat(),
                "title": "Daily record", "detail": None, "semantic": "neutral", "payload": r,
            })

    for event in occurrences:
        if is_cutoff_eligible(event, start_time, as_of_dt):
            source_timestamp = datetime.fromisoformat(event["source_timestamp"])
            eligible_records.append({
                "entry_id": event["event_id"], "kind": "event", "timestamp": source_timestamp.isoformat(),
                "title": event["event_type"], "detail": None, "semantic": "neutral", "payload": event,
            })

    # Sort descending by source timestamp
    eligible_records.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"subject_id": subject_id, "as_of": as_of_dt.isoformat(), "days": days, "entries": eligible_records}


def require_subject_access(subject_id: str, actor: ActorContext) -> dict[str, Any]:
    try:
        profile = SubjectRepository(SUBJECTS_ROOT).get(subject_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")
    if actor.role == "system":
        return profile
    permitted = profile.get("authorized_tutor_ids", [])
    if actor.actor_id not in permitted:
        raise HTTPException(status_code=403, detail="Actor is not authorized for this subject.")
    return profile


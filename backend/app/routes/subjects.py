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
from backend.app.prediction_service import load_legacy_history, load_legacy_planned_events, load_subject_data, SubjectNotFoundError
from backend.app.care_repository import CareRecordRepository, SubjectRepository
from backend.app.schemas import ActorContext, ProvenanceV2

router = APIRouter(prefix="/api/v1/subjects", tags=["Subjects"])
SUBJECTS_ROOT = Path(__file__).resolve().parents[3] / "data" / "subjects"
# Perfiles demo (PAC-A/B/C): mismo formato de `profile.json`, historial sintético
# aparte en `data/legacy_history/`. Se listan y se pueden consultar como cualquier infante.
DEMO_PROFILES_ROOT = Path(__file__).resolve().parents[3] / "data" / "demo_profiles"


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
    # Contexto del día («¿Pasó algo distinto hoy?», plan de datos Fase 3).
    sleep_hours_range: str | None = None
    early_signs: list[str] | None = None
    physical_discomfort: list[str] | None = None
    routine_change: str | None = None
    school_attendance: str | None = None


class EventWrite(BaseModel):
    occurred_at: datetime
    idempotency_key: str = Field(min_length=1)
    provenance: ProvenanceV2
    event_type: str
    intensity_value: int = Field(ge=1, le=10)
    # Detalle de las hojas de registro [PCD Fase 2]. Es texto del tutor: el motor
    # no lo lee (solo agrega números), pero queda para el historial y la auditoría.
    qualitative_outcome: str | None = None
    trigger: list[str] | None = None
    strategy_applied: list[str] | None = None
    strategy_outcome: str | None = None
    support_used: str | None = None
    sensory_activity: str | None = None
    notes: str | None = None
    quick_capture: bool = False


class PlannedEventWrite(BaseModel):
    """Evento planificado (Planificación): citas, salidas, cambios de rutina."""
    title: str = Field(min_length=1)
    starts_at: datetime
    category: str | None = None
    expectation: str | None = None
    idempotency_key: str | None = None


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
# Contexto del día. «No sé» (horas de sueño) queda fuera a propósito: no es un dato.
SLEEP_HOURS_MAP = {"Menos de 7 h": 6, "7 a 9 h": 8, "Más de 9 h": 10}
ROUTINE_CHANGE_MAP = {"No": 0, "Visita": 1, "Salida": 1, "Cambio de horario": 1, "Feriado": 1}
SCHOOL_ATTENDANCE_MAP = {"Sí": 1, "Medio día": 0.5, "No": 0}
# Escala de cada hoja de registro → número diario [PCD Fase 2.2]. Se guarda en el
# registro del día (como event_count) para que el motor la agregue por ventanas.
# Si hay varios eventos del mismo tipo en el día, cuenta el peor (o la dieta más completa).
EVENT_SCALE_ENCODINGS: dict[str, tuple[str, dict[str, float]]] = {
    "Transición de Actividad": ("transition_difficulty", {"Fácil": 0, "Con ayuda": 1, "Difícil": 2}),
    "Alimentación": ("feeding_difficulty", {"Adecuada": 0, "Regular": 1, "Dificultosa": 2}),
    "Dieta Sensorial": ("sensory_diet_done", {"Completa": 1, "Parcial": 0.5, "No realizada": 0}),
}
EFFECTIVE_OUTCOME = "Regulación Exitosa"
UNRESOLVED_OUTCOME = "Sin Regulación"
# Opciones «nada» de las preguntas de varias respuestas.
NO_EARLY_SIGNS = "Ninguna"
NO_DISCOMFORT = "No"


def _normalize_label(value: str) -> str:
    """Normaliza una etiqueta para matching robusto: sin tildes, minúsculas y espacios colapsados."""
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(ascii_value.casefold().split())


def _normalized_map(mapping: dict[str, float]) -> dict[str, float]:
    return {_normalize_label(label): number for label, number in mapping.items()}


# (campo del request, nombre numérico estable, mapa normalizado texto -> número)
_CARE_FIELD_ENCODINGS: list[tuple[str, str, dict[str, float]]] = [
    ("sleep_quality", "sleep_quality", _normalized_map(SLEEP_QUALITY_MAP)),
    ("wake_mode", "wake_state", _normalized_map(WAKE_STATE_MAP)),
    ("start_autonomy", "start_autonomy_level", _normalized_map(START_AUTONOMY_MAP)),
    ("medication_adherence", "medication_taken", _normalized_map(MEDICATION_MAP)),
    ("gi_status", "gi_level", _normalized_map(GI_LEVEL_MAP)),
    ("day_regulation_level", "day_regulation_level_num", _normalized_map(DAY_REGULATION_MAP)),
    ("sleep_hours_range", "sleep_hours", _normalized_map(SLEEP_HOURS_MAP)),
    ("routine_change", "routine_change", _normalized_map(ROUTINE_CHANGE_MAP)),
    ("school_attendance", "school_attendance", _normalized_map(SCHOOL_ATTENDANCE_MAP)),
]

# Preguntas de varias respuestas: (campo del request, nombre numérico, opción «nada», cómo se resume).
#   early_signs → cuántas señales tempranas se vieron (0 si «Ninguna»).
#   physical_discomfort → 1 si hubo algún malestar, 0 si «No».
_CARE_LIST_ENCODINGS: list[tuple[str, str, str, str]] = [
    ("early_signs", "early_signs_count", NO_EARLY_SIGNS, "count"),
    ("physical_discomfort", "physical_discomfort", NO_DISCOMFORT, "any"),
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
    for request_field, numeric_field, none_option, mode in _CARE_LIST_ENCODINGS:
        values = getattr(req, request_field)
        if not values:
            continue  # sin responder: ni texto ni número
        raw[request_field] = list(values)
        chosen = [value for value in values if _normalize_label(value) != _normalize_label(none_option)]
        item[numeric_field] = len(chosen) if mode == "count" else int(bool(chosen))
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


def subject_root(subject_id: str) -> Path:
    """Carpeta raíz donde vive el infante: los reales primero, luego las demos."""
    for root in (SUBJECTS_ROOT, DEMO_PROFILES_ROOT):
        if (root / subject_id / "profile.json").exists():
            return root
    raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")


def is_demo_subject(subject_id: str) -> bool:
    return subject_root(subject_id) == DEMO_PROFILES_ROOT


def care_repository(subject_id: str) -> CareRecordRepository:
    """Registros y eventos se guardan en la carpeta del infante, sea real o demo."""
    return CareRecordRepository(subject_root(subject_id))


def subject_profile(subject_id: str) -> dict[str, Any]:
    return SubjectRepository(subject_root(subject_id)).get(subject_id)


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


def _demo_selection_profiles() -> list[dict[str, Any]]:
    """Perfiles demo para la selección, siempre marcados como sintéticos."""
    demos = []
    for profile in SubjectRepository(DEMO_PROFILES_ROOT).list():
        demos.append({**profile, "provenance": {**profile["provenance"], "synthetic": True}})
    return demos


@router.get("", response_model=SubjectListResponse)
def list_subjects() -> SubjectListResponse:
    real = SubjectRepository(SUBJECTS_ROOT).list()
    real_ids = {profile["subject_id"] for profile in real}
    # Los infantes reales primero; una demo con el mismo id que uno real no se duplica.
    demos = [profile for profile in _demo_selection_profiles() if profile["subject_id"] not in real_ids]
    return SubjectListResponse(subjects=[OnboardSubjectResponse(**profile) for profile in real + demos])


@router.get("/{subject_id}")
def get_subject(subject_id: str) -> dict[str, Any]:
    try:
        return SubjectRepository(SUBJECTS_ROOT).get(subject_id)
    except KeyError:
        pass
    try:
        profile, _, _, _ = load_subject_data(subject_id)
        return profile
    except SubjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")


@router.post("/{subject_id}/daily-records", status_code=201)
def save_daily_record(subject_id: str, req: CareRecordWrite, actor: ActorContext = Depends(get_care_actor)) -> dict[str, Any]:
    occurred_at = require_aware(req.occurred_at)
    # El día del registro es el día local del infante (zona del perfil), igual que en
    # el cierre del día y en los conteos de eventos, para que todo caiga en el mismo registro.
    local_zone = zoneinfo.ZoneInfo(subject_profile(subject_id)["timezone"])
    item = _encode_care_record(req)
    item.update({
        "contract_version": "2.0",
        "subject_id": subject_id,
        "author_id": actor.actor_id,
        "source_timestamp": occurred_at.isoformat(),
        "availability_timestamp": occurred_at.isoformat(),
        "date": occurred_at.astimezone(local_zone).date().isoformat(),
        "prediction_availability": "immediate",
    })
    return _upsert_daily_record(subject_id, item)


# Campos numéricos que escribe la Bitácora (no los conteos de eventos ni las
# escalas, que los agrega `_refresh_daily_event_counts`). Al editar, se
# reemplazan solo estos y el texto en `raw`; el resto del registro se conserva.
_BASAL_NUMERIC_FIELDS = {
    "sleep_quality", "wake_state", "start_autonomy_level", "medication_taken",
    "gi_level", "day_regulation_level_num", "sleep_hours", "routine_change",
    "school_attendance", "early_signs_count", "physical_discomfort",
}


def _upsert_daily_record(subject_id: str, item: dict[str, Any]) -> dict[str, Any]:
    """Guarda el estado basal del día: si ya existe, lo reemplaza (no duplica)."""
    repo = care_repository(subject_id)
    records = repo.list(subject_id, "records")
    target = next(
        (
            record
            for record in records
            if record.get("date") == item["date"] and record.get("prediction_availability") == "immediate"
        ),
        None,
    )
    if target is None:
        return repo.save(subject_id, "records", item, "record_id")
    # Editar: reemplaza el texto y los números de la Bitácora, conserva record_id,
    # timestamps y los conteos de eventos que ya calculó `_refresh_daily_event_counts`.
    target["raw"] = item.get("raw", {})
    for field in _BASAL_NUMERIC_FIELDS:
        if field in item:
            target[field] = item[field]
        else:
            target.pop(field, None)
    write_json_atomic(subject_root(subject_id) / subject_id / "records.json", records)
    return target


@router.post("/{subject_id}/events", status_code=201)
def save_event(subject_id: str, req: EventWrite, actor: ActorContext = Depends(get_care_actor)) -> dict[str, Any]:
    occurred_at = require_aware(req.occurred_at)
    # Lo que el tutor no respondió no se guarda (igual que en la Bitácora).
    item = req.model_dump(mode="json", exclude_none=True)
    for key in ("trigger", "strategy_applied"):
        if not item.get(key):
            item.pop(key, None)
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
    saved = care_repository(subject_id).save(subject_id, "occurrences", item, "event_id")
    _refresh_daily_event_counts(subject_id, occurred_at, actor.actor_id)
    _remember_effective_supports(subject_id, req)
    return saved


def _remember_effective_supports(subject_id: str, req: EventWrite) -> None:
    """Si lo aplicado funcionó («Se reguló»), queda en el perfil como apoyo efectivo [PCD Fase 2.3].

    Alimenta «Qué puedo hacer ahora» (`engine/support.py`), que muestra primero lo
    que ya le sirvió. No se duplica si el apoyo ya estaba registrado.
    """
    if req.strategy_outcome != EFFECTIVE_OUTCOME:
        return
    applied = [*(req.strategy_applied or []), req.support_used, req.sensory_activity]
    applied = [text.strip() for text in applied if text and text.strip() and text.strip() not in {"Otro", "Otra", "Ninguno"}]
    if not applied:
        return
    repository = SubjectRepository(subject_root(subject_id))
    profile = repository.get(subject_id)
    supports = list(profile.get("historical_supports") or [])
    known = {str(support.get("description", "")).strip().rstrip(".").lower(): support for support in supports}
    for text in applied:
        existing = known.get(text.rstrip(".").lower())
        if existing is not None:
            existing["effective"] = True
            continue
        support = {
            "id": f"sup_evt_{uuid.uuid4().hex[:8]}",
            "description": text,
            "type": "historical",
            "effective": True,
            "source": "event_outcome",
        }
        supports.append(support)
        known[text.lower()] = support
    repository.save({**profile, "historical_supports": supports})


@router.post("/{subject_id}/end-of-day", status_code=201)
def save_end_of_day(subject_id: str, req: CareRecordWrite, actor: ActorContext = Depends(get_care_actor)) -> dict[str, Any]:
    occurred_at = require_aware(req.occurred_at)
    profile = subject_profile(subject_id)
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
    return care_repository(subject_id).save(subject_id, "records", item, "record_id")


@router.post("/{subject_id}/planned-events", status_code=201)
def save_planned_event(subject_id: str, req: PlannedEventWrite, actor: ActorContext = Depends(get_care_actor)) -> dict[str, Any]:
    starts_at = require_aware(req.starts_at, field_name="starts_at")
    item = req.model_dump(mode="json", exclude_none=True)
    item["idempotency_key"] = req.idempotency_key or uuid.uuid4().hex
    item.update({
        "contract_version": "2.0",
        "subject_id": subject_id,
        "author_id": actor.actor_id,
        "source_timestamp": starts_at.isoformat(),
        "availability_timestamp": starts_at.isoformat(),
    })
    return care_repository(subject_id).save(subject_id, "planned_events", item, "planned_event_id")


@router.get("/{subject_id}/planned-events")
def list_planned_events(subject_id: str) -> list[dict[str, Any]]:
    """Eventos planificados del infante (los próximos se muestran en Planificación)."""
    repo = care_repository(subject_id)  # resuelve real vs demo y devuelve 404 si no existe
    planned = repo.list(subject_id, "planned_events")
    if is_demo_subject(subject_id):
        planned = load_legacy_planned_events(subject_id) + planned
    return planned


def _refresh_daily_event_counts(subject_id: str, occurred_at: datetime, author_id: str) -> None:
    """Recalcula event_count/dysregulation_count/max_intensity en el registro diario local.

    Si no existe un registro diario para el día local del evento, crea uno mínimo
    para que el motor pueda consumir el conteo como variable.
    """
    profile = subject_profile(subject_id)
    local_zone = zoneinfo.ZoneInfo(profile["timezone"])
    local_date_str = occurred_at.astimezone(local_zone).date().isoformat()

    repo = care_repository(subject_id)
    occurrences = repo.list(subject_id, "occurrences")
    records = repo.list(subject_id, "records")

    def _local_date(timestamp: str) -> str:
        return datetime.fromisoformat(timestamp).astimezone(local_zone).date().isoformat()

    day_occurrences = [occ for occ in occurrences if _local_date(occ["source_timestamp"]) == local_date_str]

    event_count = len(day_occurrences)
    dysregulation_events = [occ for occ in day_occurrences if occ.get("event_type") == DYREGULATION_EVENT_TYPE]
    dysregulation_count = len(dysregulation_events)
    intensities = [
        occ["intensity_value"]
        for occ in day_occurrences
        if isinstance(occ.get("intensity_value"), (int, float))
    ]
    max_intensity = max(intensities) if intensities else 0
    # Detalle de las hojas de registro (disparadores, estrategias, resultado):
    # lo que se marca en una desregulación se cuenta y entra al modelo como señal.
    trigger_count = sum(len(occ.get("trigger") or []) for occ in dysregulation_events)
    strategy_count = sum(len(occ.get("strategy_applied") or []) for occ in dysregulation_events)
    dysregulation_unresolved = sum(
        1 for occ in dysregulation_events if occ.get("strategy_outcome") == UNRESOLVED_OUTCOME
    )

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

    counts: dict[str, float] = {
        "event_count": event_count,
        "dysregulation_count": dysregulation_count,
        "max_intensity": max_intensity,
        "trigger_count": trigger_count,
        "strategy_count": strategy_count,
        "dysregulation_unresolved": dysregulation_unresolved,
    }
    # Escalas de Transición, Alimentación y Dieta sensorial: solo si ese día hubo
    # un evento de ese tipo con escala; si no, el campo queda ausente (no es un 0).
    for event_type, (field, mapping) in EVENT_SCALE_ENCODINGS.items():
        values = [
            mapping[occ["qualitative_outcome"]]
            for occ in day_occurrences
            if occ.get("event_type") == event_type and occ.get("qualitative_outcome") in mapping
        ]
        if values:
            counts[field] = max(values)

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

    write_json_atomic(subject_root(subject_id) / subject_id / "records.json", records)


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
    #    A demo also shows its synthetic history, the same one the model reads.
    repo = care_repository(subject_id)
    records = repo.list(subject_id, "records")
    occurrences = repo.list(subject_id, "occurrences")
    if is_demo_subject(subject_id):
        legacy_records, legacy_occurrences = load_legacy_history(subject_id)
        records = legacy_records + records
        occurrences = legacy_occurrences + occurrences

    # 3. Filter cutoff-safe records in window [as_of - days, as_of]
    eligible_records = []
    start_time = as_of_dt - timedelta(days=days)
    
    for r in records:
        if is_cutoff_eligible(r, start_time, as_of_dt):
            source_timestamp = datetime.fromisoformat(r["source_timestamp"])
            eligible_records.append({
                "entry_id": r.get("record_id") or r.get("id"), "kind": "daily_record", "timestamp": source_timestamp.isoformat(),
                "title": "Daily record", "detail": None, "semantic": "neutral", "payload": r,
            })

    for event in occurrences:
        if is_cutoff_eligible(event, start_time, as_of_dt):
            source_timestamp = datetime.fromisoformat(event["source_timestamp"])
            eligible_records.append({
                "entry_id": event.get("event_id") or event.get("id"), "kind": "event",
                "timestamp": source_timestamp.isoformat(),
                "title": event.get("event_type", "Crisis confirmada"), "detail": None, "semantic": "neutral", "payload": event,
            })

    # Sort descending by source timestamp (as instants: entries can carry different UTC offsets)
    eligible_records.sort(key=lambda x: datetime.fromisoformat(x["timestamp"]), reverse=True)
    return {"subject_id": subject_id, "as_of": as_of_dt.isoformat(), "days": days, "entries": eligible_records}


def require_subject_access(subject_id: str, actor: ActorContext) -> dict[str, Any]:
    profile = subject_profile(subject_id)
    if actor.role == "system":
        return profile
    permitted = profile.get("authorized_tutor_ids", [])
    if actor.actor_id not in permitted:
        raise HTTPException(status_code=403, detail="Actor is not authorized for this subject.")
    return profile


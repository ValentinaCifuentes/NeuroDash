import re
import zoneinfo
from datetime import datetime, timezone, timedelta
from typing import Any
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ml.promotion import write_json_atomic
from backend.app.prediction_service import get_subject_paths, load_subject_data, SubjectNotFoundError
from backend.app.care_repository import SubjectRepository

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
        "historical_supports": req.historical_supports
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


@router.get("/{subject_id}/timeline")
def get_subject_timeline(
    subject_id: str,
    as_of: str = Query(..., description="Timezone-aware datetime string"),
    days: int = Query(7, ge=1)
) -> list[dict[str, Any]]:
    # 1. Parse aware as_of
    try:
        as_of_dt = datetime.fromisoformat(as_of)
        if as_of_dt.tzinfo is None:
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=422, detail="as_of must be a timezone-aware ISO timestamp.")

    # 2. Load data
    try:
        _, records, _ = load_subject_data(subject_id)
    except SubjectNotFoundError:
        raise HTTPException(status_code=404, detail=f"Subject {subject_id} not found.")

    # 3. Filter cutoff-safe records in window [as_of - days, as_of]
    eligible_records = []
    start_time = as_of_dt - timedelta(days=days)
    
    for r in records:
        # Check cutoff-safety
        if r["availability_timestamp"] <= as_of_dt:
            # Check window
            if start_time <= r["source_timestamp"] <= as_of_dt:
                # Convert back datetime to iso string for JSON serialization
                r_serial = r.copy()
                r_serial["source_timestamp"] = r["source_timestamp"].isoformat()
                r_serial["availability_timestamp"] = r["availability_timestamp"].isoformat()
                eligible_records.append(r_serial)

    # Sort descending by source timestamp
    eligible_records.sort(key=lambda x: x["source_timestamp"], reverse=True)
    return eligible_records

import zoneinfo
from datetime import datetime, timezone, timedelta
from typing import Any
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ml.promotion import write_json_atomic
from backend.app.prediction_service import get_subject_paths, load_subject_data, SubjectNotFoundError

router = APIRouter(prefix="/api/v1/subjects", tags=["Subjects"])


class OnboardSubjectRequest(BaseModel):
    subject_id: str = Field(..., min_length=1)
    timezone: str
    sensory_context: dict[str, Any] = Field(default_factory=dict)
    habitual_context: dict[str, Any] = Field(default_factory=dict)
    historical_supports: list[dict[str, Any]] = Field(default_factory=list)


class OnboardSubjectResponse(BaseModel):
    subject_id: str
    timezone: str
    cold_start: bool = True
    provisional_baseline: dict[str, Any] = Field(default_factory=dict)


@router.post("", response_model=OnboardSubjectResponse, status_code=201)
def onboard_subject(req: OnboardSubjectRequest) -> OnboardSubjectResponse:
    # 1. Validate timezone
    try:
        zoneinfo.ZoneInfo(req.timezone)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid IANA timezone: {req.timezone}")

    # 2. Save subject profile atomically
    proj_root = Path(__file__).resolve().parents[3]
    subject_dir = proj_root / "data" / "subjects" / req.subject_id
    subject_dir.mkdir(parents=True, exist_ok=True)

    profile_data = {
        "subject_id": req.subject_id,
        "timezone": req.timezone,
        "sensory_context": req.sensory_context,
        "habitual_context": req.habitual_context,
        "historical_supports": req.historical_supports
    }

    # Initialize empty records and occurrences
    write_json_atomic(subject_dir / "profile.json", profile_data)
    if not (subject_dir / "records.json").exists():
        write_json_atomic(subject_dir / "records.json", [])
    if not (subject_dir / "occurrences.json").exists():
        write_json_atomic(subject_dir / "occurrences.json", [])

    return OnboardSubjectResponse(
        subject_id=req.subject_id,
        timezone=req.timezone,
        cold_start=True,
        provisional_baseline={}
    )


@router.get("/{subject_id}")
def get_subject(subject_id: str) -> dict[str, Any]:
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

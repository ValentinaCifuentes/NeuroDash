import json
from datetime import datetime
from typing import Any
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.app.schemas import ActorContext, PredictionContractV2, ProvenanceV2
from backend.app.prediction_service import make_prediction, SubjectNotFoundError
from ml.promotion import record_prediction_outcome
from backend.app.routes import subjects
from backend.app.routes.subjects import get_care_actor, require_subject_access

router = APIRouter(prefix="/api/v1/predictions", tags=["Predictions"])


class PredictionRequest(BaseModel):
    subject_id: str = Field(..., min_length=1)
    prediction_cutoff: str
    school_records: list[dict[str, Any]] | None = None


class OutcomeRequest(BaseModel):
    actual_outcome: bool
    idempotency_key: str = Field(min_length=1)
    provenance: ProvenanceV2


@router.post("", response_model=PredictionContractV2)
def create_prediction(req: PredictionRequest) -> PredictionContractV2:
    # 1. Parse aware prediction_cutoff
    try:
        cutoff_dt = datetime.fromisoformat(req.prediction_cutoff)
        if cutoff_dt.tzinfo is None:
            raise ValueError()
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="prediction_cutoff must be a timezone-aware ISO timestamp (e.g. 2026-08-26T12:00:00Z)."
        )

    # 2. Run prediction service
    try:
        _, contract = make_prediction(
            subject_id=req.subject_id,
            prediction_cutoff=cutoff_dt,
            school_records=req.school_records
        )
        return contract
    except SubjectNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Subject {req.subject_id} not found."
        )
    except Exception as e:
        # FastAPI will catch and error handler will sanitize to 500
        raise e


def find_subject_dir_by_prediction_id(prediction_id: str) -> Path:
    proj_root = Path(__file__).resolve().parents[3]

    for subject_root in (subjects.SUBJECTS_ROOT, proj_root / "data" / "demo_profiles"):
        if subject_root.exists():
            for path in subject_root.iterdir():
                if path.is_dir() and (path / "predictions" / f"{prediction_id}.json").exists():
                    return path
                
    raise HTTPException(status_code=404, detail=f"Prediction {prediction_id} not found.")


@router.get("/{prediction_id}", response_model=PredictionContractV2)
def get_prediction(prediction_id: str, actor: ActorContext = Depends(get_care_actor)) -> PredictionContractV2:
    subject_dir = find_subject_dir_by_prediction_id(prediction_id)
    require_subject_access(subject_dir.name, actor)
    with open(subject_dir / "predictions" / f"{prediction_id}.json", encoding="utf-8") as snapshot_file:
        return PredictionContractV2(**json.load(snapshot_file))


@router.post("/{prediction_id}/outcome", status_code=201)
def confirm_outcome(prediction_id: str, req: OutcomeRequest, actor: ActorContext = Depends(get_care_actor)) -> dict[str, Any]:
    # 1. Find the subject directory that owns this prediction
    subject_dir = find_subject_dir_by_prediction_id(prediction_id)
    require_subject_access(subject_dir.name, actor)
    
    # 2. Record outcome
    try:
        return record_prediction_outcome(
            prediction_id=prediction_id,
            actual_outcome=req.actual_outcome,
            subject_dir=subject_dir,
            actor_id=actor.actor_id,
            idempotency_key=req.idempotency_key,
            provenance=req.provenance.model_dump(),
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Prediction {prediction_id} not found.")

from datetime import datetime
from typing import Any
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.schemas import PredictionContractV2
from backend.app.prediction_service import make_prediction, SubjectNotFoundError
from ml.promotion import record_prediction_outcome

router = APIRouter(prefix="/api/v1/predictions", tags=["Predictions"])


class PredictionRequest(BaseModel):
    subject_id: str = Field(..., min_length=1)
    prediction_cutoff: str
    school_records: list[dict[str, Any]] | None = None


class OutcomeRequest(BaseModel):
    actual_outcome: bool


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
    
    # Check general subjects
    subjects_dir = proj_root / "data" / "subjects"
    if subjects_dir.exists():
        for path in subjects_dir.iterdir():
            if path.is_dir() and (path / "predictions" / f"{prediction_id}.json").exists():
                return path
                
    # Check demo profiles
    demo_dir = proj_root / "data" / "demo_profiles"
    if demo_dir.exists():
        for path in demo_dir.iterdir():
            if path.is_dir() and (path / "predictions" / f"{prediction_id}.json").exists():
                return path
                
    raise HTTPException(status_code=404, detail=f"Prediction {prediction_id} not found.")


@router.post("/{prediction_id}/outcome")
def confirm_outcome(prediction_id: str, req: OutcomeRequest) -> dict[str, str]:
    # 1. Find the subject directory that owns this prediction
    subject_dir = find_subject_dir_by_prediction_id(prediction_id)
    
    # 2. Record outcome
    try:
        record_prediction_outcome(
            prediction_id=prediction_id,
            actual_outcome=req.actual_outcome,
            subject_dir=subject_dir
        )
        return {"status": "success", "message": f"Outcome recorded for prediction {prediction_id}."}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Prediction {prediction_id} not found.")

from datetime import datetime, timezone, timedelta
from typing import Any
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.schemas import PredictionContractV2
from backend.app.prediction_service import make_prediction, load_subject_data, SubjectNotFoundError
from ml.dataset_builder import build_dataset
from ml.trainer import train_model, InsufficientDataError
from ml.model_registry import ModelRegistry
from ml.promotion import evaluate_and_promote_model
from engine.temporal import AvailabilityPolicy

router = APIRouter(prefix="/api/v1/demo/profiles", tags=["Demo Profiles"])


class DemoPredictRequest(BaseModel):
    prediction_cutoff: str


@router.post("/{subject_id}/predict", response_model=PredictionContractV2)
def demo_predict(subject_id: str, req: DemoPredictRequest) -> PredictionContractV2:
    # 1. Parse aware prediction_cutoff
    try:
        cutoff_dt = datetime.fromisoformat(req.prediction_cutoff)
        if cutoff_dt.tzinfo is None:
            raise ValueError()
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="prediction_cutoff must be a timezone-aware ISO timestamp."
        )

    # 2. Run prediction service (will check demo directory naturally)
    try:
        _, contract = make_prediction(
            subject_id=subject_id,
            prediction_cutoff=cutoff_dt
        )
        return contract
    except SubjectNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Demo profile {subject_id} not found."
        )


@router.post("/{subject_id}/retrain")
def demo_retrain(subject_id: str) -> dict[str, Any]:
    # 1. Load data
    try:
        profile, records, occurrences = load_subject_data(subject_id)
    except SubjectNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Demo profile {subject_id} not found."
        )

    timezone_name = profile["timezone"]

    if not records:
        raise HTTPException(
            status_code=422,
            detail="Cannot retrain model: subject has no historical records."
        )

    # 2. Generate cutoffs spanning the dataset daily
    records_sorted = sorted(records, key=lambda x: x["source_timestamp"])
    min_date = records_sorted[0]["source_timestamp"]
    max_date = records_sorted[-1]["source_timestamp"]

    total_days = (max_date - min_date).days
    if total_days < 7:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot retrain model: historical records must span at least 7 days. Got {total_days} days."
        )

    # Generate daily cutoffs starting from min_date + 3 days (to allow baseline accumulation)
    cutoffs = [min_date + timedelta(days=d) for d in range(3, total_days + 1)]
    
    # Temporally split training and validation: last 7 days (or 2 days if dataset is short) for validation
    if total_days >= 14:
        split_cutoff = max_date - timedelta(days=7)
    else:
        split_cutoff = max_date - timedelta(days=2)

    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")

    # 3. Build dataset
    try:
        X_train, y_train, X_val, y_val, lineage = build_dataset(
            records=records,
            occurrences=occurrences,
            cutoffs=cutoffs,
            split_cutoff=split_cutoff,
            policy=policy,
            timezone=timezone_name,
            subject_id=subject_id
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error preparing dataset: {str(e)}"
        )

    # 4. Train candidate model
    try:
        candidate_model, candidate_features, candidate_metadata = train_model(
            X_train=X_train,
            y_train=y_train,
            seed=42,
            min_samples=3, # Lower threshold for demo/test flexibility
            min_positive_labels=1
        )
    except InsufficientDataError as e:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient data to train: {str(e)}"
        )

    # 5. Evaluate and promote
    proj_root = Path(__file__).resolve().parents[3]
    models_dir = proj_root / "models"
    registry = ModelRegistry(base_dir=models_dir)
    
    config_path = proj_root / "config" / "promotion.yaml"
    
    subject_dir = proj_root / "data" / "demo_profiles" / subject_id
    audit_path = subject_dir / "audit.json"

    promoted, audit_record = evaluate_and_promote_model(
        subject_id=subject_id,
        candidate_model=candidate_model,
        candidate_features=candidate_features,
        candidate_metadata=candidate_metadata,
        X_val=X_val,
        y_val=y_val,
        registry=registry,
        config_path=config_path,
        audit_path=audit_path
    )

    return {
        "promoted": promoted,
        "audit_record": audit_record
    }

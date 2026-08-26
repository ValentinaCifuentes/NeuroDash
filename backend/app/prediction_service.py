import uuid
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from engine.temporal import AvailabilityPolicy
from engine.baseline import build_baseline
from engine.features import build_features
from engine.confidence import calculate_confidence
from engine.abstention import should_abstain
from engine.explanation import generate_non_causal_factors
from engine.support import select_supports
from engine.provenance import build_provenance

from ml.model_registry import ModelRegistry, ModelAbstentionError
from ml.inference import predict_risk
from ml.explain import explain_prediction
from ml.promotion import write_json_atomic

from backend.app.schemas import PredictionContractV2
from engine.schemas import ConfidenceLevel


class SubjectNotFoundError(ValueError):
    """Raised when a requested subject is not found in data stores."""
    pass


def get_subject_paths(subject_id: str) -> tuple[Path, bool]:
    """
    Returns the path to the subject directory and a boolean indicating if it's a demo subject.
    """
    proj_root = Path(__file__).resolve().parents[2]
    
    # 1. Check demo profiles
    demo_dir = proj_root / "data" / "demo_profiles" / subject_id
    if demo_dir.exists():
        return demo_dir, True
        
    # 2. Check general subjects
    subject_dir = proj_root / "data" / "subjects" / subject_id
    if subject_dir.exists():
        return subject_dir, False
        
    raise SubjectNotFoundError(f"Subject {subject_id} not found.")


def load_subject_data(subject_id: str) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Loads subject profile, historical records, and occurrences.
    """
    subject_dir, is_demo = get_subject_paths(subject_id)
    proj_root = Path(__file__).resolve().parents[2]

    # Load profile
    profile_path = subject_dir / "profile.json"
    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)

    records = []
    occurrences = []

    if is_demo:
        # Load from data/bluba/{subject_id}_history.json
        history_path = proj_root / "data" / "bluba" / f"{subject_id}_history.json"
        if history_path.exists():
            with open(history_path, "r", encoding="utf-8") as f:
                history = json.load(f)
                records = history.get("records", [])
                occurrences = history.get("occurrences", [])
    else:
        # Load from subject directory
        records_path = subject_dir / "records.json"
        if records_path.exists():
            with open(records_path, "r", encoding="utf-8") as f:
                records = json.load(f)
        
        occurrences_path = subject_dir / "occurrences.json"
        if occurrences_path.exists():
            with open(occurrences_path, "r", encoding="utf-8") as f:
                occurrences = json.load(f)

    # Convert timestamps to aware datetimes
    def parse_dt(dt_str: str) -> datetime:
        dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            # Assume UTC if naive, but theoretically all stored timestamps must be aware
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    for r in records:
        r["source_timestamp"] = parse_dt(r["source_timestamp"])
        r["availability_timestamp"] = parse_dt(r["availability_timestamp"])

    for o in occurrences:
        o["source_timestamp"] = parse_dt(o["source_timestamp"])
        o["availability_timestamp"] = parse_dt(o["availability_timestamp"])

    return profile, records, occurrences


def make_prediction(
    subject_id: str,
    prediction_cutoff: datetime,
    school_records: list[dict[str, Any]] | None = None
) -> tuple[str, PredictionContractV2]:
    """
    Orchestrates prediction lifecycle:
    1. Loads data
    2. Builds features
    3. Evaluates models and safety policies
    4. Records snapshot
    """
    # 0. Check timezone aware cutoff
    if prediction_cutoff.tzinfo is None:
        raise ValueError("prediction_cutoff must be timezone-aware")

    # 1. Load data
    profile, records, occurrences = load_subject_data(subject_id)
    
    timezone_name = profile["timezone"]
    sensory_context = profile.get("sensory_context", {})
    habitual_context = profile.get("habitual_context", {})
    historical_supports = profile.get("historical_supports", [])

    # 2. Build baseline and features
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    baseline = build_baseline(records, prediction_cutoff, policy=policy, timezone=timezone_name)
    features = build_features(records, baseline, prediction_cutoff, policy=policy, timezone=timezone_name, subject=profile)

    # 3. Model registry
    proj_root = Path(__file__).resolve().parents[2]
    models_dir = proj_root / "models"
    registry = ModelRegistry(base_dir=models_dir)

    # Check active model
    active_model_exists = True
    model_artifact = None
    try:
        model_artifact = registry.load_model(subject_id)
    except ModelAbstentionError:
        active_model_exists = False

    # Calculate confidence based on feature missingness
    confidence = calculate_confidence(features.missingness)

    # Check safety / abstention policy
    abstain, reason = False, None
    if not active_model_exists:
        abstain = True
        reason = "No active model trained for this subject."
    else:
        abstain, reason = should_abstain(features.baseline_maturity, confidence)

    # Determine school record exclusion
    has_school_records = school_records is not None and len(school_records) > 0

    prediction_id = uuid.uuid4().hex

    if abstain:
        # Build abstained contract response
        prov = build_provenance(subject_id, has_school_records=has_school_records, lineage=None)
        supports = select_supports(
            historical_supports,
            sensory_context,
            habitual_context=habitual_context,
            missingness=features.missingness,
            confidence=ConfidenceLevel.INSUFFICIENT,
            abstained=True,
            recent_records=records[-7:],
            recent_occurrences=occurrences[-7:],
        )
        
        contract = PredictionContractV2(
            subject_id=subject_id,
            prediction_cutoff=prediction_cutoff,
            horizon_hours=24,
            risk=None,
            model_score=None,
            confidence=ConfidenceLevel.INSUFFICIENT,
            abstained=True,
            factors=[],
            missingness=features.missingness,
            supports=supports,
            provenance=prov,
            versions={
                "model_version": "none",
                "policy_hash": "default",
                "code_version": "0.1.0"
            }
        )
    else:
        # Run inference
        score, risk_tier = predict_risk(registry, subject_id, features.rolling_features)
        
        # Run explanation
        model = model_artifact["model"]
        feat_names = model_artifact["features"]
        metadata = model_artifact["metadata"]
        
        raw_explanations = explain_prediction(model, feat_names, features.rolling_features)
        factors = generate_non_causal_factors(raw_explanations)
        
        # Select supports
        supports = select_supports(
            historical_supports,
            sensory_context,
            habitual_context=habitual_context,
            factors=factors,
            missingness=features.missingness,
            confidence=confidence,
            abstained=False,
            recent_records=records[-7:],
            recent_occurrences=occurrences[-7:],
        )
        
        # Build provenance
        prov = build_provenance(subject_id, has_school_records=has_school_records, lineage=metadata)
        
        contract = PredictionContractV2(
            subject_id=subject_id,
            prediction_cutoff=prediction_cutoff,
            horizon_hours=24,
            risk=risk_tier,
            model_score=score,
            confidence=confidence,
            abstained=False,
            factors=factors,
            missingness=features.missingness,
            supports=supports,
            provenance=prov,
            versions={
                "model_version": str(metadata.get("version", 1)),
                "policy_hash": "default",
                "code_version": "0.1.0"
            }
        )

    # 4. Save prediction snapshot for future outcomes
    subject_dir, _ = get_subject_paths(subject_id)
    predictions_dir = subject_dir / "predictions"
    predictions_dir.mkdir(parents=True, exist_ok=True)
    
    snapshot = {
        "prediction_id": prediction_id,
        "subject_id": subject_id,
        "prediction_cutoff": prediction_cutoff.isoformat(),
        "features": features.rolling_features,
        "risk": contract.risk,
        "model_score": contract.model_score
    }
    
    snapshot_path = predictions_dir / f"{prediction_id}.json"
    write_json_atomic(snapshot_path, snapshot)

    return prediction_id, contract

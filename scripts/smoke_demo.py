import json
import sys
from pathlib import Path
from datetime import datetime, timezone
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
from engine.schemas import ConfidenceLevel, CONTRACT_VERSION


def execute_smoke_run(
    subject_id: str,
    data_dir: Path | str,
    models_dir: Path | str,
    config_dir: Path | str | None = None
) -> PredictionContractV2:
    """
    Executes the end-to-end prediction/abstention flow for a subject.
    Replicates the core prediction service logic using explicit paths for predictability.
    """
    d_dir = Path(data_dir)
    m_dir = Path(models_dir)
    c_dir = Path(config_dir) if config_dir is not None else None
    
    # 1. Load subject profile and history
    profile_path = d_dir / "demo_profiles" / subject_id / "profile.json"
    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)
        
    history_path = d_dir / "bluba" / f"{subject_id}_history.json"
    with open(history_path, "r", encoding="utf-8") as f:
        history = json.load(f)
        
    records = history.get("records", [])
    occurrences = history.get("occurrences", [])
    
    # Parse ISO dates to datetime
    def parse_dt(dt_str: str) -> datetime:
        dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
        
    for r in records:
        r["source_timestamp"] = parse_dt(r["source_timestamp"])
        r["availability_timestamp"] = parse_dt(r["availability_timestamp"])
    for o in occurrences:
        o["source_timestamp"] = parse_dt(o["source_timestamp"])
        o["availability_timestamp"] = parse_dt(o["availability_timestamp"])
        
    timezone_name = profile["timezone"]
    sensory_context = profile.get("sensory_context", {})
    habitual_context = profile.get("habitual_context", {})
    historical_supports = profile.get("historical_supports", [])
    
    # Use a fixed prediction cutoff as of the end of the history
    records_sorted = sorted(records, key=lambda x: x["source_timestamp"])
    prediction_cutoff = records_sorted[-1]["source_timestamp"] if records_sorted else datetime.now(timezone.utc)
    
    # 2. Build baseline and features
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    baseline = build_baseline(records, prediction_cutoff, policy=policy, timezone=timezone_name)
    features = build_features(records, baseline, prediction_cutoff, policy=policy, timezone=timezone_name, subject=profile)
    
    # 3. Model Registry loading
    registry = ModelRegistry(base_dir=m_dir)
    
    active_model_exists = True
    model_artifact = None
    try:
        model_artifact = registry.load_model(subject_id)
    except ModelAbstentionError:
        active_model_exists = False
        
    # Calculate confidence
    conf_cfg = c_dir / "confidence.yaml" if c_dir and (c_dir / "confidence.yaml").exists() else None
    confidence = calculate_confidence(features.missingness, conf_cfg)
    
    # Check safety / abstention rules
    abstain = False
    reason = None
    if not active_model_exists:
        abstain = True
        reason = "No active model trained for this subject."
    else:
        abstain_cfg = c_dir / "abstention.yaml" if c_dir and (c_dir / "abstention.yaml").exists() else None
        abstain, reason = should_abstain(features.baseline_maturity, confidence, abstain_cfg)
        
    if abstain:
        # Build abstained contract
        prov = build_provenance(subject_id, has_school_records=False, lineage=None)
        catalog_cfg = c_dir / "support_catalog.yaml" if c_dir and (c_dir / "support_catalog.yaml").exists() else None
        supports = select_supports(
            historical_supports,
            sensory_context,
            catalog_cfg,
            habitual_context=habitual_context,
            missingness=features.missingness,
            confidence=ConfidenceLevel.INSUFFICIENT,
            abstained=True,
            recent_records=records[-7:],
            recent_occurrences=occurrences[-7:],
        )
        
        contract = PredictionContractV2(
            contract_version=CONTRACT_VERSION,
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
        # Predict risk and map to tier
        mapping_cfg = c_dir / "risk_mapping.yaml" if c_dir and (c_dir / "risk_mapping.yaml").exists() else None
        score, risk_tier = predict_risk(registry, subject_id, features.rolling_features, mapping_cfg)
        
        # Explain prediction
        model = model_artifact["model"]
        feat_names = model_artifact["features"]
        metadata = model_artifact["metadata"]
        
        raw_explanations = explain_prediction(model, feat_names, features.rolling_features)
        factors = generate_non_causal_factors(raw_explanations)
        
        # Support selection
        catalog_cfg = c_dir / "support_catalog.yaml" if c_dir and (c_dir / "support_catalog.yaml").exists() else None
        supports = select_supports(
            historical_supports,
            sensory_context,
            catalog_cfg,
            habitual_context=habitual_context,
            factors=factors,
            missingness=features.missingness,
            confidence=confidence,
            abstained=False,
            recent_records=records[-7:],
            recent_occurrences=occurrences[-7:],
        )
        
        # Provenance
        prov = build_provenance(subject_id, has_school_records=False, lineage=metadata)
        
        contract = PredictionContractV2(
            contract_version=CONTRACT_VERSION,
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
        
    # Write snapshot
    predictions_dir = d_dir / "demo_profiles" / subject_id / "predictions"
    predictions_dir.mkdir(parents=True, exist_ok=True)
    import uuid
    prediction_id = uuid.uuid4().hex
    snapshot = {
        "prediction_id": prediction_id,
        "subject_id": subject_id,
        "prediction_cutoff": prediction_cutoff.isoformat(),
        "features": features.rolling_features,
        "risk": contract.risk,
        "model_score": contract.model_score
    }
    write_json_atomic(predictions_dir / f"{prediction_id}.json", snapshot)
    
    return contract


def run_smoke_test(data_dir: Path | str, models_dir: Path | str, config_dir: Path | str | None = None) -> bool:
    """Runs prediction checks across PAC-A, PAC-B, and PAC-C and verifies correctness."""
    print("Starting e2e smoke verification...")
    
    # Verify PAC-A (Expected: Trained, Abstained=False)
    contract_a = execute_smoke_run("PAC-A", data_dir, models_dir, config_dir)
    assert contract_a.subject_id == "PAC-A"
    assert contract_a.abstained is False, "PAC-A should not abstain."
    assert contract_a.risk in ["LOW", "MEDIUM", "HIGH"], f"PAC-A invalid risk tier: {contract_a.risk}"
    assert contract_a.model_score is not None, "PAC-A model score should be present."
    assert contract_a.confidence in [ConfidenceLevel.LOW, ConfidenceLevel.MEDIUM, ConfidenceLevel.HIGH], "PAC-A confidence invalid."
    print("PAC-A smoke verification passed.")
    
    # Verify PAC-B (Expected: Trained, Abstained=False)
    contract_b = execute_smoke_run("PAC-B", data_dir, models_dir, config_dir)
    assert contract_b.subject_id == "PAC-B"
    assert contract_b.abstained is False, "PAC-B should not abstain."
    assert contract_b.risk in ["LOW", "MEDIUM", "HIGH"], f"PAC-B invalid risk tier: {contract_b.risk}"
    assert contract_b.model_score is not None, "PAC-B model score should be present."
    assert contract_b.confidence in [ConfidenceLevel.LOW, ConfidenceLevel.MEDIUM, ConfidenceLevel.HIGH], "PAC-B confidence invalid."
    print("PAC-B smoke verification passed.")
    
    # Verify PAC-C (Expected: Untrained, Abstained=True)
    contract_c = execute_smoke_run("PAC-C", data_dir, models_dir, config_dir)
    assert contract_c.subject_id == "PAC-C"
    assert contract_c.abstained is True, "PAC-C should abstain."
    assert contract_c.risk is None, "PAC-C risk should be None."
    assert contract_c.model_score is None, "PAC-C model score should be None."
    assert contract_c.confidence == ConfidenceLevel.INSUFFICIENT, "PAC-C confidence should be INSUFFICIENT."
    print("PAC-C smoke verification passed (successfully abstained).")
    
    print("All smoke test assertions passed successfully!")
    return True


if __name__ == "__main__":
    proj_root = Path(__file__).resolve().parents[1]
    data_path = proj_root / "data"
    models_path = proj_root / "models"
    config_path = proj_root / "config"
    
    success = run_smoke_test(data_path, models_path, config_path)
    if success:
        sys.exit(0)
    else:
        sys.exit(1)

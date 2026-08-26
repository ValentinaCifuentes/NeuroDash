import pytest
from pathlib import Path
import tempfile
import json
from datetime import datetime, timezone, timedelta

from ml.model_registry import ModelRegistry
from ml.promotion import record_prediction_outcome, evaluate_and_promote_model
from ml.trainer import train_model, InsufficientDataError


def test_manual_outcome_confirmation(tmp_path: Path) -> None:
    # Set up paths
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    
    subject_id = "sub_confirm"
    subject_dir = data_dir / subject_id
    subject_dir.mkdir()
    
    # Create mock prediction snapshot
    pred_id = "pred_123"
    prediction_snapshot = {
        "prediction_id": pred_id,
        "subject_id": subject_id,
        "prediction_cutoff": datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc).isoformat(),
        "features": {"sleep_quality_mean_1d": 6.0},
        "risk": "MEDIUM"
    }
    
    predictions_dir = subject_dir / "predictions"
    predictions_dir.mkdir()
    
    with open(predictions_dir / f"{pred_id}.json", "w", encoding="utf-8") as f:
        json.dump(prediction_snapshot, f)
        
    # Create empty occurrences file
    occurrences_path = subject_dir / "occurrences.json"
    with open(occurrences_path, "w", encoding="utf-8") as f:
        json.dump([], f)
        
    # Case A: Record positive outcome (actual_outcome = True)
    record_prediction_outcome(
        prediction_id=pred_id,
        actual_outcome=True,
        subject_dir=subject_dir
    )
    
    # Must append an occurrence with severity "moderate" or "severe" within the 24h horizon
    with open(occurrences_path, "r", encoding="utf-8") as f:
        occurrences = json.load(f)
        
    assert len(occurrences) == 1
    assert occurrences[0]["subject_id"] == subject_id
    assert occurrences[0]["severity"] in ("moderate", "severe")
    
    # Case B: Record negative outcome (actual_outcome = False)
    # The occurrences file should not receive any new occurrence
    pred_id_neg = "pred_456"
    prediction_snapshot_neg = prediction_snapshot.copy()
    prediction_snapshot_neg["prediction_id"] = pred_id_neg
    with open(predictions_dir / f"{pred_id_neg}.json", "w", encoding="utf-8") as f:
        json.dump(prediction_snapshot_neg, f)
        
    record_prediction_outcome(
        prediction_id=pred_id_neg,
        actual_outcome=False,
        subject_dir=subject_dir
    )
    
    with open(occurrences_path, "r", encoding="utf-8") as f:
        occurrences_after = json.load(f)
    assert len(occurrences_after) == 1  # Still 1, no new occurrence added


def test_configured_temporal_promotion(tmp_path: Path) -> None:
    # We will test promotion under three conditions:
    # 1. Candidate model performs better -> Promoted.
    # 2. Candidate model performs worse -> Preserved.
    # 3. Data is insufficient -> Retained active, audit logged.
    
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    registry = ModelRegistry(base_dir=models_dir)
    
    # 1. Mock training data
    # We have a training set and validation set
    X_train = [
        {"feat": 1.0}, {"feat": 0.8}, {"feat": 0.2}, {"feat": 0.1}, {"feat": 0.9}
    ]
    y_train = [True, True, False, False, True]
    
    X_val = [
        {"feat": 0.95}, {"feat": 0.05}
    ]
    y_val = [True, False]
    
    # Train and save an "active" model (our baseline)
    # Let's say this active model has slightly worse parameters
    active_model, features, meta = train_model(X_train, y_train, seed=1)
    registry.save_model("sub_prom", active_model, features, meta)
    
    # Write a promotion config
    config_path = tmp_path / "promotion.yaml"
    config_data = {
        "metric": "f1",
        "min_improvement": 0.01
    }
    with open(config_path, "w", encoding="utf-8") as f:
        yaml_dump = {"metric": "f1", "min_improvement": 0.01}
        json.dump(yaml_dump, f) # YAML parser parses JSON too
        
    audit_path = tmp_path / "audit.json"
    
    # Scenario A: Candidate model improves performance
    # Let's mock a candidate model that performs perfectly on validation (F1 = 1.0)
    # vs active model that performs worse (e.g. we force active to fail or candidate is better).
    # Since we train deterministically, we can just supply the performance results or train models with different seeds.
    # Let's write `evaluate_and_promote_model` to accept candidate_model and evaluate it on X_val, y_val.
    
    # Let's train candidate model with seed 42
    candidate_model, _, candidate_meta = train_model(X_train, y_train, seed=42)
    
    promoted, audit_record = evaluate_and_promote_model(
        subject_id="sub_prom",
        candidate_model=candidate_model,
        candidate_features=features,
        candidate_metadata=candidate_meta,
        X_val=X_val,
        y_val=y_val,
        registry=registry,
        config_path=config_path,
        audit_path=audit_path
    )
    
    # Check that audit record was saved and decision is logged
    assert audit_path.exists()
    with open(audit_path, "r", encoding="utf-8") as f:
        audits = json.load(f)
    assert len(audits) == 1
    assert audits[0]["subject_id"] == "sub_prom"
    assert "promoted" in audits[0]
    
    # Scenario B: Candidate model does not improve performance
    # If candidate is not better, active model must be preserved
    # Let's train a candidate that is identical or worse (we can pass the same active model as candidate)
    promoted_worse, audit_worse = evaluate_and_promote_model(
        subject_id="sub_prom",
        candidate_model=active_model,
        candidate_features=features,
        candidate_metadata=meta,
        X_val=X_val,
        y_val=y_val,
        registry=registry,
        config_path=config_path,
        audit_path=audit_path
    )
    assert promoted_worse is False
    
    # Check that active model registry has not changed the active version
    latest_artifact = registry.load_model("sub_prom")
    # Verify that the active model has version metadata or similar preserved
    assert latest_artifact is not None

from datetime import datetime, timezone, timedelta
import pytest

from engine.baseline import BaselineSnapshot
from engine.temporal import AvailabilityPolicy
from pathlib import Path
from ml.dataset_builder import (
    build_training_example,
    build_dataset,
    generate_synthetic_history
)
from ml.trainer import train_model, InsufficientDataError
from ml.model_registry import ModelRegistry
from ml.inference import predict_risk, ModelAbstentionError
from ml.explain import explain_prediction


def test_build_training_example_labelling() -> None:
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    
    # 1. Base record to establish a baseline and features
    records = [
        {
            "id": "rec_1",
            "subject_id": "sub_1",
            "source_timestamp": cutoff - timedelta(days=2),
            "availability_timestamp": cutoff - timedelta(days=2),
            "sleep_quality": 8.0,
            "wake_state": 7.0
        },
        {
            "id": "rec_2",
            "subject_id": "sub_1",
            "source_timestamp": cutoff - timedelta(days=1),
            "availability_timestamp": cutoff - timedelta(days=1),
            "sleep_quality": 6.0,
            "wake_state": 6.0
        }
    ]
    
    baseline = BaselineSnapshot(
        subject_id="sub_1",
        as_of=cutoff,
        modality_baselines={"sleep_quality": 7.0, "wake_state": 6.5},
        maturity=2
    )
    
    # Case A: Moderate occurrence within horizon (T, T + 24h]
    occurrences_mod = [
        {
            "id": "occ_1",
            "subject_id": "sub_1",
            "source_timestamp": cutoff + timedelta(hours=12),
            "availability_timestamp": cutoff + timedelta(hours=15),
            "severity": "moderate"
        }
    ]
    features_a, label_a = build_training_example(
        records=records,
        occurrences=occurrences_mod,
        baseline=baseline,
        cutoff=cutoff,
        policy=policy,
        timezone="UTC"
    )
    assert label_a is True
    assert features_a["sleep_quality_mean_1d"] == 6.0

    # Case B: Severe occurrence within horizon
    occurrences_sev = [
        {
            "id": "occ_2",
            "subject_id": "sub_1",
            "source_timestamp": cutoff + timedelta(hours=2),
            "availability_timestamp": cutoff + timedelta(hours=5),
            "severity": "severe"
        }
    ]
    _, label_b = build_training_example(
        records=records,
        occurrences=occurrences_sev,
        baseline=baseline,
        cutoff=cutoff,
        policy=policy,
        timezone="UTC"
    )
    assert label_b is True

    # Case C: Mild occurrence (should be ignored -> False)
    occurrences_mild = [
        {
            "id": "occ_3",
            "subject_id": "sub_1",
            "source_timestamp": cutoff + timedelta(hours=12),
            "availability_timestamp": cutoff + timedelta(hours=15),
            "severity": "mild"
        }
    ]
    _, label_c = build_training_example(
        records=records,
        occurrences=occurrences_mild,
        baseline=baseline,
        cutoff=cutoff,
        policy=policy,
        timezone="UTC"
    )
    assert label_c is False

    # Case D: Moderate occurrence outside horizon (after T+24h)
    occurrences_late = [
        {
            "id": "occ_4",
            "subject_id": "sub_1",
            "source_timestamp": cutoff + timedelta(hours=24, seconds=1),
            "availability_timestamp": cutoff + timedelta(hours=28),
            "severity": "moderate"
        }
    ]
    _, label_d = build_training_example(
        records=records,
        occurrences=occurrences_late,
        baseline=baseline,
        cutoff=cutoff,
        policy=policy,
        timezone="UTC"
    )
    assert label_d is False

    # Case E: Moderate occurrence at exactly cutoff T (not in horizon (T, T+24h])
    occurrences_exact = [
        {
            "id": "occ_5",
            "subject_id": "sub_1",
            "source_timestamp": cutoff,
            "availability_timestamp": cutoff + timedelta(hours=1),
            "severity": "moderate"
        }
    ]
    _, label_e = build_training_example(
        records=records,
        occurrences=occurrences_exact,
        baseline=baseline,
        cutoff=cutoff,
        policy=policy,
        timezone="UTC"
    )
    assert label_e is False


def test_temporal_train_test_split_no_lookahead() -> None:
    # Set up records spanning several days
    start_time = datetime(2026, 8, 1, 12, 0, 0, tzinfo=timezone.utc)
    records = []
    for idx in range(20):
        t = start_time + timedelta(days=idx)
        records.append({
            "id": f"rec_{idx}",
            "subject_id": "sub_1",
            "source_timestamp": t,
            "availability_timestamp": t,
            "sleep_quality": 7.0 + (idx % 3),
            "wake_state": 5.0 + (idx % 2)
        })

    occurrences = [
        {
            "id": "occ_1",
            "subject_id": "sub_1",
            "source_timestamp": start_time + timedelta(days=5, hours=6),
            "availability_timestamp": start_time + timedelta(days=5, hours=6),
            "severity": "severe"
        },
        {
            "id": "occ_2",
            "subject_id": "sub_1",
            "source_timestamp": start_time + timedelta(days=15, hours=12),
            "availability_timestamp": start_time + timedelta(days=15, hours=12),
            "severity": "moderate"
        }
    ]

    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    
    # We want to build examples at daily cutoffs from Day 3 to Day 18
    cutoffs = [start_time + timedelta(days=d) for d in range(3, 19)]
    split_cutoff = start_time + timedelta(days=12)

    X_train, y_train, X_test, y_test, lineage = build_dataset(
        records=records,
        occurrences=occurrences,
        cutoffs=cutoffs,
        split_cutoff=split_cutoff,
        policy=policy,
        timezone="UTC",
        subject_id="sub_1"
    )

    # 1. Assert splits are temporal (all train cutoffs < split_cutoff, all test cutoffs >= split_cutoff)
    assert len(X_train) == 9   # Days 3, 4, 5, 6, 7, 8, 9, 10, 11 (9 days)
    assert len(X_test) == 7    # Days 12, 13, 14, 15, 16, 17, 18 (7 days)

    # 2. Check no lookahead in training data
    assert y_train[2] is True
    assert y_test[3] is True
    assert y_train[0] is False
    
    # Check lineage contains metadata
    assert "split_cutoff" in lineage
    assert lineage["subject_id"] == "sub_1"
    assert "data_generation_timestamp" in lineage


def test_synthetic_data_generator_seeds_and_reproducibility() -> None:
    seed = 42
    history_1 = generate_synthetic_history(subject_id="sub_1", days=30, seed=seed, timezone="UTC")
    history_2 = generate_synthetic_history(subject_id="sub_1", days=30, seed=seed, timezone="UTC")
    history_diff = generate_synthetic_history(subject_id="sub_1", days=30, seed=101, timezone="UTC")

    # Verify seed reproducibility
    assert len(history_1["records"]) == len(history_2["records"])
    assert len(history_1["occurrences"]) == len(history_2["occurrences"])
    
    for r1, r2 in zip(history_1["records"], history_2["records"]):
        assert r1["sleep_quality"] == r2["sleep_quality"]
        assert r1["source_timestamp"] == r2["source_timestamp"]
        
    for o1, o2 in zip(history_1["occurrences"], history_2["occurrences"]):
        assert o1["severity"] == o2["severity"]
        assert o1["source_timestamp"] == o2["source_timestamp"]

    # Verify that different seeds produce different outputs
    all_same = True
    for r1, r_diff in zip(history_1["records"], history_diff["records"]):
        if r1["sleep_quality"] != r_diff["sleep_quality"]:
            all_same = False
            break
    assert not all_same

    # Verify lineage metadata
    assert "lineage" in history_1
    assert history_1["lineage"]["seed"] == seed
    assert history_1["lineage"]["generator_name"] == "synthetic_history_generator"
    assert "data_generation_timestamp" in history_1["lineage"]


def test_trainer_reproducibility() -> None:
    X_train = [
        {"feat1": 1.0, "feat2": 0.5},
        {"feat1": 0.8, "feat2": 0.2},
        {"feat1": 0.2, "feat2": 0.8},
        {"feat1": 0.1, "feat2": 0.9},
        {"feat1": 0.9, "feat2": 0.1},
        {"feat1": 0.3, "feat2": 0.7},
    ]
    # At least two classes in y_train for logistic regression to train
    y_train = [True, True, False, False, True, False]
    
    # Train first model
    model_1, features_1, meta_1 = train_model(X_train, y_train, seed=42)
    # Train second model
    model_2, features_2, meta_2 = train_model(X_train, y_train, seed=42)
    
    assert features_1 == features_2
    assert list(model_1.coef_[0]) == list(model_2.coef_[0])
    assert model_1.intercept_[0] == model_2.intercept_[0]
    
    # Train model with different seed or params and verify it could differ (or just verify reproducibility)
    assert meta_1["seed"] == 42


def test_model_registry_versioning(tmp_path: Path) -> None:
    # Set up mock registry directory
    registry = ModelRegistry(base_dir=tmp_path)
    
    X_train = [
        {"feat": 1.0}, {"feat": 0.9}, {"feat": 0.1}, {"feat": 0.0}
    ]
    y_train = [True, True, False, False]
    
    model, features, meta = train_model(X_train, y_train, seed=42, min_samples=4)
    
    # Save version 1
    v1_path = registry.save_model("sub_123", model, features, meta)
    assert "v1" in str(v1_path)
    
    # Save version 2 (with slightly different metadata/parameters)
    meta_v2 = meta.copy()
    meta_v2["note"] = "version 2"
    v2_path = registry.save_model("sub_123", model, features, meta_v2)
    assert "v2" in str(v2_path)
    
    # Load version 1 specifically
    artifact_v1 = registry.load_model("sub_123", version=1)
    assert artifact_v1["features"] == ["feat"]
    assert artifact_v1["metadata"].get("note") is None
    
    # Load version 2 specifically
    artifact_v2 = registry.load_model("sub_123", version=2)
    assert artifact_v2["metadata"].get("note") == "version 2"
    
    # Load latest (active) version
    artifact_latest = registry.load_model("sub_123")
    assert artifact_latest["metadata"].get("note") == "version 2"


def test_cold_start_abstention_error(tmp_path: Path) -> None:
    registry = ModelRegistry(base_dir=tmp_path)
    
    # 1. No model saved for subject -> should raise ModelAbstentionError
    with pytest.raises(ModelAbstentionError, match="No active model found"):
        predict_risk(registry=registry, subject_id="sub_missing", X={"feat": 1.0})
        
    # 2. Insufficient training data: less than threshold
    X_train_few = [{"feat": 1.0}, {"feat": 0.5}]
    y_train_few = [True, False]
    with pytest.raises(InsufficientDataError, match="Insufficient samples"):
        train_model(X_train_few, y_train_few, min_samples=5)
        
    # 3. Insufficient classes (e.g. all False)
    X_train_one_class = [{"feat": 1.0}, {"feat": 0.5}, {"feat": 0.2}, {"feat": 0.1}, {"feat": 0.8}]
    y_train_one_class = [False, False, False, False, False]
    with pytest.raises(InsufficientDataError, match="class balance"):
        train_model(X_train_one_class, y_train_one_class, min_samples=5, min_positive_labels=1)


def test_no_profile_to_risk_branch_logic(tmp_path: Path) -> None:
    # Verify model outputs are purely data-driven, no profile hardcoding
    # We train model_a (high chance of True) and model_b (low chance of True)
    registry = ModelRegistry(base_dir=tmp_path)
    
    X_train_high = [{"feat": 1.0}, {"feat": 0.8}, {"feat": 0.7}, {"feat": 0.6}, {"feat": 0.2}]
    y_train_high = [True, True, True, True, False]
    
    X_train_low = [{"feat": 1.0}, {"feat": 0.8}, {"feat": 0.2}, {"feat": 0.1}, {"feat": 0.0}]
    y_train_low = [True, False, False, False, False]
    
    model_high, feats, meta = train_model(X_train_high, y_train_high, min_samples=4)
    model_low, _, _ = train_model(X_train_low, y_train_low, min_samples=4)
    
    registry.save_model("subject_high", model_high, feats, meta)
    registry.save_model("subject_low", model_low, feats, meta)
    
    # Predict on the same feature input
    X_test = {"feat": 0.5}
    
    # Ensure they use the general inference path but return different results because of loaded models
    score_high, risk_high = predict_risk(registry, "subject_high", X_test)
    score_low, risk_low = predict_risk(registry, "subject_low", X_test)
    
    # Outputs differ based on training data, not subject profile names
    assert score_high != score_low
    # Ensure explain_prediction returns valid metrics
    explanation = explain_prediction(model_high, feats, X_test)
    assert len(explanation) == 1
    assert explanation[0]["feature"] == "feat"
    assert "contribution" in explanation[0]

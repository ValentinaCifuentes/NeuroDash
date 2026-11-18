import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from ml.data_loading import known_at, load_subject_data
from ml.dataset_builder import CUTOFF_HOURS, build_feature_example, generate_synthetic_history, training_cutoffs
from ml.evaluation import (
    binary_metrics,
    build_evaluation_examples,
    cold_start_case,
    evaluate_subject,
    product_metrics,
    score_summary,
    select_operating_points,
    threshold_sweep,
    walk_forward_folds,
)


def test_training_cutoffs_are_several_per_day_after_the_baseline_offset() -> None:
    start = datetime(2026, 8, 1, 7, 30, tzinfo=timezone.utc)
    records = [
        {
            "source_timestamp": start + timedelta(days=day),
            "availability_timestamp": start + timedelta(days=day),
        }
        for day in range(10)
    ]

    cutoffs = training_cutoffs(records, timezone="UTC", start_offset_days=3)

    assert len(cutoffs) == 7 * len(CUTOFF_HOURS)  # days 3..9
    assert cutoffs[0] == datetime(2026, 8, 4, CUTOFF_HOURS[0], tzinfo=timezone.utc)
    assert cutoffs[-1] == datetime(2026, 8, 10, CUTOFF_HOURS[-1], tzinfo=timezone.utc)
    assert sorted({c.hour for c in cutoffs}) == list(CUTOFF_HOURS)


def test_training_cutoffs_follow_the_local_day_of_the_profile() -> None:
    import zoneinfo

    santiago = zoneinfo.ZoneInfo("America/Santiago")
    first = datetime(2026, 11, 1, 7, 30, tzinfo=santiago)
    records = [{"source_timestamp": first + timedelta(days=d)} for d in range(5)]

    cutoffs = training_cutoffs(records, timezone="America/Santiago")

    assert cutoffs[0] == datetime(2026, 11, 4, CUTOFF_HOURS[0], tzinfo=santiago)
    assert all(c.utcoffset() == timedelta(hours=-3) for c in cutoffs)


def test_training_data_counts_a_late_entry_only_from_when_it_arrived() -> None:
    """Anotado a las 16:00 algo de las 10:00: para entrenar y evaluar, se sabe desde las 16:00."""
    late = {"availability_timestamp": "2026-11-02T10:00:00-03:00", "received_at": "2026-11-02T19:00:00+00:00"}
    on_time = {"availability_timestamp": "2026-11-02T10:00:00-03:00", "received_at": "2026-11-02T13:00:05+00:00"}
    synthetic = {"availability_timestamp": "2026-11-02T10:00:00-03:00"}

    assert known_at(late) == datetime(2026, 11, 2, 19, 0, tzinfo=timezone.utc)
    assert known_at(on_time) == datetime(2026, 11, 2, 13, 0, 5, tzinfo=timezone.utc)
    assert known_at(synthetic) == datetime(2026, 11, 2, 13, 0, tzinfo=timezone.utc)


def test_walk_forward_folds_are_temporal_and_expanding() -> None:
    folds = walk_forward_folds(n_examples=50, initial_train=20, test_size=5, step=5)

    assert len(folds) == 6
    previous_train_end = 0
    for fold in folds:
        train = fold["train_indices"]
        test = fold["test_indices"]
        assert train == list(range(0, len(train)))
        assert max(train) < min(test)
        assert len(test) == 5
        assert len(train) > previous_train_end
        previous_train_end = len(train)


def test_walk_forward_folds_rejects_invalid_sizes() -> None:
    with pytest.raises(ValueError):
        walk_forward_folds(10, initial_train=0)
    with pytest.raises(ValueError):
        walk_forward_folds(10, test_size=0)
    with pytest.raises(ValueError):
        walk_forward_folds(10, step=0)


def test_binary_metrics_handles_single_class() -> None:
    metrics = binary_metrics([False, False, False], [0.1, 0.2, 0.3])

    assert metrics["n"] == 3
    assert metrics["positives"] == 0
    assert metrics["recall"] == 0.0
    assert metrics["roc_auc"] is None
    assert metrics["pr_auc"] is None
    assert metrics["confusion"] == {"tn": 3, "fp": 0, "fn": 0, "tp": 0}


def test_score_summary_separates_positive_and_negative_scores() -> None:
    summary = score_summary([True, False, True, False], [0.4, 0.1, 0.6, 0.2])

    assert summary["mean_positive"] == pytest.approx(0.5)
    assert summary["mean_negative"] == pytest.approx(0.15)
    assert summary["min"] == 0.1
    assert summary["max"] == 0.6


def test_product_metrics_counts_abstained_crisis_as_missed() -> None:
    examples = [
        {"label": True, "abstain": False, "confidence": "HIGH", "abstention_reason": None},
        {"label": False, "abstain": False, "confidence": "HIGH", "abstention_reason": None},
        {
            "label": True,
            "abstain": True,
            "confidence": "INSUFFICIENT",
            "abstention_reason": "Insufficient baseline maturity",
        },
    ]

    metrics = product_metrics(
        examples,
        [0.9, 0.2, 0.9],
        low_threshold=0.3,
        high_threshold=0.7,
    )

    assert metrics["coverage"] == pytest.approx(2 / 3)
    assert metrics["abstention_rate"] == pytest.approx(1 / 3)
    assert metrics["high"]["alerts"] == 1
    assert metrics["high"]["recall_covered"] == 1.0
    assert metrics["high"]["recall_overall"] == 0.5
    assert metrics["high"]["false_alarms"] == 0
    assert metrics["abstention_reasons"] == {
        "Insufficient baseline maturity": 1
    }


def test_threshold_sweep_and_operating_points() -> None:
    sweep = threshold_sweep(
        [True, True, False, False],
        [0.9, 0.4, 0.35, 0.1],
        n_examples=28,
    )
    points = select_operating_points(
        sweep,
        low_threshold=0.3,
        high_threshold=0.5,
        max_false_alarms_per_week=1.0,
    )

    assert points["current_high"]["threshold"] == 0.5
    assert points["current_any"]["threshold"] == 0.3
    assert points["best_f1"]["threshold"] == 0.35
    assert points["best_f1"]["recall"] == 1.0
    assert points["recall_at_budget"]["threshold"] == 0.35


def test_build_evaluation_examples_includes_confidence_and_abstention() -> None:
    history = generate_synthetic_history("PAC-A", days=20, seed=42)
    examples = build_evaluation_examples(
        records=history["records"],
        occurrences=history["occurrences"],
        cutoffs=training_cutoffs(history["records"]),
        timezone="UTC",
        planned_events=history["planned_events"],
    )

    assert examples
    first = examples[0]
    assert "features" in first
    assert "label" in first
    assert "confidence" in first
    assert "abstain" in first
    assert 1 <= first["baseline_maturity"]


def test_cold_start_case_abstains_before_baseline_maturity() -> None:
    history = generate_synthetic_history("PAC-C", days=2, seed=42)
    last_record = max(
        record["source_timestamp"] for record in history["records"]
    )
    cutoff = last_record + timedelta(days=1)

    result = cold_start_case(
        records=history["records"],
        cutoff=cutoff,
        timezone="UTC",
        planned_events=history["planned_events"],
    )

    assert result["baseline_maturity"] < 3
    assert result["abstain"] is True
    assert result["reason"]


def test_evaluate_subject_returns_folds_baselines_and_operating_points() -> None:
    history = generate_synthetic_history("PAC-A", days=45, seed=42)
    result = evaluate_subject(
        subject_id="PAC-A",
        records=history["records"],
        occurrences=history["occurrences"],
        planned_events=history["planned_events"],
        timezone="UTC",
        initial_train=15,
        test_size=7,
        step=7,
    )

    assert result["dataset"]["n_examples"] > 0
    assert result["dataset"]["n_folds"] >= 1
    assert result["pooled"]["metrics"]["n"] > 0
    assert set(result["baselines"]) == {"majority", "prior", "persistence"}
    assert "threshold_sweep" in result["pooled"]
    assert "operating_points" in result["pooled"]
    assert result["coefficients"]

    for fold in result["folds"]:
        assert fold["train_end"] < fold["test_start"]


def test_load_subject_data_parses_timezone_aware_timestamps(tmp_path: Path) -> None:
    profile_dir = tmp_path / "demo_profiles" / "PAC-X"
    history_dir = tmp_path / "legacy_history"
    profile_dir.mkdir(parents=True)
    history_dir.mkdir(parents=True)

    (profile_dir / "profile.json").write_text(
        json.dumps({"timezone": "America/Santiago"}),
        encoding="utf-8",
    )
    (history_dir / "PAC-X_history.json").write_text(
        json.dumps(
            {
                "records": [
                    {
                        "source_timestamp": "2026-11-01T12:00:00",
                        "availability_timestamp": "2026-11-01T12:00:00",
                        "sleep_quality": 7.0,
                    }
                ],
                "occurrences": [
                    {
                        "source_timestamp": "2026-11-01T15:00:00",
                        "availability_timestamp": "2026-11-01T17:00:00",
                        "severity": "moderate",
                    }
                ],
                "planned_events": [
                    {
                        "starts_at": "2026-11-01T14:00:00",
                        "expectation": "Estresante",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    bundle = load_subject_data("PAC-X", tmp_path)

    assert bundle["profile"]["timezone"] == "America/Santiago"
    assert bundle["records"][0]["source_timestamp"].tzinfo is timezone.utc
    assert bundle["occurrences"][0]["source_timestamp"].tzinfo is timezone.utc
    assert bundle["planned_events"][0]["starts_at"].tzinfo is timezone.utc


def test_build_feature_example_returns_feature_set_metadata() -> None:
    history = generate_synthetic_history("PAC-A", days=10, seed=42)
    cutoff = training_cutoffs(history["records"])[0]
    from engine.baseline import build_baseline

    baseline = build_baseline(history["records"], cutoff, timezone="UTC")
    feature_set, label = build_feature_example(
        records=history["records"],
        occurrences=history["occurrences"],
        baseline=baseline,
        cutoff=cutoff,
        timezone="UTC",
        planned_events=history["planned_events"],
    )

    assert feature_set.rolling_features
    assert feature_set.missingness
    assert feature_set.baseline_maturity >= 1
    assert isinstance(label, bool)

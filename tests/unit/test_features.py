from datetime import datetime, timezone, timedelta
import pytest

from engine.temporal import AvailabilityPolicy, filter_records
from engine.baseline import build_baseline, BaselineSnapshot
from engine.features import build_features, FeatureSet


def test_prior_day_only_regulation_in_features() -> None:
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    
    # Prior day record
    rec_prior = {
        "source_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
        "availability_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
        "sleep_quality": 8.0,
        "wake_state": 7.0,
        "event_count": 1
    }
    # Same day record (cutoff day)
    rec_same = {
        "source_timestamp": datetime(2026, 8, 26, 8, 0, 0, tzinfo=timezone.utc),
        "availability_timestamp": datetime(2026, 8, 26, 8, 0, 0, tzinfo=timezone.utc),
        "sleep_quality": 4.0,
        "wake_state": 3.0,
        "event_count": 5
    }
    
    records = [rec_prior, rec_same]
    subject = {
        "subject_id": "sub-1",
        "timezone": "UTC",
        "sensory_context": {"sensory_profile": "Hipersensible"}
    }
    
    # Test case 1: With prior_day_only regulation active
    policy_active = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    baseline_active = build_baseline(records, cutoff, policy=policy_active, timezone="UTC")
    assert baseline_active.maturity == 1
    assert baseline_active.modality_baselines["sleep_quality"] == 8.0
    
    features_active = build_features(records, baseline_active, cutoff, policy=policy_active, timezone="UTC", subject=subject)
    assert features_active.rolling_features["sleep_quality_mean_1d"] == 8.0

    # Test case 2: With intraday regulation, today's record is eligible...
    policy_intraday = AvailabilityPolicy(daily_regulation="intraday", exclusion_policy="conservative")
    eligible, _ = filter_records(records, cutoff, policy_intraday, timezone="UTC")
    assert rec_same in eligible

    # ...but the baseline and the 1–14 day windows are built only from completed days:
    # today is still unfinished and does not mix with closed days.
    baseline_intraday = build_baseline(records, cutoff, policy=policy_intraday, timezone="UTC")
    assert baseline_intraday.maturity == 1
    assert baseline_intraday.modality_baselines["sleep_quality"] == 8.0

    features_intraday = build_features(records, baseline_intraday, cutoff, policy=policy_intraday, timezone="UTC", subject=subject)
    assert features_intraday.rolling_features == features_active.rolling_features


def test_rolling_windows_and_missingness() -> None:
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    
    # Test case 1: First dataset configuration
    records_1 = [
        {
            "source_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 8.0
        },
        {
            "source_timestamp": datetime(2026, 8, 24, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 24, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 6.0
        },
        {
            "source_timestamp": datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 10.0
        },
        {
            "source_timestamp": datetime(2026, 8, 15, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 15, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 4.0
        }
    ]
    
    baseline_1 = build_baseline(records_1, cutoff, policy=policy, timezone="UTC")
    subject = {"subject_id": "sub-1", "timezone": "UTC", "sensory_context": {}}
    features_1 = build_features(records_1, baseline_1, cutoff, policy=policy, timezone="UTC", subject=subject)
    
    assert features_1.rolling_features["sleep_quality_mean_1d"] == 8.0
    assert features_1.rolling_features["sleep_quality_mean_3d"] == 7.0
    assert features_1.rolling_features["sleep_quality_mean_7d"] == 8.0
    assert features_1.rolling_features["sleep_quality_mean_14d"] == 7.0
    
    # Missingness checks
    missingness_1 = features_1.missingness
    assert any(m["window"] == 3 and m["field"] == "wake_state" and m["missing"] for m in missingness_1)
    assert any(m["window"] == 3 and m["field"] == "sleep_quality" and not m["missing"] for m in missingness_1)

    # Test case 2: Alternative dataset configuration (checking average calculation and delta)
    # Modality sleep_quality:
    # 2026-08-25 -> sleep_quality = 9.0
    # 2026-08-24 -> sleep_quality = 9.0
    # 2026-08-23 -> sleep_quality = 3.0
    # Baseline (median of 9.0, 9.0, 3.0) = 9.0
    records_2 = [
        {
            "source_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 9.0
        },
        {
            "source_timestamp": datetime(2026, 8, 24, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 24, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 9.0
        },
        {
            "source_timestamp": datetime(2026, 8, 23, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 23, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 3.0
        }
    ]
    
    baseline_2 = build_baseline(records_2, cutoff, policy=policy, timezone="UTC")
    assert baseline_2.modality_baselines["sleep_quality"] == 9.0
    
    features_2 = build_features(records_2, baseline_2, cutoff, policy=policy, timezone="UTC", subject=subject)
    # 3d window has records from 25th, 24th, 23rd -> sleep_quality values [9.0, 9.0, 3.0] -> mean = 7.0
    assert features_2.rolling_features["sleep_quality_mean_3d"] == 7.0
    
    # Delta: current value (9.0 from 25th) - baseline median (9.0) = 0.0
    assert features_2.rolling_features["sleep_quality_delta_baseline"] == 0.0


def test_sensory_context_inclusion_never_sets_baseline_risk() -> None:
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    
    records = [
        {
            "source_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 8.0
        }
    ]
    
    # Test case 1: Profile with sensory context
    subject_hypersensitive = {
        "subject_id": "sub-1",
        "timezone": "UTC",
        "sensory_context": {"sensory_profile": "Hipersensible Auditivo"}
    }
    
    baseline_1 = build_baseline(records, cutoff, policy=policy, timezone="UTC")
    assert not hasattr(baseline_1, "risk")
    assert "risk" not in baseline_1.modality_baselines
    
    features_1 = build_features(records, baseline_1, cutoff, policy=policy, timezone="UTC", subject=subject_hypersensitive)
    assert features_1.sensory_context == {"sensory_profile": "Hipersensible Auditivo"}
    assert "risk" not in features_1.rolling_features
    assert "baseline_risk" not in features_1.rolling_features

    # Test case 2: Profile without sensory context
    subject_none = {
        "subject_id": "sub-2",
        "timezone": "UTC",
        "sensory_context": {}
    }
    
    baseline_2 = build_baseline(records, cutoff, policy=policy, timezone="UTC")
    features_2 = build_features(records, baseline_2, cutoff, policy=policy, timezone="UTC", subject=subject_none)
    assert features_2.sensory_context == {}
    assert "risk" not in features_2.rolling_features


def test_switching_to_intraday_does_not_change_the_demo_features_yet() -> None:
    """Paso 2: la regla nueva deja entrar lo de hoy, pero el historial sigue igual.

    Con el historial de PAC-A, las variables y la línea base son las mismas con las dos
    reglas, a mediodía y en la tarde: el modelo actual no cambia hasta que se usen
    los datos del día en curso.
    """
    from pathlib import Path
    from ml.data_loading import load_subject_data

    data_dir = Path(__file__).resolve().parents[2] / "data"
    bundle = load_subject_data("PAC-A", data_dir)
    records, tz = bundle["records"], bundle["profile"]["timezone"]
    last = max(r["source_timestamp"] for r in records)
    old = AvailabilityPolicy(daily_regulation="prior_day_only")
    new = AvailabilityPolicy(daily_regulation="intraday")

    for cutoff in [last - timedelta(days=30), last - timedelta(days=1, hours=-6), last, last + timedelta(hours=6)]:
        base_old = build_baseline(records, cutoff, policy=old, timezone=tz)
        base_new = build_baseline(records, cutoff, policy=new, timezone=tz)
        assert base_new.modality_baselines == base_old.modality_baselines
        assert base_new.maturity == base_old.maturity

        feats_old = build_features(records, base_old, cutoff, policy=old, timezone=tz, planned_events=bundle["planned_events"])
        feats_new = build_features(records, base_new, cutoff, policy=new, timezone=tz, planned_events=bundle["planned_events"])
        assert feats_new.rolling_features == feats_old.rolling_features
        assert feats_new.missingness == feats_old.missingness

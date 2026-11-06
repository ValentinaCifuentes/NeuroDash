"""Tests de Fase 1: los datos faltantes se rellenan con la línea base, no con 0."""
from datetime import datetime, timezone

from engine.temporal import AvailabilityPolicy
from engine.baseline import build_baseline
from engine.features import build_features


def test_missing_window_is_filled_with_baseline_not_zero() -> None:
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")

    records = [
        {
            "source_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 8.0,
        },
        {
            "source_timestamp": datetime(2026, 8, 24, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 24, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 6.0,
            "event_count": 1,
        },
        {
            "source_timestamp": datetime(2026, 8, 23, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 23, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 7.0,
            "event_count": 3,
        },
    ]

    baseline = build_baseline(records, cutoff, policy=policy, timezone="UTC")
    assert baseline.modality_baselines["event_count"] == 2.0

    features = build_features(records, baseline, cutoff, policy=policy, timezone="UTC")

    # La ventana de 1 día solo contiene el registro más reciente (sin event_count),
    # así que cae a la línea base (2.0) en lugar de quedar en None -> 0.
    assert features.rolling_features["event_count_mean_1d"] == 2.0

    # La cobertura sigue marcando el dato como faltante.
    assert any(
        m["window"] == 1 and m["field"] == "event_count" and m["missing"] is True
        for m in features.missingness
    )

    # El indicador binario distingue «sin dato» (1) de un valor real (0).
    assert features.rolling_features["event_count_missing_1d"] == 1.0
    assert features.rolling_features["sleep_quality_missing_1d"] == 0.0

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

    # El indicador *_missing no se agrega a los campos núcleo (siempre presentes).
    assert "event_count_missing_1d" not in features.rolling_features
    assert "sleep_quality_missing_1d" not in features.rolling_features


def test_missing_indicator_only_for_optional_fields() -> None:
    """El flag *_missing solo existe en campos opcionales; 1 si falta, 0 si hay dato."""
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")

    records = [
        {  # sin medicación registrada (p. ej. «No Aplica»)
            "source_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 8.0,
        },
        {  # con medicación
            "source_timestamp": datetime(2026, 8, 24, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 24, 10, 0, 0, tzinfo=timezone.utc),
            "sleep_quality": 6.0,
            "medication_taken": 1,
        },
    ]

    baseline = build_baseline(records, cutoff, policy=policy, timezone="UTC")
    features = build_features(records, baseline, cutoff, policy=policy, timezone="UTC")

    # Ventana de 1 día: solo el registro sin medicación -> falta (1).
    assert features.rolling_features["medication_taken_missing_1d"] == 1.0
    # Ventana de 3 días: hay medicación en uno de los días -> presente (0).
    assert features.rolling_features["medication_taken_missing_3d"] == 0.0


def test_planned_stressful_event_in_horizon() -> None:
    from datetime import timedelta

    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    baseline = build_baseline([], cutoff, policy=policy, timezone="UTC")

    planned = [
        {"starts_at": cutoff + timedelta(hours=3), "expectation": "Estresante"},
        {"starts_at": cutoff + timedelta(hours=4), "expectation": "Agradable"},     # no estresante
        {"starts_at": cutoff + timedelta(hours=20), "expectation": "Desagradable"},  # fuera del horizonte
    ]
    features = build_features([], baseline, cutoff, policy=policy, timezone="UTC", planned_events=planned)
    assert features.rolling_features["planned_stressful_event_8h"] == 1.0

    # Sin eventos planificados (o sin ninguno estresante) -> 0.
    features_none = build_features([], baseline, cutoff, policy=policy, timezone="UTC")
    assert features_none.rolling_features["planned_stressful_event_8h"] == 0.0

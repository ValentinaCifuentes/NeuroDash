"""Variables del día en curso (`engine/features.py › _today_features`).

Lo que se sabe hoy hasta la hora de la estimación: el estado de la mañana, los
eventos con su propia hora y el momento del día. Nunca lo que pasó o se anotó después.
"""
from datetime import datetime, timedelta
import zoneinfo

from engine.baseline import build_baseline
from engine.confidence import calculate_confidence
from engine.explanation import FEATURE_DISPLAY_NAMES, FEATURE_VARIABLE_NAMES, compare_with_baseline
from engine.features import TODAY_FEATURE_NAMES, build_features
from engine.temporal import AvailabilityPolicy
from ml.dataset_builder import build_feature_example

TZ = zoneinfo.ZoneInfo("America/Santiago")
INTRADAY = AvailabilityPolicy(daily_regulation="intraday")
CUTOFF = datetime(2026, 11, 2, 15, 0, tzinfo=TZ)


def _at(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=TZ)


def _record(day: int, hour: int, **values) -> dict:
    return {"id": f"r{day}-{hour}", "source_timestamp": _at(day, hour), "availability_timestamp": _at(day, hour),
            "prediction_availability": "immediate", **values}


def _event(when: datetime, known: datetime | None = None, **values) -> dict:
    return {"id": f"e{when.isoformat()}", "source_timestamp": when, "availability_timestamp": known or when, **values}


def _dysregulation(when: datetime, known: datetime | None = None, **values) -> dict:
    return _event(when, known, event_type="Desregulación Emocional", severity="moderate", **values)


# Doce días completos (21 oct – 1 nov), todos con buen sueño y despertar tranquilo.
HISTORY = [
    {**_record(1, 8, sleep_quality=8.0, wake_state=2.0, event_count=1), "id": f"h{back}",
     "source_timestamp": _at(1, 8) - timedelta(days=back), "availability_timestamp": _at(1, 8) - timedelta(days=back)}
    for back in range(12)
]


def _features(records: list, occurrences: list, cutoff: datetime = CUTOFF, policy: AvailabilityPolicy = INTRADAY):
    baseline = build_baseline(records, cutoff, policy=policy, timezone=TZ)
    return build_features(records, baseline, cutoff, policy=policy, timezone=TZ, occurrences=occurrences)


def test_the_morning_state_is_the_last_value_saved_today() -> None:
    # Mi Día se guarda por partes; una corrección posterior manda. El conteo del
    # registro (que se actualiza durante el día) no se usa como lo de hoy.
    today = [_record(2, 7, sleep_quality=2.0), _record(2, 9, sleep_quality=5.0, wake_state=8.0, event_count=4)]
    feats = _features(HISTORY + today, []).rolling_features

    assert feats["sleep_quality_today"] == 5.0
    assert feats["wake_state_today"] == 8.0
    assert feats["today_record_missing"] == 0.0
    assert feats["max_intensity_today"] == 0.0


def test_without_a_record_today_the_morning_state_falls_back_to_the_baseline_without_lowering_confidence() -> None:
    with_today = _features(HISTORY + [_record(2, 8, sleep_quality=8.0, wake_state=2.0)], [])
    without_today = _features(HISTORY, [])

    assert without_today.rolling_features["sleep_quality_today"] == 8.0  # mediana del historial
    assert without_today.rolling_features["today_record_missing"] == 1.0
    assert "sleep_quality_today" in without_today.today_imputed
    assert calculate_confidence(without_today.missingness) == calculate_confidence(with_today.missingness)
    assert not any(item["field"].endswith("_today") for item in without_today.missingness)


def _mild(when: datetime, known: datetime | None = None, **values) -> dict:
    return _event(when, known, **{"event_type": "Desregulación Emocional", "severity": "mild", "intensity_value": 2, **values})


def test_only_events_known_by_the_cutoff_count() -> None:
    occurrences = [
        _dysregulation(_at(2, 10), intensity_value=6, strategy_outcome="Sin Regulación"),  # crisis de hoy
        _mild(_at(2, 11)),                                                  # leve, hace más de 3 horas
        _event(_at(2, 11), event_type="Alimentación", intensity_value=2),
        _mild(_at(2, 13)),                                                  # leve reciente: avisa
        _mild(_at(2, 14), known=_at(2, 15, 30)),                            # anotada después del corte
        _dysregulation(_at(2, 12), known=_at(2, 16), intensity_value=9),    # anotada después del corte
        _dysregulation(_at(2, 18), intensity_value=10),                     # la crisis que se quiere anticipar
        _dysregulation(_at(1, 20)),                                         # de ayer: no es de hoy
    ]
    feats = _features(HISTORY, occurrences).rolling_features

    assert feats["mild_dysregulation_count_3h"] == 1.0
    assert feats["crisis_count_today"] == 1.0
    assert feats["max_intensity_today"] == 6.0
    assert feats["dysregulation_unresolved_today"] == 1.0
    assert feats["hours_since_dysregulation"] == 2.0


def test_recent_mild_dysregulations_count_across_midnight_but_yesterdays_crisis_is_not_today() -> None:
    occurrences = [_dysregulation(_at(1, 23)), _mild(_at(1, 23, 30))]
    feats = _features(HISTORY, occurrences, cutoff=_at(2, 1)).rolling_features

    assert feats["mild_dysregulation_count_3h"] == 1.0
    assert feats["crisis_count_today"] == 0.0
    assert feats["hours_since_dysregulation"] == 1.5


def test_hours_since_the_last_dysregulation_is_capped_at_one_day() -> None:
    feats = _features(HISTORY, [_dysregulation(_at(1, 12) - timedelta(days=3))]).rolling_features
    assert feats["hours_since_dysregulation"] == 24.0
    assert _features(HISTORY, []).rolling_features["hours_since_dysregulation"] == 24.0


def test_the_moment_of_the_day_is_one_of_three_periods_or_none_at_night() -> None:
    periods = ("period_morning", "period_afternoon", "period_evening")
    by_hour = {hour: tuple(_features(HISTORY, [], cutoff=_at(2, hour)).rolling_features[p] for p in periods)
               for hour in (3, 8, 15, 21)}

    assert by_hour == {3: (0.0, 0.0, 0.0), 8: (1.0, 0.0, 0.0), 15: (0.0, 1.0, 0.0), 21: (0.0, 0.0, 1.0)}


def test_the_old_rule_ignores_today_completely() -> None:
    prior_day = AvailabilityPolicy(daily_regulation="prior_day_only")
    today = [_record(2, 8, sleep_quality=2.0)]
    feats = _features(HISTORY + today, [_dysregulation(_at(2, 10)), _mild(_at(2, 14))], policy=prior_day).rolling_features

    assert feats["sleep_quality_today"] == 8.0
    assert feats["today_record_missing"] == 1.0
    assert feats["crisis_count_today"] == 0.0
    assert feats["mild_dysregulation_count_3h"] == 0.0


def test_a_training_example_never_sees_the_crisis_it_is_labelled_with() -> None:
    crisis = _dysregulation(CUTOFF + timedelta(hours=3), known=CUTOFF + timedelta(hours=5), intensity_value=9)
    baseline = build_baseline(HISTORY, CUTOFF, policy=INTRADAY, timezone=TZ)
    feature_set, label = build_feature_example(HISTORY, [crisis], baseline, CUTOFF, policy=INTRADAY, timezone="America/Santiago")

    assert label is True
    assert feature_set.rolling_features["crisis_count_today"] == 0.0
    assert feature_set.rolling_features["max_intensity_today"] == 0.0
    assert feature_set.rolling_features["hours_since_dysregulation"] == 24.0


def test_every_today_variable_has_a_readable_and_a_variable_name() -> None:
    assert [name for name in TODAY_FEATURE_NAMES if name not in FEATURE_DISPLAY_NAMES] == []
    assert [name for name in TODAY_FEATURE_NAMES if name not in FEATURE_VARIABLE_NAMES] == []
    assert FEATURE_DISPLAY_NAMES["mild_dysregulation_count_3h"] == "desregulaciones leves en las últimas tres horas"


def test_only_the_morning_state_of_today_is_compared_with_the_baseline() -> None:
    baselines = {"sleep_quality": 8.0, "event_count": 2.0}

    assert compare_with_baseline("sleep_quality_today", 2.0, baselines) == ("below", "worse", "Durmió peor que de costumbre hoy")
    # Un conteo de hoy está incompleto hasta que termina el día: no se compara con días completos.
    assert compare_with_baseline("crisis_count_today", 0.0, baselines) == (None, None, None)
    assert compare_with_baseline("sleep_quality_today", None, baselines) == (None, None, None)

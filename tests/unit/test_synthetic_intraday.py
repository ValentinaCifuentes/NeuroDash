"""Datos de práctica con horas del día (`ml/dataset_builder.py › generate_synthetic_history`).

Tienen la misma forma que lo que registra la app: Mi Día en la mañana, el cierre en
la noche y los eventos sueltos, cada uno con su hora. Así el modelo puede aprender
a usar lo que pasa durante el día sin ver lo que todavía no había pasado.
"""
from collections import defaultdict
from datetime import time, timedelta

from ml.dataset_builder import DYSREGULATION_EVENT_TYPE, generate_synthetic_history

HISTORY = generate_synthetic_history("PAC-A", days=90, seed=1020, timezone="America/Santiago")


def _by_day(items: list) -> dict:
    grouped = defaultdict(list)
    for item in items:
        grouped[item["source_timestamp"].date()].append(item)
    return grouped


def test_each_day_has_a_morning_record_and_an_end_of_day_record() -> None:
    for day, records in _by_day(HISTORY["records"]).items():
        morning, close = sorted(records, key=lambda r: r["source_timestamp"])

        assert time(7, 0) <= morning["source_timestamp"].time() <= time(8, 30)
        assert morning["availability_timestamp"] == morning["source_timestamp"]
        assert morning["prediction_availability"] == "immediate"
        assert "sleep_quality" in morning and "day_regulation_level_num" not in morning

        assert close["prediction_availability"] == "prior_day_only"
        assert close["availability_timestamp"].date() == day + timedelta(days=1)
        assert close["availability_timestamp"].time() == time(0, 0)
        assert set(close) >= {"day_regulation_level_num", "raw"}


def test_the_morning_record_counts_match_that_days_events() -> None:
    events = _by_day(HISTORY["occurrences"])
    for day, records in _by_day(HISTORY["records"]).items():
        morning = min(records, key=lambda r: r["source_timestamp"])
        day_events = events.get(day, [])

        assert morning["event_count"] == len(day_events)
        assert morning["dysregulation_count"] == sum(1 for e in day_events if e["event_type"] == DYSREGULATION_EVENT_TYPE)
        assert morning["max_intensity"] == max((e["intensity_value"] for e in day_events), default=0)


def test_only_crises_are_moderate_or_severe_and_they_fall_during_the_day() -> None:
    crises = [o for o in HISTORY["occurrences"] if o.get("severity") in ("moderate", "severe")]
    others = [o for o in HISTORY["occurrences"] if o.get("severity") not in ("moderate", "severe")]

    assert crises and others
    # La primera crisis del día cae entre 09:30 y 21:00; la que se repite, hasta las 22:00.
    assert all(time(9, 30) <= c["source_timestamp"].time() <= time(22, 0) for c in crises)
    assert len({c["source_timestamp"].hour for c in crises}) >= 8  # repartidas, no siempre a la misma hora
    assert all(c["intensity_value"] >= 4 and c["event_type"] == DYSREGULATION_EVENT_TYPE for c in crises)
    assert all(o["intensity_value"] <= 3 for o in others)
    assert all(time(7, 0) <= o["source_timestamp"].time() <= time(21, 0) for o in others)


def test_many_crises_are_preceded_by_a_mild_dysregulation_the_same_day() -> None:
    crises = [o for o in HISTORY["occurrences"] if o.get("severity") in ("moderate", "severe")]

    def warned(crisis: dict) -> bool:
        return any(
            e.get("severity") == "mild"
            and e["event_type"] == DYSREGULATION_EVENT_TYPE
            and timedelta(0) < crisis["source_timestamp"] - e["source_timestamp"] <= timedelta(hours=3)
            for e in HISTORY["occurrences"]
        )

    assert sum(map(warned, crises)) / len(crises) >= 0.5


def test_some_crises_repeat_a_few_hours_later_the_same_day() -> None:
    """Después de una crisis puede venir otra: si nunca pasara, el modelo aprendería
    que tras una crisis viene la calma."""
    crises_per_day = defaultdict(int)
    for occurrence in HISTORY["occurrences"]:
        if occurrence.get("severity") in ("moderate", "severe"):
            crises_per_day[occurrence["source_timestamp"].date()] += 1

    assert any(count >= 2 for count in crises_per_day.values())


def test_a_mild_event_is_known_at_its_own_time_and_a_crisis_two_hours_later() -> None:
    for occurrence in HISTORY["occurrences"]:
        delay = occurrence["availability_timestamp"] - occurrence["source_timestamp"]
        if occurrence.get("severity") in ("moderate", "severe"):
            assert delay == timedelta(hours=2)
        else:
            assert delay == timedelta(0)

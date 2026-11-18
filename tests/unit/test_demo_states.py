"""Estados que debe mostrar la demo (P11) y anclaje del historial sintético por fecha."""

from datetime import date, datetime, timedelta
from unittest.mock import patch

import pytest

from backend.app import prediction_service
from ml.dataset_builder import generate_synthetic_history
from scripts.export_contract_fixture import demo_cutoff


@pytest.mark.parametrize(
    ("subject_id", "expected_risk"),
    [("PAC-A", "MEDIUM"), ("PAC-B", "LOW")],
)
def test_demo_profiles_show_their_intended_state_the_day_after_their_history(subject_id: str, expected_risk: str) -> None:
    """Con el Mi Día de la mañana ya registrado, PAC-A abre en moderado (durmió mal) y
    PAC-B en bajo, ambos con confianza alta."""
    with patch.object(prediction_service, "write_json_atomic"):
        _, contract = prediction_service.make_prediction(subject_id, demo_cutoff(subject_id))

    assert contract.abstained is False
    assert contract.risk == expected_risk
    assert contract.confidence == "HIGH"


def _with_mild_dysregulations(subject_id: str, cutoff: datetime, count: int):
    """La estimación después de registrar `count` desregulaciones leves antes del corte."""
    load = prediction_service.load_subject_data
    mild = [
        {"id": f"leve-{i}", "source_timestamp": cutoff - timedelta(minutes=15 + 45 * i),
         "availability_timestamp": cutoff - timedelta(minutes=15 + 45 * i),
         "event_type": "Desregulación Emocional", "severity": "mild", "intensity_value": 3}
        for i in range(count)
    ]

    def with_events(sid: str):
        profile, records, occurrences, planned = load(sid)
        return profile, records, occurrences + mild, planned

    with patch.object(prediction_service, "write_json_atomic"), \
            patch.object(prediction_service, "load_subject_data", with_events):
        return prediction_service.make_prediction(subject_id, cutoff)[1]


@pytest.mark.parametrize("hour", [10, 15, 20])
def test_pac_a_rises_to_high_after_two_mild_dysregulations_at_any_time(hour: int) -> None:
    """El recorrido de la guía: registrar desregulaciones leves sube la estimación de PAC-A."""
    cutoff = demo_cutoff("PAC-A").replace(hour=hour)
    assert _with_mild_dysregulations("PAC-A", cutoff, 0).risk == "MEDIUM"
    assert _with_mild_dysregulations("PAC-A", cutoff, 2).risk == "HIGH"


def test_in_the_afternoon_one_mild_dysregulation_is_enough_for_pac_a() -> None:
    assert _with_mild_dysregulations("PAC-A", demo_cutoff("PAC-A").replace(hour=15), 1).risk == "HIGH"


def test_pac_b_stays_low_after_a_mild_dysregulation() -> None:
    assert _with_mild_dysregulations("PAC-B", demo_cutoff("PAC-B").replace(hour=15), 1).risk == "LOW"


def test_pac_c_abstains_with_its_two_day_history() -> None:
    with patch.object(prediction_service, "write_json_atomic"):
        _, contract = prediction_service.make_prediction("PAC-C", demo_cutoff("PAC-C"))

    assert contract.abstained is True
    assert contract.risk is None


def test_end_date_moves_the_dates_but_keeps_the_same_values() -> None:
    fixed = generate_synthetic_history("PAC-X", days=10, seed=7, timezone="America/Santiago")
    anchored = generate_synthetic_history(
        "PAC-X", days=10, seed=7, timezone="America/Santiago", end_date=date(2026, 12, 3)
    )

    assert anchored["records"][-1]["source_timestamp"].date() == date(2026, 12, 3)
    assert anchored["records"][0]["source_timestamp"].date() == date(2026, 11, 24)
    # Mi Día en la mañana (07:00–08:30) y el cierre en la noche, disponible desde la medianoche.
    first, first_close = fixed["records"][0], fixed["records"][1]
    assert first["source_timestamp"].date() == date(2026, 8, 1)
    assert 7 <= first["source_timestamp"].hour <= 8
    assert first_close["availability_timestamp"] == datetime.fromisoformat("2026-08-02T00:00:00-04:00")

    def values(history: dict) -> list:
        return [{k: v for k, v in record.items() if "timestamp" not in k and k != "date"} for record in history["records"]]

    assert values(anchored) == values(fixed)
    assert len(anchored["occurrences"]) == len(fixed["occurrences"])

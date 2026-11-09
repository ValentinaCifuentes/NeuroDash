"""Estados que debe mostrar la demo (P11) y anclaje del historial sintético por fecha."""

from datetime import date, datetime
from unittest.mock import patch

import pytest

from backend.app import prediction_service
from ml.dataset_builder import generate_synthetic_history
from scripts.export_contract_fixture import demo_cutoff


@pytest.mark.parametrize(
    ("subject_id", "expected_risk"),
    [("PAC-A", "HIGH"), ("PAC-B", "LOW")],
)
def test_demo_profiles_show_their_intended_state_the_day_after_their_history(subject_id: str, expected_risk: str) -> None:
    """PAC-A se ve elevado y PAC-B bajo, ambos con confianza alta, la mañana siguiente al historial."""
    with patch.object(prediction_service, "write_json_atomic"):
        _, contract = prediction_service.make_prediction(subject_id, demo_cutoff(subject_id))

    assert contract.abstained is False
    assert contract.risk == expected_risk
    assert contract.confidence == "HIGH"


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

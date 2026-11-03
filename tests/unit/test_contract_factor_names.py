"""Contrato de «Por qué aparece así» y «Puede mejorar la lectura» con el frontend (I7).

El front lee `factor_name`, `feature`, `contribution` y `description` de cada factor
(`adaptFactor` en `front/src/api.ts`) y `field`, `window` y `missing` de cada
faltante (`adaptMissingness`). Estos tests fijan esas claves del lado del motor.
"""

import json
from pathlib import Path
from unittest.mock import patch

from backend.app import prediction_service
from backend.app.routes.subjects import _CARE_FIELD_ENCODINGS
from engine.explanation import FEATURE_DISPLAY_NAMES, FEATURE_VARIABLE_NAMES, generate_non_causal_factors

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONT_FIXTURE = PROJECT_ROOT / "front" / "src" / "test" / "fixtures" / "prediction-contract.json"

FACTOR_KEYS = {"factor_name", "feature", "contribution", "description"}
MISSINGNESS_KEYS = {"field", "window", "missing"}
EVENT_COUNT_FIELDS = ["event_count", "dysregulation_count", "max_intensity"]


def _encoded_fields() -> list[str]:
    from backend.app.routes.subjects import _CARE_LIST_ENCODINGS, EVENT_SCALE_ENCODINGS

    return (
        [numeric_field for _, numeric_field, _ in _CARE_FIELD_ENCODINGS]
        + [numeric_field for _, numeric_field, _, _ in _CARE_LIST_ENCODINGS]
        + [numeric_field for numeric_field, _ in EVENT_SCALE_ENCODINGS.values()]
        + EVENT_COUNT_FIELDS
    )


def test_every_variable_the_tutor_feeds_has_a_readable_and_a_variable_name() -> None:
    expected = [
        f"{field}_mean_{window}d" for field in _encoded_fields() for window in (1, 3, 7, 14)
    ] + [f"{field}_delta_baseline" for field in _encoded_fields()]

    missing_display = [feature for feature in expected if feature not in FEATURE_DISPLAY_NAMES]
    missing_variable = [feature for feature in expected if feature not in FEATURE_VARIABLE_NAMES]

    assert missing_display == []
    assert missing_variable == []


def test_a_real_pac_a_prediction_sends_the_keys_the_frontend_reads() -> None:
    from scripts.export_contract_fixture import demo_cutoff

    with patch.object(prediction_service, "write_json_atomic"):
        _, contract = prediction_service.make_prediction("PAC-A", demo_cutoff())

    assert contract.factors, "PAC-A should not abstain at this cutoff"
    assert all(set(factor) == FACTOR_KEYS for factor in contract.factors)
    assert all(set(item) == MISSINGNESS_KEYS for item in contract.missingness)
    assert {item["field"] for item in contract.missingness} >= {"sleep_quality", "wake_state", "event_count"}


def test_the_frontend_fixture_matches_the_current_factor_names() -> None:
    """Si falla, regenera el fixture: `python scripts/export_contract_fixture.py`."""
    fixture = json.loads(FRONT_FIXTURE.read_text(encoding="utf-8"))
    explanations = [
        {"feature": feature, "contribution": 0.5 if index % 2 == 0 else -0.5, "value": 1.0}
        for index, feature in enumerate(FEATURE_DISPLAY_NAMES)
    ]

    assert fixture["factors"] == generate_non_causal_factors(explanations)
    assert fixture["horizon_hours"] == 8


def test_frontend_core_fields_mirror_the_confidence_config() -> None:
    """`CORE_FIELDS` en front/src/api.ts debe copiar `core_fields` de config/confidence.yaml."""
    import re

    import yaml

    config = yaml.safe_load((PROJECT_ROOT / "config" / "confidence.yaml").read_text(encoding="utf-8"))
    api_source = (PROJECT_ROOT / "front" / "src" / "api.ts").read_text(encoding="utf-8")
    match = re.search(r"export const CORE_FIELDS = \[([^\]]*)\]", api_source)

    assert match, "CORE_FIELDS no está en front/src/api.ts"
    assert re.findall(r"'([a-z_]+)'", match.group(1)) == config["core_fields"]


def test_insufficient_data_support_names_only_core_fields_in_spanish() -> None:
    """P15: el apoyo por datos insuficientes no muestra nombres internos ni campos opcionales."""
    import yaml

    from engine.support import CORE_FIELD_LABELS, _insufficient_data_support

    config = yaml.safe_load((PROJECT_ROOT / "config" / "confidence.yaml").read_text(encoding="utf-8"))
    assert set(CORE_FIELD_LABELS) == set(config["core_fields"])

    missingness = [
        {"field": "day_regulation_level_num", "window": 1, "missing": True},
        {"field": "sleep_quality", "window": 1, "missing": True},
        {"field": "sleep_quality", "window": 3, "missing": True},
        {"field": "wake_state", "window": 7, "missing": True},
    ]
    description = _insufficient_data_support([], missingness)["description"]

    assert "calidad del sueño, estado al despertar" in description
    assert "_" not in description
    assert "regulación" not in description

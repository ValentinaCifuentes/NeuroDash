"""Exporta un contrato de predicción real como fixture para los tests del frontend.

Toma la predicción de PAC-A del motor y reemplaza `factors` por los factores que
genera `engine/explanation.py` para *todas* las variables con nombre legible, de
modo que el front pruebe su adaptador con cada familia (incluidas las que el
modelo actual no usa todavía).

Uso, desde la raíz del repo:
    python scripts/export_contract_fixture.py

No guarda la copia de la predicción en `data/`: escribe solo el fixture.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app import prediction_service  # noqa: E402
from engine.explanation import BASELINE_PHRASES, FEATURE_DISPLAY_NAMES, generate_non_causal_factors  # noqa: E402

FIXTURE_PATH = PROJECT_ROOT / "front" / "src" / "test" / "fixtures" / "prediction-contract.json"


def demo_cutoff(subject_id: str = "PAC-A") -> datetime:
    """La mañana siguiente al último registro de la demo: el momento en que se muestra."""
    records, _ = prediction_service.load_legacy_history(subject_id)
    last = max(datetime.fromisoformat(record["source_timestamp"]) for record in records)
    return (last + timedelta(days=1)).replace(hour=10, minute=0)


def build_fixture() -> dict:
    with patch.object(prediction_service, "write_json_atomic"):
        _, contract = prediction_service.make_prediction("PAC-A", demo_cutoff())
    fixture = contract.model_dump(mode="json")
    fixture["factors"] = fixture_factors()
    return fixture


def fixture_factors() -> list[dict]:
    """Factores sintéticos que cubren las dos direcciones (↑ ↓) y las tres
    comparaciones con la línea base (sobre, bajo, parecido) para el front."""
    explanations = [
        {"feature": feature, "contribution": 0.5 if index % 2 == 0 else -0.5, "value": 1.0}
        for index, feature in enumerate(FEATURE_DISPLAY_NAMES)
    ]
    baselines = {field: (-5.0, 5.0, 1.0)[index % 3] for index, field in enumerate(BASELINE_PHRASES)}
    return generate_non_causal_factors(explanations, baselines)


if __name__ == "__main__":
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(json.dumps(build_fixture(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Fixture escrito en {FIXTURE_PATH.relative_to(PROJECT_ROOT)}")

"""Exporta las demos PAC-A/B/C para el mock del front (`front/src/mocks/demo-fixture.json`).

El mock (modo sin backend: `VITE_API_BASE` vacío; secundario) responde con el
mismo JSON que FastAPI. Este script lo saca de
la demo real, así el mock muestra lo mismo que la app conectada:

- `subjects`: el perfil de cada demo (`GET /subjects/{id}`);
- `timeline`: sus registros y eventos de los últimos días (`GET /subjects/{id}/timeline`);
- `predictions`: la estimación del motor la mañana siguiente al historial
  (PAC-A elevado, PAC-B bajo, PAC-C sin estimación).

Todo queda anclado a `anchor` (esa mañana). El mock corre las fechas para que la
demo termine siempre «ayer», sin tener que regenerar nada.

Correr después de `generate_mock_histories.py` y `train_demo_models.py`:

    python scripts/export_mock_fixture.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from backend.app import prediction_service  # noqa: E402
from backend.app.main import app  # noqa: E402
from scripts.export_contract_fixture import demo_cutoff  # noqa: E402

FIXTURE_PATH = PROJECT_ROOT / "front" / "src" / "mocks" / "demo-fixture.json"
DEMOS = ["PAC-A", "PAC-B", "PAC-C"]
# Lo que muestran Seguimiento (calendario con navegación de meses) e Historial.
TIMELINE_DAYS = 70


def build_fixture() -> dict:
    client = TestClient(app)
    anchor = demo_cutoff("PAC-A")
    fixture: dict = {"anchor": anchor.isoformat(), "subjects": {}, "timeline": {}, "predictions": {}}

    for subject_id in DEMOS:
        fixture["subjects"][subject_id] = client.get(f"/api/v1/subjects/{subject_id}").json()

        timeline = client.get(
            f"/api/v1/subjects/{subject_id}/timeline",
            params={"as_of": anchor.isoformat(), "days": TIMELINE_DAYS},
        ).json()
        fixture["timeline"][subject_id] = timeline["entries"]

        # Sin guardar la copia de la predicción en data/ (P5).
        with patch.object(prediction_service, "write_json_atomic"):
            _, contract = prediction_service.make_prediction(subject_id, anchor)
        fixture["predictions"][subject_id] = contract.model_dump(mode="json")

    return fixture


if __name__ == "__main__":
    FIXTURE_PATH.write_text(json.dumps(build_fixture(), ensure_ascii=False) + "\n", encoding="utf-8")
    size_kb = FIXTURE_PATH.stat().st_size / 1024
    print(f"Fixture del mock escrito en {FIXTURE_PATH.relative_to(PROJECT_ROOT)} ({size_kb:.0f} KB)")

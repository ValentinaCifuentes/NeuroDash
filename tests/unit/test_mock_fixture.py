"""El modo sin servidor del front usa respuestas reales del backend (`front/src/mocks/demo-fixture.json`).

Si cambian las demos, el motor o el contrato, este test avisa que el fixture quedó
viejo. Para regenerarlo: `python scripts/export_mock_fixture.py`.
"""

import json
import logging
from pathlib import Path

from scripts.export_mock_fixture import DEMOS, FIXTURE_PATH, build_fixture


def _without_ids(fixture: dict) -> dict:
    """El `prediction_id` es nuevo en cada estimación; el resto debe coincidir."""
    copy = json.loads(json.dumps(fixture))
    for prediction in copy["predictions"].values():
        prediction.pop("prediction_id", None)
    return copy


def test_the_front_mock_fixture_matches_the_current_backend() -> None:
    logging.disable(logging.INFO)
    try:
        current = build_fixture()
    finally:
        logging.disable(logging.NOTSET)
    stored = json.loads(Path(FIXTURE_PATH).read_text(encoding="utf-8"))

    assert sorted(stored["subjects"]) == DEMOS
    assert _without_ids(stored) == _without_ids(current)

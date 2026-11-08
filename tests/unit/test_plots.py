from pathlib import Path

import pytest

pytest.importorskip("matplotlib")

from ml.dataset_builder import generate_synthetic_history
from ml.evaluation import evaluate_subject
from ml.plots import save_figures


def test_save_figures_creates_png_and_svg(tmp_path: Path) -> None:
    history = generate_synthetic_history("PAC-A", days=45, seed=42)
    result = evaluate_subject(
        subject_id="PAC-A",
        records=history["records"],
        occurrences=history["occurrences"],
        planned_events=history["planned_events"],
        timezone="UTC",
        initial_train=15,
        test_size=7,
        step=7,
    )

    paths = save_figures({"subjects": {"PAC-A": result}}, tmp_path)
    names = {path.name for path in paths}

    assert len(paths) == 14
    assert "roc.png" in names
    assert "roc.svg" in names
    assert "threshold_tradeoff.png" in names
    assert "feature_importance.svg" in names
    assert all(path.stat().st_size > 0 for path in paths)

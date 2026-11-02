import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routes import subjects
from backend.app.routes.subjects import require_subject_access
from backend.app.schemas import ActorContext


def _write_profile(root: Path, subject_id: str, **extra) -> None:
    directory = root / subject_id
    directory.mkdir(parents=True)
    profile = {"subject_id": subject_id, "timezone": "UTC", **extra}
    (directory / "profile.json").write_text(json.dumps(profile), encoding="utf-8")


def _isolate(tmp_path: Path, monkeypatch) -> tuple[Path, Path]:
    real_root, demo_root = tmp_path / "subjects", tmp_path / "demo_profiles"
    real_root.mkdir()
    demo_root.mkdir()
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", real_root)
    monkeypatch.setattr(subjects, "DEMO_PROFILES_ROOT", demo_root)
    return real_root, demo_root


def test_subject_list_includes_demo_profiles_marked_synthetic(tmp_path: Path, monkeypatch) -> None:
    real_root, demo_root = _isolate(tmp_path, monkeypatch)
    _write_profile(real_root, "alex", display_name="Alex", provenance={"source": "caregiver_onboarding", "synthetic": False})
    _write_profile(demo_root, "PAC-A", display_name="PAC-A")
    _write_profile(demo_root, "PAC-C")

    subjects_listed = TestClient(app).get("/api/v1/subjects").json()["subjects"]

    assert [item["subject_id"] for item in subjects_listed] == ["alex", "PAC-A", "PAC-C"]
    assert subjects_listed[0]["provenance"]["synthetic"] is False
    assert all(item["provenance"]["synthetic"] is True for item in subjects_listed[1:])
    assert subjects_listed[2]["display_name"] == "PAC-C"


def test_a_real_subject_is_not_duplicated_by_a_demo_with_the_same_id(tmp_path: Path, monkeypatch) -> None:
    real_root, demo_root = _isolate(tmp_path, monkeypatch)
    _write_profile(real_root, "PAC-A", display_name="Real")
    _write_profile(demo_root, "PAC-A", display_name="Demo")

    subjects_listed = TestClient(app).get("/api/v1/subjects").json()["subjects"]

    assert [item["display_name"] for item in subjects_listed] == ["Real"]


def test_demo_access_follows_its_authorized_tutors(tmp_path: Path, monkeypatch) -> None:
    _, demo_root = _isolate(tmp_path, monkeypatch)
    _write_profile(demo_root, "PAC-A", authorized_tutor_ids=["tutor-demo"])

    profile = require_subject_access("PAC-A", ActorContext(actor_id="tutor-demo", role="tutor"))

    assert profile["subject_id"] == "PAC-A"


def test_demo_access_rejects_an_unlisted_tutor(tmp_path: Path, monkeypatch) -> None:
    _, demo_root = _isolate(tmp_path, monkeypatch)
    _write_profile(demo_root, "PAC-A", authorized_tutor_ids=["tutor-demo"])
    client = TestClient(app)

    # El acceso se comprueba antes de buscar la predicción, así que basta con un id de una predicción guardada.
    predictions_dir = demo_root / "PAC-A" / "predictions"
    predictions_dir.mkdir()
    (predictions_dir / "pred-1.json").write_text(json.dumps({"prediction_cutoff": "2026-11-02T12:00:00+00:00"}), encoding="utf-8")
    monkeypatch.setattr(
        "backend.app.routes.predictions.find_subject_dir_by_prediction_id", lambda _id: demo_root / "PAC-A"
    )

    response = client.post(
        "/api/v1/predictions/pred-1/outcome",
        json={"actual_outcome": True, "idempotency_key": "k", "provenance": {"source": "tutor_app", "synthetic": False}},
        headers={"X-Actor-Id": "someone-else", "X-Actor-Role": "tutor"},
    )

    assert response.status_code == 403


def test_committed_demo_profiles_authorize_the_frontend_demo_tutor() -> None:
    demo_root = Path(__file__).resolve().parents[2] / "data" / "demo_profiles"

    for subject_id in ("PAC-A", "PAC-B", "PAC-C"):
        profile = json.loads((demo_root / subject_id / "profile.json").read_text(encoding="utf-8"))
        assert profile["authorized_tutor_ids"] == ["tutor-demo"]
        assert profile["provenance"]["synthetic"] is True

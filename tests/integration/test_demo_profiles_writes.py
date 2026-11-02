import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import prediction_service
from backend.app.main import app
from backend.app.routes import subjects

HEADERS = {"X-Actor-Id": "tutor-demo", "X-Actor-Role": "tutor"}
PROVENANCE = {"source": "tutor_app", "synthetic": False}

LEGACY_HISTORY = {
    "records": [{
        "id": "rec_PAC-A_1", "subject_id": "PAC-A", "sleep_quality": 6.8, "wake_state": 6.5,
        "source_timestamp": "2026-11-01T12:00:00-04:00", "availability_timestamp": "2026-11-01T12:00:00-04:00",
    }],
    "occurrences": [{
        "id": "occ_PAC-A_1", "subject_id": "PAC-A", "event_type": "Desregulación Emocional",
        "intensity_value": 8, "severity": "severe",
        "source_timestamp": "2026-11-01T20:00:00-04:00", "availability_timestamp": "2026-11-01T22:00:00-04:00",
    }],
}


def _demo_setup(tmp_path: Path, monkeypatch) -> Path:
    """PAC-A como demo aislada: perfil en demo_profiles e historial sintético en legacy_history."""
    real_root, demo_root, legacy_root = tmp_path / "subjects", tmp_path / "demo_profiles", tmp_path / "legacy_history"
    for directory in (real_root, demo_root / "PAC-A", legacy_root):
        directory.mkdir(parents=True)
    (demo_root / "PAC-A" / "profile.json").write_text(json.dumps({
        "subject_id": "PAC-A", "timezone": "America/Santiago", "authorized_tutor_ids": ["tutor-demo"],
    }), encoding="utf-8")
    (legacy_root / "PAC-A_history.json").write_text(json.dumps(LEGACY_HISTORY), encoding="utf-8")
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", real_root)
    monkeypatch.setattr(subjects, "DEMO_PROFILES_ROOT", demo_root)
    monkeypatch.setattr(prediction_service, "LEGACY_HISTORY_DIR", legacy_root)
    monkeypatch.setattr(prediction_service, "get_subject_paths", lambda subject_id: (demo_root / subject_id, True))
    return demo_root / "PAC-A"


def _save_basal_and_event(client: TestClient) -> None:
    record = client.post("/api/v1/subjects/PAC-A/daily-records", headers=HEADERS, json={
        "occurred_at": "2026-11-02T08:00:00-03:00", "idempotency_key": "basal-1", "provenance": PROVENANCE,
        "sleep_quality": "Interrumpido", "wake_mode": "Irritable/Llorando",
    })
    event = client.post("/api/v1/subjects/PAC-A/events", headers=HEADERS, json={
        "occurred_at": "2026-11-02T10:30:00-03:00", "idempotency_key": "event-1", "provenance": PROVENANCE,
        "event_type": "Desregulación Emocional", "intensity_value": 6,
    })
    assert record.status_code == event.status_code == 201


def test_a_demo_accepts_a_basal_record_and_an_event_in_its_own_folder(tmp_path: Path, monkeypatch) -> None:
    demo_dir = _demo_setup(tmp_path, monkeypatch)

    _save_basal_and_event(TestClient(app))

    records = json.loads((demo_dir / "records.json").read_text(encoding="utf-8"))
    occurrences = json.loads((demo_dir / "occurrences.json").read_text(encoding="utf-8"))
    assert len(records) == 1 and len(occurrences) == 1
    assert records[0]["sleep_quality"] == 5 and records[0]["raw"]["sleep_quality"] == "Interrumpido"
    assert records[0]["event_count"] == 1 and records[0]["max_intensity"] == 6
    assert occurrences[0]["severity"] == "moderate"
    # El historial sintético no se toca.
    assert json.loads((tmp_path / "legacy_history" / "PAC-A_history.json").read_text(encoding="utf-8")) == LEGACY_HISTORY


def test_the_demo_timeline_shows_synthetic_history_and_new_entries_in_time_order(tmp_path: Path, monkeypatch) -> None:
    _demo_setup(tmp_path, monkeypatch)
    client = TestClient(app)
    _save_basal_and_event(client)

    response = client.get("/api/v1/subjects/PAC-A/timeline", params={"as_of": "2026-11-02T12:00:00-03:00", "days": 3})

    assert response.status_code == 200
    entries = response.json()["entries"]
    assert [(entry["kind"], entry["entry_id"]) for entry in entries][2:] == [
        ("event", "occ_PAC-A_1"), ("daily_record", "rec_PAC-A_1"),
    ]
    assert [entry["kind"] for entry in entries[:2]] == ["event", "daily_record"]


def test_the_model_reads_the_demo_history_plus_what_was_registered_in_the_app(tmp_path: Path, monkeypatch) -> None:
    _demo_setup(tmp_path, monkeypatch)
    _save_basal_and_event(TestClient(app))

    _, records, occurrences = prediction_service.load_subject_data("PAC-A")

    assert [record.get("id", "app") for record in records] == ["rec_PAC-A_1", "app"]
    assert len(occurrences) == 2


def test_a_confirmed_crisis_on_a_demo_reaches_the_model_and_the_timeline(tmp_path: Path, monkeypatch) -> None:
    demo_dir = _demo_setup(tmp_path, monkeypatch)
    client = TestClient(app)
    predictions_dir = demo_dir / "predictions"
    predictions_dir.mkdir()
    (predictions_dir / "pred-1.json").write_text(json.dumps({
        "subject_id": "PAC-A", "prediction_cutoff": "2026-11-02T08:00:00-03:00", "horizon_hours": 8,
    }), encoding="utf-8")
    monkeypatch.setattr("backend.app.routes.predictions.find_subject_dir_by_prediction_id", lambda _id: demo_dir)

    confirmed = client.post("/api/v1/predictions/pred-1/outcome", headers=HEADERS, json={
        "actual_outcome": True, "idempotency_key": "outcome-1", "provenance": PROVENANCE,
    })

    assert confirmed.status_code == 201
    _, _, occurrences = prediction_service.load_subject_data("PAC-A")
    assert occurrences[-1]["id"] == "occ_pred-1"
    timeline = client.get("/api/v1/subjects/PAC-A/timeline", params={"as_of": "2026-11-02T20:00:00-03:00", "days": 1})
    assert timeline.json()["entries"][0]["title"] == "Crisis confirmada"


def test_an_unknown_subject_still_returns_404(tmp_path: Path, monkeypatch) -> None:
    _demo_setup(tmp_path, monkeypatch)

    response = TestClient(app).post("/api/v1/subjects/PAC-Z/daily-records", headers=HEADERS, json={
        "occurred_at": "2026-11-02T08:00:00-03:00", "idempotency_key": "k", "provenance": PROVENANCE,
    })

    assert response.status_code == 404

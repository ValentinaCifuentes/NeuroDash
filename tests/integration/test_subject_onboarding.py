from pathlib import Path
import json

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routes import subjects


def test_onboarding_creates_a_selectable_cold_start_subject(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    payload = {
        "display_name": "Alex Rivera",
        "timezone": "America/Santiago",
        "baseline": {"sensory_profile": "Auditory sensitive"},
        "provenance": {"source": "caregiver_onboarding", "synthetic": False},
    }

    created = client.post("/api/v1/subjects", json=payload)

    assert created.status_code == 201
    subject = created.json()
    assert subject["contract_version"] == "2.0"
    assert subject["display_name"] == "Alex Rivera"
    assert subject["timezone"] == "America/Santiago"
    assert subject["cold_start"] is True
    assert subject["provenance"] == payload["provenance"]

    selected = client.get(f"/api/v1/subjects/{subject['subject_id']}")
    listed = client.get("/api/v1/subjects")

    assert selected.status_code == 200
    assert selected.json()["subject_id"] == subject["subject_id"]
    assert listed.status_code == 200
    assert [item["subject_id"] for item in listed.json()["subjects"]] == [subject["subject_id"]]


def test_replaying_onboarding_keeps_the_same_subject_id(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    payload = {
        "display_name": "Alex Rivera",
        "timezone": "UTC",
        "baseline": {},
        "provenance": {"source": "caregiver_onboarding", "synthetic": False},
    }

    first = client.post("/api/v1/subjects", json=payload)
    replay = client.post("/api/v1/subjects", json=payload)

    assert first.status_code == replay.status_code == 201
    assert replay.json()["subject_id"] == first.json()["subject_id"]
    assert len(client.get("/api/v1/subjects").json()["subjects"]) == 1


def test_onboarding_normalizes_an_existing_legacy_profile(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    legacy_dir = tmp_path / "legacy-subject"
    legacy_dir.mkdir()
    (legacy_dir / "profile.json").write_text(json.dumps({"subject_id": "legacy-subject", "timezone": "UTC"}), encoding="utf-8")
    client = TestClient(app)

    response = client.post("/api/v1/subjects", json={
        "subject_id": "legacy-subject",
        "display_name": "Legacy Subject",
        "timezone": "UTC",
        "baseline": {},
        "provenance": {"source": "caregiver_onboarding", "synthetic": False},
    })

    assert response.status_code == 201
    assert response.json()["display_name"] == "Legacy Subject"


def test_subject_list_returns_a_safe_selection_for_a_legacy_profile(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    legacy_dir = tmp_path / "legacy-subject"
    legacy_dir.mkdir()
    (legacy_dir / "profile.json").write_text(json.dumps({"subject_id": "legacy-subject", "timezone": "UTC"}), encoding="utf-8")

    response = TestClient(app).get("/api/v1/subjects")

    assert response.status_code == 200
    assert response.json()["subjects"][0]["display_name"] == "legacy-subject"

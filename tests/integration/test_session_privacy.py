from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routes import subjects


def actor(actor_id: str, role: str) -> dict[str, str]:
    return {"X-Actor-Id": actor_id, "X-Actor-Role": role}


def onboard(client: TestClient) -> str:
    response = client.post("/api/v1/subjects", json={
        "display_name": "Alex Rivera",
        "timezone": "America/Santiago",
        "baseline": {},
        "provenance": {"source": "caregiver_onboarding", "synthetic": False},
        "authorized_tutor_ids": ["tutor-1"],
        "authorized_professional_ids": ["professional-1"],
    })
    assert response.status_code == 201
    return response.json()["subject_id"]


def session_payload() -> dict[str, object]:
    return {
        "occurred_at": "2026-08-26T10:00:00-04:00",
        "idempotency_key": "session-1",
        "provenance": {"source": "professional", "synthetic": False},
        "professional": "Dr. Rivera",
        "consultation_reason": "Control",
        "modality": "Presencial",
        "duration_minutes": 45,
        "attendance": "Presente",
        "paid": False,
        "status": "Atendida",
        "alert_level": "Medio",
        "objectives": "Practice transitions",
        "activities": None,
        "observations": "Shared observation",
        "internal_notes": "Private clinical note",
        "visible_to_tutor": True,
        "active": True,
    }


def test_authorized_session_reads_redact_internal_notes_after_reload(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = onboard(client)

    saved = client.post(
        f"/api/v1/subjects/{subject_id}/sessions",
        json=session_payload(),
        headers=actor("professional-1", "professional"),
    )
    tutor_read = client.get(f"/api/v1/subjects/{subject_id}/sessions", headers=actor("tutor-1", "tutor"))
    professional_read = client.get(
        f"/api/v1/subjects/{subject_id}/sessions", headers=actor("professional-1", "professional"),
    )

    assert saved.status_code == 201
    assert saved.json()["provenance"] == {"source": "professional", "synthetic": False}
    assert tutor_read.status_code == professional_read.status_code == 200
    assert tutor_read.json()[0]["observations"] == "Shared observation"
    assert "internal_notes" not in tutor_read.json()[0]
    assert "internal_notes" not in professional_read.json()[0]


def test_session_access_denies_unpermitted_or_tutor_private_note_writes(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = onboard(client)

    denied_read = client.get(f"/api/v1/subjects/{subject_id}/sessions", headers=actor("outsider", "tutor"))
    denied_write = client.post(
        f"/api/v1/subjects/{subject_id}/sessions",
        json=session_payload(),
        headers=actor("tutor-1", "tutor"),
    )
    reloaded = client.get(f"/api/v1/subjects/{subject_id}/sessions", headers=actor("professional-1", "professional"))

    assert denied_read.status_code == denied_write.status_code == 403
    assert "Private clinical note" not in denied_read.text + denied_write.text
    assert reloaded.status_code == 200
    assert reloaded.json() == []

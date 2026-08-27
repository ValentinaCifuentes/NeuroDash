from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routes import subjects


def onboard(client: TestClient) -> str:
    response = client.post("/api/v1/subjects", json={
        "display_name": "Alex Rivera",
        "timezone": "America/Santiago",
        "baseline": {},
        "provenance": {"source": "caregiver_onboarding", "synthetic": False},
    })
    assert response.status_code == 201
    return response.json()["subject_id"]


def headers() -> dict[str, str]:
    return {"X-Actor-Id": "tutor-1", "X-Actor-Role": "tutor"}


def test_cutoff_eligibility_includes_boundary_and_excludes_later_availability() -> None:
    cutoff = subjects.datetime.fromisoformat("2026-08-26T12:00:00-04:00")
    start = subjects.datetime.fromisoformat("2026-08-25T12:00:00-04:00")

    assert subjects.is_cutoff_eligible(
        {"source_timestamp": "2026-08-26T10:00:00-04:00", "availability_timestamp": "2026-08-26T12:00:00-04:00"},
        start,
        cutoff,
    ) is True
    assert subjects.is_cutoff_eligible(
        {"source_timestamp": "2026-08-26T10:00:00-04:00", "availability_timestamp": "2026-08-26T12:01:00-04:00"},
        start,
        cutoff,
    ) is False


def test_care_writes_replay_and_timeline_honors_availability_cutoff(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = onboard(client)
    daily = {
        "occurred_at": "2026-08-26T07:30:00-04:00",
        "idempotency_key": "daily-1",
        "provenance": {"source": "caregiver", "synthetic": False},
        "sleep_quality": "Reparador",
        "gi_status": "Normal",
    }
    event = {
        "occurred_at": "2026-08-26T10:00:00-04:00",
        "idempotency_key": "event-1",
        "provenance": {"source": "caregiver", "synthetic": False},
        "event_type": "Transición de Actividad",
        "intensity_value": 4,
    }

    first = client.post(f"/api/v1/subjects/{subject_id}/daily-records", json=daily, headers=headers())
    replay = client.post(f"/api/v1/subjects/{subject_id}/daily-records", json=daily, headers=headers())
    saved_event = client.post(f"/api/v1/subjects/{subject_id}/events", json=event, headers=headers())

    assert first.status_code == replay.status_code == saved_event.status_code == 201
    assert replay.json()["record_id"] == first.json()["record_id"]
    assert first.json()["author_id"] == "tutor-1"
    assert first.json()["provenance"] == daily["provenance"]

    timeline = client.get(
        f"/api/v1/subjects/{subject_id}/timeline",
        params={"as_of": "2026-08-26T12:00:00-04:00", "days": 1},
    )
    assert timeline.status_code == 200
    assert [entry["kind"] for entry in timeline.json()["entries"]] == ["event", "daily_record"]


def test_end_of_day_is_unavailable_until_local_day_closes_and_never_leaks_backward(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = onboard(client)
    end_of_day = {
        "occurred_at": "2026-08-26T20:00:00-04:00",
        "idempotency_key": "eod-1",
        "provenance": {"source": "caregiver", "synthetic": False},
        "day_regulation_level": "Estable con Apoyo",
    }

    saved = client.post(f"/api/v1/subjects/{subject_id}/end-of-day", json=end_of_day, headers=headers())
    assert saved.status_code == 201
    assert saved.json()["availability_timestamp"] == "2026-08-27T00:00:00-04:00"
    assert saved.json()["prediction_availability"] == "prior_day_only"

    before_close = client.get(
        f"/api/v1/subjects/{subject_id}/timeline",
        params={"as_of": "2026-08-26T23:00:00-04:00", "days": 1},
    )
    after_close = client.get(
        f"/api/v1/subjects/{subject_id}/timeline",
        params={"as_of": "2026-08-27T00:01:00-04:00", "days": 2},
    )

    assert before_close.status_code == after_close.status_code == 200
    assert before_close.json()["entries"] == []
    assert after_close.json()["entries"][0]["payload"]["day_regulation_level"] == "Estable con Apoyo"


def test_care_write_uses_contract_v2_and_rejects_unsafe_input_without_persisting(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = onboard(client)
    payload = {
        "occurred_at": "2026-08-26T07:30:00-04:00",
        "idempotency_key": "daily-contract-v2",
        "provenance": {"source": "caregiver", "synthetic": False},
        "sleep_quality": "Reparador",
    }

    saved = client.post(f"/api/v1/subjects/{subject_id}/daily-records", json=payload, headers=headers())
    rejected = client.post(
        f"/api/v1/subjects/{subject_id}/daily-records",
        json={**payload, "idempotency_key": "daily-naive", "occurred_at": "2026-08-26T07:30:00"},
        headers=headers(),
    )
    timeline = client.get(
        f"/api/v1/subjects/{subject_id}/timeline",
        params={"as_of": "2026-08-26T12:00:00-04:00", "days": 1},
    )

    assert saved.status_code == 201
    assert saved.json()["contract_version"] == "2.0"
    assert rejected.status_code == 422
    assert [entry["entry_id"] for entry in timeline.json()["entries"]] == [saved.json()["record_id"]]

from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app import prediction_service
from backend.app.routes import predictions, subjects


def _headers() -> dict[str, str]:
    return {"X-Actor-Id": "tutor-1", "X-Actor-Role": "tutor"}


def _onboard(client: TestClient) -> str:
    response = client.post("/api/v1/subjects", json={
        "subject_id": "prediction-subject",
        "display_name": "Prediction Subject",
        "timezone": "America/Santiago",
        "authorized_tutor_ids": ["tutor-1"],
    })
    assert response.status_code == 201
    return response.json()["subject_id"]


def test_prediction_snapshot_is_cutoff_safe_and_never_exposes_model_score(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    monkeypatch.setattr(prediction_service, "get_subject_paths", lambda subject_id: (tmp_path / subject_id, False))
    client = TestClient(app)
    subject_id = _onboard(client)

    event = {
        "occurred_at": "2026-08-26T12:01:00-04:00",
        "idempotency_key": "future-event",
        "provenance": {"source": "caregiver", "synthetic": False},
        "event_type": "Later event",
        "intensity_value": 4,
    }
    assert client.post(f"/api/v1/subjects/{subject_id}/events", json=event, headers=_headers()).status_code == 201

    response = client.post("/api/v1/predictions", json={
        "subject_id": subject_id,
        "prediction_cutoff": "2026-08-26T12:00:00-04:00",
    })

    assert response.status_code == 200
    prediction = response.json()
    assert prediction["prediction_id"]
    assert prediction["risk"] is None
    assert prediction["confidence"] == "INSUFFICIENT"
    assert prediction["abstained"] is True
    assert prediction["missingness"]
    assert "model_score" not in prediction
    assert prediction["provenance"]["synthetic"] is False

    snapshot = (tmp_path / subject_id / "predictions" / f"{prediction['prediction_id']}.json").read_text(encoding="utf-8")
    assert "Later event" not in snapshot
    assert '"prediction_id"' in snapshot


def test_later_event_and_end_of_day_cannot_rewrite_an_existing_prediction_snapshot(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    monkeypatch.setattr(prediction_service, "get_subject_paths", lambda subject_id: (tmp_path / subject_id, False))
    client = TestClient(app)
    subject_id = _onboard(client)

    earlier_daily_record = {
        "occurred_at": "2026-08-26T07:30:00-04:00",
        "idempotency_key": "daily-before-cutoff",
        "provenance": {"source": "caregiver", "synthetic": False},
        "sleep_quality": "Restful",
    }
    assert client.post(
        f"/api/v1/subjects/{subject_id}/daily-records", json=earlier_daily_record, headers=_headers()
    ).status_code == 201
    created = client.post("/api/v1/predictions", json={
        "subject_id": subject_id,
        "prediction_cutoff": "2026-08-26T12:00:00-04:00",
    })

    assert created.status_code == 200
    prediction = created.json()
    snapshot_path = tmp_path / subject_id / "predictions" / f"{prediction['prediction_id']}.json"
    snapshot_before_later_writes = snapshot_path.read_text(encoding="utf-8")
    assert "Restful" in snapshot_before_later_writes
    assert prediction["contract_version"] == "2"
    assert "model_score" not in prediction

    later_event = {
        "occurred_at": "2026-08-26T12:01:00-04:00",
        "idempotency_key": "event-after-cutoff",
        "provenance": {"source": "caregiver", "synthetic": False},
        "event_type": "Later event",
        "intensity_value": 4,
    }
    later_end_of_day = {
        "occurred_at": "2026-08-26T20:00:00-04:00",
        "idempotency_key": "end-of-day-after-cutoff",
        "provenance": {"source": "caregiver", "synthetic": False},
        "day_regulation_level": "Stable with support",
    }
    assert client.post(f"/api/v1/subjects/{subject_id}/events", json=later_event, headers=_headers()).status_code == 201
    assert client.post(f"/api/v1/subjects/{subject_id}/end-of-day", json=later_end_of_day, headers=_headers()).status_code == 201

    reloaded = client.get(f"/api/v1/predictions/{prediction['prediction_id']}", headers=_headers())

    assert reloaded.status_code == 200
    assert reloaded.json() == prediction
    assert snapshot_path.read_text(encoding="utf-8") == snapshot_before_later_writes
    assert "Later event" not in snapshot_before_later_writes
    assert "Stable with support" not in snapshot_before_later_writes


def test_outcome_confirmation_requires_actor_and_replays_persisted_lineage(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    monkeypatch.setattr(prediction_service, "get_subject_paths", lambda subject_id: (tmp_path / subject_id, False))
    monkeypatch.setattr(predictions, "find_subject_dir_by_prediction_id", lambda prediction_id: tmp_path / "prediction-subject")
    client = TestClient(app)
    subject_id = _onboard(client)
    prediction = client.post("/api/v1/predictions", json={
        "subject_id": subject_id,
        "prediction_cutoff": "2026-08-26T12:00:00-04:00",
    }).json()
    payload = {"actual_outcome": True, "idempotency_key": "outcome-1", "provenance": {"source": "tutor", "synthetic": False}}

    denied = client.post(f"/api/v1/predictions/{prediction['prediction_id']}/outcome", json=payload)
    first = client.post(f"/api/v1/predictions/{prediction['prediction_id']}/outcome", json=payload, headers=_headers())
    replay = client.post(f"/api/v1/predictions/{prediction['prediction_id']}/outcome", json=payload, headers=_headers())

    assert denied.status_code == 401
    assert first.status_code == replay.status_code == 201
    assert first.json()["outcome_id"] == replay.json()["outcome_id"]
    assert first.json()["actor_id"] == "tutor-1"
    assert first.json()["prediction_id"] == prediction["prediction_id"]
    reloaded = client.get(f"/api/v1/predictions/{prediction['prediction_id']}", headers=_headers())
    assert reloaded.status_code == 200
    assert reloaded.json()["prediction_id"] == prediction["prediction_id"]
    assert "model_score" not in reloaded.json()
    assert len((tmp_path / subject_id / "outcomes.json").read_text(encoding="utf-8").split('"outcome_id"')) == 2


def test_reopening_evolucion_reuses_the_saved_estimate_until_the_data_or_the_hour_change(tmp_path: Path, monkeypatch) -> None:
    """P5: abrir Evolución no guarda otra copia con todo el historial si nada cambió."""
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    monkeypatch.setattr(prediction_service, "get_subject_paths", lambda subject_id: (tmp_path / subject_id, False))
    client = TestClient(app)
    subject_id = _onboard(client)

    def predict(cutoff: str) -> str:
        return client.post("/api/v1/predictions", json={"subject_id": subject_id, "prediction_cutoff": cutoff}).json()["prediction_id"]

    def snapshots() -> int:
        return len([path for path in (tmp_path / subject_id / "predictions").glob("*.json") if path.name != "index.json"])

    first = predict("2026-08-26T12:05:00-04:00")
    again = predict("2026-08-26T12:40:00-04:00")
    assert again == first
    assert snapshots() == 1

    client.post(f"/api/v1/subjects/{subject_id}/daily-records", headers=_headers(), json={
        "occurred_at": "2026-08-26T08:00:00-04:00", "idempotency_key": "basal",
        "provenance": {"source": "tutor_app", "synthetic": False}, "sleep_quality": "Reparador",
    })
    after_new_data = predict("2026-08-26T12:50:00-04:00")
    next_hour = predict("2026-08-26T13:10:00-04:00")
    assert len({first, after_new_data, next_hour}) == 3
    assert snapshots() == 3


def test_a_confirmed_crisis_is_a_dysregulation_of_that_day_and_never_in_the_future(tmp_path: Path, monkeypatch) -> None:
    """P8: la confirmación queda como desregulación, cuenta en el día y no se fecha después de ahora."""
    import json
    from datetime import datetime, timedelta, timezone

    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    monkeypatch.setattr(prediction_service, "get_subject_paths", lambda subject_id: (tmp_path / subject_id, False))
    monkeypatch.setattr(predictions, "find_subject_dir_by_prediction_id", lambda prediction_id: tmp_path / "prediction-subject")
    client = TestClient(app)
    subject_id = _onboard(client)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    prediction = client.post("/api/v1/predictions", json={"subject_id": subject_id, "prediction_cutoff": cutoff.isoformat()}).json()

    response = client.post(f"/api/v1/predictions/{prediction['prediction_id']}/outcome", headers=_headers(), json={
        "actual_outcome": True, "idempotency_key": "crisis", "provenance": {"source": "tutor", "synthetic": False},
    })

    assert response.status_code == 201
    occurrence = json.loads((tmp_path / subject_id / "occurrences.json").read_text(encoding="utf-8"))[-1]
    assert occurrence["event_type"] == "Desregulación Emocional"
    assert occurrence["source"] == "outcome_confirmation"
    when = datetime.fromisoformat(occurrence["source_timestamp"])
    assert cutoff < when <= datetime.now(timezone.utc)
    records = json.loads((tmp_path / subject_id / "records.json").read_text(encoding="utf-8"))
    assert any(record.get("dysregulation_count") == 1 for record in records)


def test_a_crisis_confirmed_right_after_the_estimate_shows_up_in_today_history(tmp_path: Path, monkeypatch) -> None:
    """Confirmar en el mismo minuto de la estimación no puede dejar la crisis fechada en el futuro."""
    import json
    from datetime import datetime, timedelta, timezone

    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    monkeypatch.setattr(prediction_service, "get_subject_paths", lambda subject_id: (tmp_path / subject_id, False))
    monkeypatch.setattr(predictions, "find_subject_dir_by_prediction_id", lambda prediction_id: tmp_path / "prediction-subject")
    client = TestClient(app)
    subject_id = _onboard(client)
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=5)
    prediction = client.post("/api/v1/predictions", json={"subject_id": subject_id, "prediction_cutoff": cutoff.isoformat()}).json()
    client.post(f"/api/v1/predictions/{prediction['prediction_id']}/outcome", headers=_headers(), json={
        "actual_outcome": True, "idempotency_key": "now", "provenance": {"source": "tutor", "synthetic": False},
    })

    timeline = client.get(f"/api/v1/subjects/{subject_id}/timeline", params={"as_of": datetime.now(timezone.utc).isoformat(), "days": 1})

    assert any(entry["kind"] == "event" for entry in timeline.json()["entries"])

"""Tests de Fase 0: codificación texto -> número, severidad y event_count diario."""
from pathlib import Path
import json

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routes import subjects


def _onboard(client: TestClient, timezone: str = "America/Santiago") -> str:
    response = client.post("/api/v1/subjects", json={
        "display_name": "Alex Rivera",
        "timezone": timezone,
        "baseline": {},
        "provenance": {"source": "caregiver_onboarding", "synthetic": False},
    })
    assert response.status_code == 201
    return response.json()["subject_id"]


def _headers() -> dict[str, str]:
    return {"X-Actor-Id": "tutor-1", "X-Actor-Role": "tutor"}


def test_daily_record_encodes_text_to_raw_and_numeric_to_root(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)

    payload = {
        "occurred_at": "2026-08-26T07:30:00-04:00",
        "idempotency_key": "daily-encoded-1",
        "provenance": {"source": "caregiver", "synthetic": False},
        "sleep_quality": "Reparador",
        "wake_mode": "Tranquilo/Alegre",
        "start_autonomy": "Por sí solo",
        "medication_adherence": "Sí",
        "gi_status": "Normal",
    }

    saved = client.post(
        f"/api/v1/subjects/{subject_id}/daily-records", json=payload, headers=_headers()
    ).json()

    # Contraparte numérica en la raíz con nombre estable.
    assert saved["sleep_quality"] == 8
    assert saved["wake_state"] == 2
    assert saved["start_autonomy_level"] == 0
    assert saved["medication_taken"] == 1
    assert saved["gi_level"] == 0

    # Texto original conservado en raw.
    assert saved["raw"] == {
        "sleep_quality": "Reparador",
        "wake_mode": "Tranquilo/Alegre",
        "start_autonomy": "Por sí solo",
        "medication_adherence": "Sí",
        "gi_status": "Normal",
    }

    # Los nombres de texto antiguos no quedan en la raíz.
    for legacy_field in ("wake_mode", "start_autonomy", "medication_adherence", "gi_status"):
        assert legacy_field not in saved


def test_medication_no_aplica_omits_numeric_field(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)

    saved = client.post(f"/api/v1/subjects/{subject_id}/daily-records", json={
        "occurred_at": "2026-08-26T07:30:00-04:00",
        "idempotency_key": "daily-no-aplica",
        "provenance": {"source": "caregiver", "synthetic": False},
        "medication_adherence": "No Aplica",
    }, headers=_headers()).json()

    assert saved["raw"]["medication_adherence"] == "No Aplica"
    assert "medication_taken" not in saved


def test_end_of_day_encodes_regulation_level(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)

    saved = client.post(f"/api/v1/subjects/{subject_id}/end-of-day", json={
        "occurred_at": "2026-08-26T20:00:00-04:00",
        "idempotency_key": "eod-encoded",
        "provenance": {"source": "caregiver", "synthetic": False},
        "day_regulation_level": "Desregulación Frecuente",
    }, headers=_headers()).json()

    assert saved["day_regulation_level_num"] == 2
    assert saved["raw"]["day_regulation_level"] == "Desregulación Frecuente"


def test_dysregulation_events_get_severity_label(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)

    def save_event(event_type: str, intensity: int) -> dict:
        return client.post(f"/api/v1/subjects/{subject_id}/events", json={
            "occurred_at": "2026-08-26T10:00:00-04:00",
            "idempotency_key": f"evt-{event_type}-{intensity}",
            "provenance": {"source": "caregiver", "synthetic": False},
            "event_type": event_type,
            "intensity_value": intensity,
        }, headers=_headers()).json()

    assert save_event("Desregulación Emocional", 9)["severity"] == "severe"
    assert save_event("Desregulación Emocional", 4)["severity"] == "moderate"
    assert save_event("Desregulación Emocional", 2)["severity"] == "mild"

    # Las demás categorías no generan etiqueta de severidad.
    assert "severity" not in save_event("Alimentación", 5)
    assert "severity" not in save_event("Transición de Actividad", 6)


def test_event_detail_is_stored_and_unanswered_fields_are_not(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)
    base = {
        "occurred_at": "2026-08-26T10:00:00-04:00",
        "provenance": {"source": "tutor_app", "synthetic": False},
    }

    detailed = client.post(f"/api/v1/subjects/{subject_id}/events", json={
        **base,
        "idempotency_key": "evt-detail",
        "event_type": "Desregulación Emocional",
        "intensity_value": 6,
        "trigger": ["Ruidos", "Espera"],
        "strategy_applied": ["Espacio seguro"],
        "strategy_outcome": "Regulación Parcial",
        "notes": "Después del recreo",
    }, headers=_headers()).json()
    assert detailed["trigger"] == ["Ruidos", "Espera"]
    assert detailed["strategy_applied"] == ["Espacio seguro"]
    assert detailed["strategy_outcome"] == "Regulación Parcial"
    assert detailed["notes"] == "Después del recreo"
    assert detailed["quick_capture"] is False

    quick = client.post(f"/api/v1/subjects/{subject_id}/events", json={
        **base,
        "idempotency_key": "evt-quick",
        "event_type": "Transición de Actividad",
        "intensity_value": 5,
        "qualitative_outcome": "Con ayuda",
        "trigger": [],
        "quick_capture": True,
    }, headers=_headers()).json()
    assert quick["qualitative_outcome"] == "Con ayuda"
    assert quick["quick_capture"] is True
    for key in ("trigger", "strategy_applied", "support_used", "notes"):
        assert key not in quick


def test_event_count_aggregation_by_local_day(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client, timezone="America/Santiago")

    def post_event(at: str, event_type: str, intensity: int, key: str) -> None:
        response = client.post(f"/api/v1/subjects/{subject_id}/events", json={
            "occurred_at": at,
            "idempotency_key": key,
            "provenance": {"source": "caregiver", "synthetic": False},
            "event_type": event_type,
            "intensity_value": intensity,
        }, headers=_headers())
        assert response.status_code == 201

    post_event("2026-08-26T10:00:00-04:00", "Desregulación Emocional", 9, "e1")
    post_event("2026-08-26T14:00:00-04:00", "Alimentación", 3, "e2")
    post_event("2026-08-26T16:00:00-04:00", "Desregulación Emocional", 4, "e3")

    records = json.loads((tmp_path / subject_id / "records.json").read_text(encoding="utf-8"))
    day_record = next(r for r in records if r["date"] == "2026-08-26")
    assert day_record["event_count"] == 3
    assert day_record["dysregulation_count"] == 2
    assert day_record["max_intensity"] == 9

    # Un nuevo día genera su propio registro mínimo.
    post_event("2026-08-27T09:00:00-04:00", "Alimentación", 2, "e4")
    records = json.loads((tmp_path / subject_id / "records.json").read_text(encoding="utf-8"))
    assert next(r for r in records if r["date"] == "2026-08-27")["event_count"] == 1
    assert next(r for r in records if r["date"] == "2026-08-26")["event_count"] == 3


def test_event_detail_counts_feed_the_daily_record(tmp_path: Path, monkeypatch) -> None:
    """Disparadores, estrategias y desregulaciones sin regular llegan al registro del día."""
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client, timezone="America/Santiago")

    def post_event(key: str, at: str, triggers: list[str], strategies: list[str], outcome: str) -> None:
        response = client.post(f"/api/v1/subjects/{subject_id}/events", json={
            "occurred_at": at, "idempotency_key": key,
            "provenance": {"source": "tutor_app", "synthetic": False},
            "event_type": "Desregulación Emocional", "intensity_value": 6,
            "trigger": triggers, "strategy_applied": strategies, "strategy_outcome": outcome,
        }, headers=_headers())
        assert response.status_code == 201

    post_event("d1", "2026-08-26T10:00:00-04:00", ["Ruidos", "Espera"], ["Espacio seguro"], "Sin Regulación")
    post_event("d2", "2026-08-26T15:00:00-04:00", ["Frustración"], ["Presión profunda", "Pictogramas"], "Regulación Exitosa")

    records = json.loads((tmp_path / subject_id / "records.json").read_text(encoding="utf-8"))
    day = next(r for r in records if r["date"] == "2026-08-26")
    assert day["trigger_count"] == 3        # 2 + 1 disparadores
    assert day["strategy_count"] == 3       # 1 + 2 estrategias
    assert day["dysregulation_unresolved"] == 1  # solo el primero terminó sin regular


def test_planned_event_is_stored(tmp_path: Path, monkeypatch) -> None:
    """Planificación: un evento planificado se guarda con su expectativa."""
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)

    saved = client.post(f"/api/v1/subjects/{subject_id}/planned-events", headers=_headers(), json={
        "title": "Cita con el dentista",
        "starts_at": "2026-08-26T15:00:00-04:00",
        "category": "Salud",
        "expectation": "Desagradable",
    }).json()

    assert saved["title"] == "Cita con el dentista"
    assert saved["expectation"] == "Desagradable"
    assert "planned_event_id" in saved

    stored = json.loads((tmp_path / subject_id / "planned_events.json").read_text(encoding="utf-8"))
    assert len(stored) == 1
    assert stored[0]["expectation"] == "Desagradable"


def test_event_scales_become_daily_numbers_and_absent_scales_stay_absent(tmp_path: Path, monkeypatch) -> None:
    """P22: la escala de Transición, Alimentación y Dieta sensorial llega al registro del día."""
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)

    def post_event(at: str, event_type: str, scale: str, key: str) -> None:
        response = client.post(f"/api/v1/subjects/{subject_id}/events", json={
            "occurred_at": at, "idempotency_key": key,
            "provenance": {"source": "tutor_app", "synthetic": False},
            "event_type": event_type, "intensity_value": 5, "qualitative_outcome": scale,
        }, headers=_headers())
        assert response.status_code == 201

    post_event("2026-08-26T09:00:00-04:00", "Transición de Actividad", "Fácil", "t1")
    post_event("2026-08-26T15:00:00-04:00", "Transición de Actividad", "Difícil", "t2")
    post_event("2026-08-26T13:00:00-04:00", "Dieta Sensorial", "Parcial", "s1")

    records = json.loads((tmp_path / subject_id / "records.json").read_text(encoding="utf-8"))
    day = next(r for r in records if r["date"] == "2026-08-26")
    assert day["transition_difficulty"] == 2  # el peor momento del día
    assert day["sensory_diet_done"] == 0.5
    assert "feeding_difficulty" not in day  # sin comidas registradas: falta, no es «Adecuada»


def test_a_strategy_that_worked_is_remembered_once_as_an_effective_support(tmp_path: Path, monkeypatch) -> None:
    """PCD Fase 2.3: lo que funcionó alimenta «Qué puedo hacer ahora»."""
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)

    def post_event(key: str, outcome: str) -> None:
        client.post(f"/api/v1/subjects/{subject_id}/events", json={
            "occurred_at": "2026-08-26T10:00:00-04:00", "idempotency_key": key,
            "provenance": {"source": "tutor_app", "synthetic": False},
            "event_type": "Desregulación Emocional", "intensity_value": 7,
            "strategy_applied": ["Espacio seguro", "Otro"], "strategy_outcome": outcome,
        }, headers=_headers())

    post_event("e1", "Sin Regulación")
    assert json.loads((tmp_path / subject_id / "profile.json").read_text(encoding="utf-8"))["historical_supports"] == []

    post_event("e2", "Regulación Exitosa")
    post_event("e3", "Regulación Exitosa")
    supports = json.loads((tmp_path / subject_id / "profile.json").read_text(encoding="utf-8"))["historical_supports"]
    assert [(s["description"], s["effective"]) for s in supports] == [("Espacio seguro", True)]


def test_daily_record_date_uses_the_profile_timezone_not_the_device_offset(tmp_path: Path, monkeypatch) -> None:
    """P3: 22:30 en Santiago llega como 01:30 UTC del día siguiente si el dispositivo está en UTC."""
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client, timezone="America/Santiago")
    provenance = {"source": "caregiver", "synthetic": False}

    record = client.post(f"/api/v1/subjects/{subject_id}/daily-records", headers=_headers(), json={
        "occurred_at": "2026-11-03T01:30:00+00:00", "idempotency_key": "late-basal",
        "provenance": provenance, "sleep_quality": "Reparador",
    })
    event = client.post(f"/api/v1/subjects/{subject_id}/events", headers=_headers(), json={
        "occurred_at": "2026-11-02T22:45:00-03:00", "idempotency_key": "late-event",
        "provenance": provenance, "event_type": "Desregulación Emocional", "intensity_value": 5,
    })

    assert record.status_code == event.status_code == 201
    assert record.json()["date"] == "2026-11-02"
    records = json.loads((tmp_path / subject_id / "records.json").read_text(encoding="utf-8"))
    # El evento del mismo día local suma sus conteos al registro basal, sin crear otro.
    assert len(records) == 1
    assert records[0]["event_count"] == 1


def test_day_context_is_encoded_and_unanswered_questions_are_not_stored(tmp_path: Path, monkeypatch) -> None:
    """«¿Pasó algo distinto hoy?»: texto en raw, número en la raíz; «No sé» y lo no respondido no generan número."""
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)

    response = client.post(f"/api/v1/subjects/{subject_id}/daily-records", headers=_headers(), json={
        "occurred_at": "2026-11-03T08:00:00-03:00",
        "idempotency_key": "context-1",
        "provenance": {"source": "tutor_app", "synthetic": False},
        "sleep_quality": "Interrumpido",
        "sleep_hours_range": "No sé",
        "early_signs": ["Se aísla", "Más irritable"],
        "physical_discomfort": ["No"],
        "routine_change": "Visita",
        "school_attendance": "Medio día",
    })

    assert response.status_code == 201
    stored = response.json()
    assert stored["early_signs_count"] == 2
    assert stored["physical_discomfort"] == 0
    assert stored["routine_change"] == 1
    assert stored["school_attendance"] == 0.5
    assert "sleep_hours" not in stored  # «No sé» no es un dato
    assert stored["raw"]["early_signs"] == ["Se aísla", "Más irritable"]
    assert stored["raw"]["sleep_hours_range"] == "No sé"


def test_none_option_counts_as_zero_early_signs(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(subjects, "SUBJECTS_ROOT", tmp_path)
    client = TestClient(app)
    subject_id = _onboard(client)

    stored = client.post(f"/api/v1/subjects/{subject_id}/daily-records", headers=_headers(), json={
        "occurred_at": "2026-11-03T08:00:00-03:00", "idempotency_key": "context-2",
        "provenance": {"source": "tutor_app", "synthetic": False},
        "early_signs": ["Ninguna"], "physical_discomfort": ["Fiebre", "Dolor"],
    }).json()

    assert stored["early_signs_count"] == 0
    assert stored["physical_discomfort"] == 1

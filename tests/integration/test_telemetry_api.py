"""
Integration tests for the NeuraDash Telemetry API endpoints.

Uses FastAPI TestClient (httpx) to exercise the full request lifecycle.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from engine.telemetry_store import TelemetryStore


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clean_test_telemetry() -> Any:
    """Remove test telemetry files after each test."""
    yield
    proj_root = Path(__file__).resolve().parents[2]
    data_dir = proj_root / "data"
    for f in data_dir.glob("telemetry_TEST-*"):
        f.unlink(missing_ok=True)


# =====================================================================
# POST /api/v1/telemetry — Ingest
# =====================================================================

class TestIngestEndpoint:

    def test_valid_payload_returns_200(self, client: TestClient) -> None:
        payload = {
            "subject_id": "TEST-INGEST",
            "device_id": "watch_001",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "observations": [
                {
                    "signal": "heart_rate",
                    "value": 75.0,
                    "unit": "bpm",
                    "window": "adaptive",
                    "provenance": {
                        "origin": "test_device",
                        "synthetic_flag": False,
                    },
                }
            ],
        }
        resp = client.post("/api/v1/telemetry", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["stored_count"] == 1
        assert body["subject_id"] == "TEST-INGEST"

    def test_invalid_unit_returns_422(self, client: TestClient) -> None:
        payload = {
            "subject_id": "TEST-INVALID",
            "device_id": "watch_001",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "observations": [
                {
                    "signal": "environmental_noise",
                    "value": 50.0,
                    "unit": "Hz",  # wrong — should be dBA
                    "window": "15m",
                    "provenance": {
                        "origin": "test_device",
                        "synthetic_flag": False,
                    },
                }
            ],
        }
        resp = client.post("/api/v1/telemetry", json=payload)
        assert resp.status_code == 422

    def test_missing_provenance_returns_422(self, client: TestClient) -> None:
        payload = {
            "subject_id": "TEST-NOPROV",
            "device_id": "watch_001",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "observations": [
                {
                    "signal": "heart_rate",
                    "value": 72.0,
                    "unit": "bpm",
                    "window": "adaptive",
                    # provenance intentionally omitted
                }
            ],
        }
        resp = client.post("/api/v1/telemetry", json=payload)
        assert resp.status_code == 422

    def test_multiple_observations(self, client: TestClient) -> None:
        payload = {
            "subject_id": "TEST-MULTI",
            "device_id": "sensor_hub",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "observations": [
                {
                    "signal": "environmental_noise",
                    "value": 45.0,
                    "unit": "dBA",
                    "window": "adaptive",
                    "provenance": {"origin": "mic_01", "synthetic_flag": False},
                },
                {
                    "signal": "heart_rate",
                    "value": 78.0,
                    "unit": "bpm",
                    "window": "adaptive",
                    "provenance": {"origin": "watch_01", "synthetic_flag": False},
                },
            ],
        }
        resp = client.post("/api/v1/telemetry", json=payload)
        assert resp.status_code == 200
        assert resp.json()["stored_count"] == 2


# =====================================================================
# POST /api/v1/telemetry/simulate — Simulation
# =====================================================================

class TestSimulateEndpoint:

    def test_estable_profile(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/telemetry/simulate",
            json={"subject_id": "TEST-SIM-E", "profile": "estable", "seed": 42},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["stored_count"] > 0
        assert "estable" in body["message"]

    def test_riesgo_profile_generates_more_data(self, client: TestClient) -> None:
        resp_e = client.post(
            "/api/v1/telemetry/simulate",
            json={"subject_id": "TEST-SIM-R1", "profile": "estable", "seed": 42},
        )
        resp_r = client.post(
            "/api/v1/telemetry/simulate",
            json={"subject_id": "TEST-SIM-R2", "profile": "riesgo_acumulado", "seed": 42},
        )
        # Riesgo should generate more adaptive readings than estable
        assert resp_r.json()["stored_count"] > resp_e.json()["stored_count"]

    def test_datos_insuficientes_profile(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/telemetry/simulate",
            json={"subject_id": "TEST-SIM-D", "profile": "datos_insuficientes", "seed": 1},
        )
        assert resp.status_code == 200
        # May have 0 or a few stale observations
        assert resp.json()["stored_count"] <= 5

    def test_invalid_profile_returns_422(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/telemetry/simulate",
            json={"subject_id": "TEST-SIM-X", "profile": "invalid_one"},
        )
        assert resp.status_code == 422


# =====================================================================
# GET /api/v1/telemetry/{subject_id} — Read
# =====================================================================

class TestReadEndpoint:

    def test_read_after_ingest(self, client: TestClient) -> None:
        # First, ingest some data
        client.post(
            "/api/v1/telemetry",
            json={
                "subject_id": "TEST-READ",
                "device_id": "watch_001",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "observations": [
                    {
                        "signal": "heart_rate",
                        "value": 77.0,
                        "unit": "bpm",
                        "window": "adaptive",
                        "provenance": {"origin": "test", "synthetic_flag": False},
                    }
                ],
            },
        )

        resp = client.get("/api/v1/telemetry/TEST-READ?hours=24")
        assert resp.status_code == 200
        body = resp.json()
        assert body["subject_id"] == "TEST-READ"
        assert body["total_observations"] >= 1

    def test_read_empty_subject(self, client: TestClient) -> None:
        resp = client.get("/api/v1/telemetry/NONEXISTENT-SUBJECT?hours=24")
        assert resp.status_code == 200
        assert resp.json()["total_observations"] == 0

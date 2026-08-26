import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timezone, timedelta
from pathlib import Path
import json
import shutil

from backend.app.main import app
from engine.schemas import ConfidenceLevel, CONTRACT_VERSION


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_anonymous_subject_onboarding(client: TestClient) -> None:
    # Onboard a new subject with valid IANA timezone and context
    payload = {
        "subject_id": "sub_onboard_test",
        "timezone": "America/New_York",
        "sensory_context": {"sensory_profile": "Hypersensitive"},
        "habitual_context": {"exercise": "bedtime stretching"},
        "historical_supports": [
            {"id": "hist_1", "description": "Weighted blanket"}
        ]
    }
    
    # 1. Successful onboarding
    response = client.post("/api/v1/subjects", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["subject_id"] == "sub_onboard_test"
    assert data["timezone"] == "America/New_York"
    assert data["cold_start"] is True
    assert "provisional_baseline" in data

    # 2. Re-onboarding or getting subject
    get_resp = client.get("/api/v1/subjects/sub_onboard_test")
    assert get_resp.status_code == 200
    assert get_resp.json()["subject_id"] == "sub_onboard_test"

    # 3. Timezone validation failure
    bad_payload = payload.copy()
    bad_payload["subject_id"] = "sub_bad_tz"
    bad_payload["timezone"] = "Invalid/Timezone_Name"
    
    bad_resp = client.post("/api/v1/subjects", json=bad_payload)
    assert bad_resp.status_code == 422
    assert bad_resp.json()["code"] == "http_422"


def test_subject_not_found_404(client: TestClient) -> None:
    # Nonexistent subject should return 404
    resp = client.get("/api/v1/subjects/nonexistent_subject")
    assert resp.status_code == 404
    assert resp.json()["code"] == "http_404"

    # Prediction for nonexistent subject
    pred_resp = client.post("/api/v1/predictions", json={
        "subject_id": "nonexistent_subject",
        "prediction_cutoff": datetime.now(timezone.utc).isoformat()
    })
    assert pred_resp.status_code == 404
    
    # Timeline for nonexistent subject
    timeline_resp = client.get("/api/v1/subjects/nonexistent_subject/timeline?as_of=2026-08-26T12:00:00Z")
    assert timeline_resp.status_code == 404


def test_prediction_requests_and_abstention(client: TestClient) -> None:
    # Test prediction flow for a new subject (cold start, should abstain with HTTP 200)
    subject_id = "sub_predict_test"
    
    # Onboard
    client.post("/api/v1/subjects", json={
        "subject_id": subject_id,
        "timezone": "UTC",
        "sensory_context": {},
        "habitual_context": {},
        "historical_supports": []
    })
    
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    
    # 1. Prediction request (should abstain since no model exists)
    pred_payload = {
        "subject_id": subject_id,
        "prediction_cutoff": cutoff.isoformat(),
        "school_records": [{"record_id": "school_1", "grade": 8}] # future boundary data
    }
    
    pred_resp = client.post("/api/v1/predictions", json=pred_payload)
    assert pred_resp.status_code == 200
    
    pred_data = pred_resp.json()
    assert pred_data["contract_version"] == CONTRACT_VERSION
    assert pred_data["subject_id"] == subject_id
    assert pred_data["risk"] is None
    assert pred_data["abstained"] is True
    assert pred_data["confidence"] == ConfidenceLevel.INSUFFICIENT
    assert "versions" in pred_data
    assert "provenance" in pred_data
    # Provenance tracks school record exclusion
    assert pred_data["provenance"]["excluded_from_core"] is True


def test_invalid_input_validation_422(client: TestClient) -> None:
    # 1. Naive cutoff timestamp (should raise 422 validation error)
    naive_cutoff = "2026-08-26T12:00:00"
    resp = client.post("/api/v1/predictions", json={
        "subject_id": "sub_predict_test",
        "prediction_cutoff": naive_cutoff
    })
    assert resp.status_code == 422
    assert resp.json()["code"] == "http_422"

    # 2. Missing subject_id in prediction body
    resp_missing = client.post("/api/v1/predictions", json={
        "prediction_cutoff": datetime.now(timezone.utc).isoformat()
    })
    assert resp_missing.status_code == 422
    assert "input" not in resp_missing.json().get("details", {}).get("request", "")


def test_demo_profile_predict_and_retrain(client: TestClient) -> None:
    # Demo profile: PAC-A
    # We will invoke the demo profile prediction endpoint
    # First, let's verify it can predict and retrain
    pid = "PAC-A"
    
    # Predict for PAC-A (demands a cutoff)
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    payload = {
        "prediction_cutoff": cutoff.isoformat()
    }
    
    resp = client.post(f"/api/v1/demo/profiles/{pid}/predict", json=payload)
    # If the demo profile models/data are loaded, it will return prediction (abstained or active risk)
    # The response should be 200
    assert resp.status_code == 200
    pred_data = resp.json()
    assert pred_data["subject_id"] == pid
    assert "abstained" in pred_data

    # Retrain for PAC-A
    retrain_resp = client.post(f"/api/v1/demo/profiles/{pid}/retrain")
    assert retrain_resp.status_code == 200
    retrain_data = retrain_resp.json()
    assert "promoted" in retrain_data
    assert "audit_record" in retrain_data


def test_outcome_route(client: TestClient) -> None:
    # Onboard subject and create mock prediction file manually to confirm outcome
    subject_id = "sub_outcome_test"
    client.post("/api/v1/subjects", json={
        "subject_id": subject_id,
        "timezone": "UTC",
        "sensory_context": {},
        "habitual_context": {},
        "historical_supports": []
    })

    # Call outcome confirmation on nonexistent prediction id
    resp_bad = client.post("/api/v1/predictions/nonexistent_pred/outcome", json={
        "actual_outcome": True
    })
    assert resp_bad.status_code == 404

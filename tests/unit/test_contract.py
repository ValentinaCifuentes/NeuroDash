from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.app.data_provider import CsvJsonDataProvider
from backend.app.schemas import PredictionContractV2
from engine.schemas import ConfidenceLevel


def prediction_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "contract_version": "2", "subject_id": "subject-001",
        "prediction_cutoff": "2026-08-26T12:00:00+00:00", "horizon_hours": 24,
        "risk": None, "model_score": None, "confidence": ConfidenceLevel.INSUFFICIENT,
        "abstained": True, "factors": [], "missingness": [], "supports": [],
        "provenance": {"origin": "synthetic"}, "versions": {"schema": "2"},
    }
    payload.update(overrides)
    return payload


def test_prediction_contract_rejects_any_non_v2_version() -> None:
    with pytest.raises(ValueError, match="contract_version"):
        PredictionContractV2.model_validate(prediction_payload(contract_version="3"))


def test_prediction_contract_preserves_top_level_nullable_technical_score() -> None:
    contract = PredictionContractV2.model_validate(prediction_payload(model_score=0.42))
    assert contract.model_dump(mode="json")["model_score"] == 0.42
    assert contract.model_dump(mode="json")["confidence"] == "INSUFFICIENT"


def test_prediction_contract_allows_a_null_technical_score() -> None:
    contract = PredictionContractV2.model_validate(prediction_payload())
    assert contract.model_score is None
    assert contract.risk is None


def test_frontend_transport_type_matches_contract_v2_score_boundary() -> None:
    source = Path("frontend/src/types.ts").read_text(encoding="utf-8")
    assert "export interface PredictionContractV2" in source
    assert "model_score: number | null" in source


def test_provider_reads_csv_and_appends_audit_atomically(tmp_path: Path) -> None:
    csv_path = tmp_path / "subjects.csv"
    csv_path.write_text("subject_id,timezone\nsubject-001,UTC\n", encoding="utf-8")
    provider = CsvJsonDataProvider(csv_path=csv_path, audit_path=tmp_path / "audit.json")
    assert provider.read_csv() == [{"subject_id": "subject-001", "timezone": "UTC"}]
    provider.append_audit({"event": "created"})
    assert json.loads((tmp_path / "audit.json").read_text(encoding="utf-8")) == [{"event": "created"}]


def test_provider_round_trips_joblib_artifacts(tmp_path: Path) -> None:
    provider = CsvJsonDataProvider(csv_path=tmp_path / "records.csv", audit_path=tmp_path / "audit.json")
    artifact_path = tmp_path / "model.joblib"
    provider.dump_joblib(artifact_path, {"artifact": "subject-001"})
    assert provider.load_joblib(artifact_path) == {"artifact": "subject-001"}


def test_provider_rejects_non_object_audit_records(tmp_path: Path) -> None:
    provider = CsvJsonDataProvider(csv_path=tmp_path / "records.csv", audit_path=tmp_path / "audit.json")
    with pytest.raises(TypeError, match="object"):
        provider.append_audit(["not-an-object"])

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
        "prediction_cutoff": "2026-08-26T12:00:00+00:00", "horizon_hours": 8,
        "risk": None, "confidence": ConfidenceLevel.INSUFFICIENT,
        "abstained": True, "factors": [], "missingness": [], "supports": [],
        "provenance": {"origin": "synthetic"}, "versions": {"schema": "2"},
    }
    payload.update(overrides)
    return payload


def test_prediction_contract_rejects_any_non_v2_version() -> None:
    with pytest.raises(ValueError, match="contract_version"):
        PredictionContractV2.model_validate(prediction_payload(contract_version="3"))


def test_prediction_contract_assigns_a_safe_identity_when_legacy_callers_omit_one() -> None:
    contract = PredictionContractV2.model_validate(prediction_payload(model_score=0.42))
    assert contract.prediction_id
    assert "model_score" not in contract.model_dump(mode="json")
    assert contract.model_dump(mode="json")["confidence"] == "INSUFFICIENT"


def test_prediction_contract_preserves_an_explicit_snapshot_identity() -> None:
    contract = PredictionContractV2.model_validate(prediction_payload(prediction_id="snapshot-123"))
    assert contract.prediction_id == "snapshot-123"
    assert contract.risk is None


def test_model_score_never_crosses_the_contract_boundary() -> None:
    """El puntaje técnico del modelo no viaja al front ni existe en sus tipos."""
    import re

    assert "model_score" not in PredictionContractV2.model_fields
    types_source = Path("front/src/types.ts").read_text(encoding="utf-8")
    api_source = Path("front/src/api.ts").read_text(encoding="utf-8")
    prediction_type = re.search(r"export interface Prediction \{(.*?)\n\}", types_source, re.S)
    backend_type = re.search(r"export type BackendPrediction = \{(.*?)\n\};", api_source, re.S)
    assert prediction_type and backend_type
    assert "model_score" not in prediction_type.group(1)
    assert "model_score" not in backend_type.group(1)


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

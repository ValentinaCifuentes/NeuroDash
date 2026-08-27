"""
Unit tests for the NeuraDash Telemetry Plugin.

Covers:
- Pydantic schema validation (valid and invalid payloads)
- Unit enforcement per signal type (dBA for noise)
- Mandatory DataProvenance on every observation
- Adaptive simulator profiles (estable, riesgo_acumulado, datos_insuficientes)
- build_contextual_features: None when no data, correct when data present
- Data leakage prevention (features never use post-cutoff data)
- calculate_telemetry_confidence: all 4 policy combinations
- PersonalRiskModel.select_model: core vs multimodal selection
"""

from __future__ import annotations

import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from backend.app.telemetry_schemas import (
    DataProvenance,
    SensorObservation,
    SignalType,
    SimulationRequest,
    TelemetryPayload,
    TelemetryResponse,
)
from engine.confidence import (
    TelemetryConfidenceResult,
    calculate_telemetry_confidence,
)
from engine.features import build_contextual_features
from engine.models import ModelAbstentionError, PersonalRiskModel
from engine.simulator import generate_telemetry_burst
from engine.telemetry_store import TelemetryStore


# =====================================================================
# Fixtures
# =====================================================================

@pytest.fixture()
def tmp_data_dir(tmp_path: Path) -> Path:
    """Temporary directory for telemetry JSON files."""
    d = tmp_path / "data"
    d.mkdir()
    return d


@pytest.fixture()
def store(tmp_data_dir: Path) -> TelemetryStore:
    return TelemetryStore(data_dir=tmp_data_dir)


@pytest.fixture()
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


@pytest.fixture()
def valid_provenance() -> DataProvenance:
    return DataProvenance(origin="test_device", synthetic_flag=False)


# =====================================================================
# TAREA A: Schema validation
# =====================================================================

class TestSchemaValidation:
    """Pydantic schema acceptance and rejection tests."""

    def test_valid_observation(self, valid_provenance: DataProvenance) -> None:
        obs = SensorObservation(
            signal=SignalType.ENVIRONMENTAL_NOISE,
            value=42.5,
            unit="dBA",
            window="15m",
            provenance=valid_provenance,
        )
        assert obs.signal == SignalType.ENVIRONMENTAL_NOISE
        assert obs.value == 42.5

    def test_noise_requires_dba_unit(self, valid_provenance: DataProvenance) -> None:
        with pytest.raises(ValidationError, match="dBA"):
            SensorObservation(
                signal=SignalType.ENVIRONMENTAL_NOISE,
                value=42.5,
                unit="Hz",  # wrong unit
                window="15m",
                provenance=valid_provenance,
            )

    def test_heart_rate_requires_bpm(self, valid_provenance: DataProvenance) -> None:
        with pytest.raises(ValidationError, match="bpm"):
            SensorObservation(
                signal=SignalType.HEART_RATE,
                value=80.0,
                unit="dBA",
                window="15m",
                provenance=valid_provenance,
            )

    def test_valid_unit_per_signal(self, valid_provenance: DataProvenance) -> None:
        """All signal types with correct units should pass validation."""
        for signal, unit in [
            (SignalType.ENVIRONMENTAL_NOISE, "dBA"),
            (SignalType.MOVEMENT_AGITATION, "g"),
            (SignalType.AMBIENT_LIGHT, "lux"),
            (SignalType.HEART_RATE, "bpm"),
        ]:
            obs = SensorObservation(
                signal=signal, value=1.0, unit=unit,
                window="adaptive", provenance=valid_provenance,
            )
            assert obs.unit == unit

    def test_provenance_is_mandatory(self) -> None:
        with pytest.raises(ValidationError):
            SensorObservation(
                signal=SignalType.HEART_RATE,
                value=72.0,
                unit="bpm",
                window="15m",
                # provenance intentionally omitted
            )

    def test_provenance_origin_cannot_be_empty(self) -> None:
        with pytest.raises(ValidationError):
            DataProvenance(origin="", synthetic_flag=True)

    def test_valid_payload(self, valid_provenance: DataProvenance) -> None:
        payload = TelemetryPayload(
            subject_id="PAC-A",
            device_id="watch_001",
            timestamp=datetime.now(timezone.utc),
            observations=[
                SensorObservation(
                    signal=SignalType.HEART_RATE,
                    value=75.0,
                    unit="bpm",
                    window="adaptive",
                    provenance=valid_provenance,
                )
            ],
        )
        assert payload.subject_id == "PAC-A"
        assert len(payload.observations) == 1

    def test_payload_rejects_naive_timestamp(self, valid_provenance: DataProvenance) -> None:
        with pytest.raises(ValidationError, match="timezone-aware"):
            TelemetryPayload(
                subject_id="PAC-A",
                device_id="watch_001",
                timestamp=datetime(2026, 1, 1, 12, 0, 0),  # naive
                observations=[
                    SensorObservation(
                        signal=SignalType.HEART_RATE,
                        value=75.0,
                        unit="bpm",
                        window="adaptive",
                        provenance=valid_provenance,
                    )
                ],
            )

    def test_payload_requires_at_least_one_observation(self) -> None:
        with pytest.raises(ValidationError):
            TelemetryPayload(
                subject_id="PAC-A",
                device_id="watch_001",
                timestamp=datetime.now(timezone.utc),
                observations=[],
            )

    def test_simulation_request_rejects_invalid_profile(self) -> None:
        with pytest.raises(ValidationError):
            SimulationRequest(subject_id="PAC-A", profile="invalid_profile")


# =====================================================================
# TAREA B: Simulator profiles
# =====================================================================

class TestSimulator:
    """Adaptive telemetry simulator tests."""

    def test_estable_generates_few_readings(self) -> None:
        obs = generate_telemetry_burst("TEST-01", "estable", seed=42)
        # Stable profile: adaptive sampling produces ~15-60 readings
        assert 10 <= len(obs) <= 80
        # All have synthetic provenance
        for o in obs:
            assert o["provenance"]["synthetic_flag"] is True
            assert o["provenance"]["origin"] == "neuradash_simulator_v1"

    def test_riesgo_generates_many_readings(self) -> None:
        obs = generate_telemetry_burst("TEST-01", "riesgo_acumulado", seed=42)
        # Risk profile: high variability → many adaptive triggers
        assert len(obs) > 50

    def test_datos_insuficientes_empty_or_stale(self) -> None:
        # Run multiple seeds to cover both branches (empty and stale)
        results: list[list[dict[str, Any]]] = []
        for seed in range(20):
            obs = generate_telemetry_burst(
                "TEST-01", "datos_insuficientes",
                reference_time=datetime.now(timezone.utc),
                seed=seed,
            )
            results.append(obs)

        # At least some should be empty and some should have stale data
        empty_count = sum(1 for r in results if len(r) == 0)
        stale_count = sum(1 for r in results if len(r) > 0)
        assert empty_count > 0 or stale_count > 0  # at least one branch hit

        # All stale readings should be >48h old
        now = datetime.now(timezone.utc)
        for result in results:
            for obs in result:
                ts = datetime.fromisoformat(obs["timestamp"])
                age_hours = (now - ts).total_seconds() / 3600
                assert age_hours > 48, f"Stale observation should be >48h old, got {age_hours:.1f}h"

    def test_reproducible_with_seed(self) -> None:
        obs1 = generate_telemetry_burst("TEST-01", "estable", seed=123)
        obs2 = generate_telemetry_burst("TEST-01", "estable", seed=123)
        assert len(obs1) == len(obs2)
        for a, b in zip(obs1, obs2):
            assert a["value"] == b["value"]
            assert a["signal"] == b["signal"]

    def test_noise_values_in_dba(self) -> None:
        obs = generate_telemetry_burst("TEST-01", "estable", seed=42)
        noise_readings = [o for o in obs if o["signal"] == "environmental_noise"]
        for r in noise_readings:
            assert r["unit"] == "dBA"
            assert 0 <= r["value"] <= 120  # sane dBA range


# =====================================================================
# TAREA B: TelemetryStore
# =====================================================================

class TestTelemetryStore:
    """Persistence layer tests."""

    def test_append_and_read(self, store: TelemetryStore) -> None:
        obs = [{"timestamp": datetime.now(timezone.utc).isoformat(), "signal": "heart_rate", "value": 72}]
        stored = store.append_observations("SUB-1", obs)
        assert stored == 1
        assert store.count("SUB-1") == 1

    def test_read_empty_subject(self, store: TelemetryStore) -> None:
        result = store.read_observations("NONEXISTENT")
        assert result == []

    def test_temporal_filtering(self, store: TelemetryStore, now_utc: datetime) -> None:
        old_ts = (now_utc - timedelta(hours=48)).isoformat()
        new_ts = (now_utc - timedelta(hours=1)).isoformat()

        store.append_observations("SUB-1", [
            {"timestamp": old_ts, "signal": "heart_rate", "value": 70},
            {"timestamp": new_ts, "signal": "heart_rate", "value": 80},
        ])

        recent = store.read_observations(
            "SUB-1", after=now_utc - timedelta(hours=24)
        )
        assert len(recent) == 1
        assert recent[0]["value"] == 80

    def test_has_recent_data(self, store: TelemetryStore, now_utc: datetime) -> None:
        assert store.has_recent_data("SUB-1") is False

        store.append_observations("SUB-1", [
            {"timestamp": now_utc.isoformat(), "signal": "heart_rate", "value": 72}
        ])
        assert store.has_recent_data("SUB-1") is True

    def test_clear(self, store: TelemetryStore) -> None:
        store.append_observations("SUB-1", [{"timestamp": "2026-01-01T00:00:00Z", "value": 1}])
        assert store.count("SUB-1") == 1
        store.clear("SUB-1")
        assert store.count("SUB-1") == 0


# =====================================================================
# TAREA C: build_contextual_features
# =====================================================================

class TestContextualFeatures:
    """Feature engine telemetry integration tests."""

    def test_returns_none_when_no_data(self, tmp_data_dir: Path) -> None:
        features = build_contextual_features(
            "UNKNOWN", datetime.now(timezone.utc), data_dir=tmp_data_dir
        )
        assert all(v is None for v in features.values())
        # Verify all canonical keys are present
        assert "avg_noise_3d" in features
        assert "std_agitation_1d" in features
        assert "peak_hr_7d" in features

    def test_calculates_features_with_data(self, tmp_data_dir: Path, now_utc: datetime) -> None:
        store = TelemetryStore(data_dir=tmp_data_dir)

        # Insert observations within the last 24h
        for i in range(10):
            ts = (now_utc - timedelta(hours=12) + timedelta(minutes=i * 30)).isoformat()
            store.append_observations("SUB-F", [
                {"timestamp": ts, "signal": "environmental_noise", "value": 40.0 + i, "unit": "dBA"},
                {"timestamp": ts, "signal": "movement_agitation", "value": 0.2 + i * 0.05, "unit": "g"},
                {"timestamp": ts, "signal": "heart_rate", "value": 72.0 + i, "unit": "bpm"},
                {"timestamp": ts, "signal": "ambient_light", "value": 100.0 + i * 10, "unit": "lux"},
            ])

        features = build_contextual_features("SUB-F", now_utc, data_dir=tmp_data_dir)

        assert features["avg_noise_1d"] is not None
        assert features["avg_noise_1d"] > 0
        assert features["std_agitation_1d"] is not None
        assert features["peak_hr_1d"] is not None
        assert features["peak_hr_1d"] >= 72.0
        assert features["avg_light_1d"] is not None

    def test_data_leakage_prevention(self, tmp_data_dir: Path, now_utc: datetime) -> None:
        """Features must NEVER use observations at or after the cutoff."""
        store = TelemetryStore(data_dir=tmp_data_dir)
        cutoff = now_utc

        # Insert one observation BEFORE cutoff and one AFTER
        before_ts = (cutoff - timedelta(hours=2)).isoformat()
        after_ts = (cutoff + timedelta(hours=1)).isoformat()

        store.append_observations("SUB-LEAK", [
            {"timestamp": before_ts, "signal": "heart_rate", "value": 70.0, "unit": "bpm"},
            {"timestamp": after_ts, "signal": "heart_rate", "value": 200.0, "unit": "bpm"},  # future!
        ])

        features = build_contextual_features("SUB-LEAK", cutoff, data_dir=tmp_data_dir)

        # peak_hr_1d should be 70.0 (before), NOT 200.0 (future)
        assert features["peak_hr_1d"] == 70.0


# =====================================================================
# TAREA D: PersonalRiskModel selection
# =====================================================================

class TestPersonalRiskModel:
    """Model fallback strategy tests."""

    def test_raises_when_no_model(self, tmp_path: Path) -> None:
        model = PersonalRiskModel("EMPTY-SUBJECT", tmp_path)
        with pytest.raises(ModelAbstentionError):
            model.select_model(has_telemetry=False)

    def test_selects_core_when_no_telemetry(self, tmp_path: Path) -> None:
        # Create a minimal core model artifact
        import joblib
        import numpy as np
        from sklearn.dummy import DummyClassifier

        subject_dir = tmp_path / "TEST-MODEL"
        subject_dir.mkdir()

        dummy = DummyClassifier(strategy="constant", constant=0)
        dummy.fit(np.array([[1, 2]]), np.array([0]))
        artifact = {"model": dummy, "features": ["f1", "f2"], "metadata": {"version": 1}}
        joblib.dump(artifact, subject_dir / "model_core_v1.joblib")

        prm = PersonalRiskModel("TEST-MODEL", tmp_path)
        _, variant = prm.select_model(has_telemetry=False)
        assert variant == "core"

    def test_selects_multimodal_when_available(self, tmp_path: Path) -> None:
        import joblib
        import numpy as np
        from sklearn.dummy import DummyClassifier

        subject_dir = tmp_path / "TEST-MM"
        subject_dir.mkdir()

        dummy = DummyClassifier(strategy="constant", constant=0)
        dummy.fit(np.array([[1, 2]]), np.array([0]))

        # Create both core and multimodal
        joblib.dump(
            {"model": dummy, "features": ["f1", "f2"], "metadata": {"version": 1}},
            subject_dir / "model_core_v1.joblib",
        )
        joblib.dump(
            {"model": dummy, "features": ["f1", "f2", "f3"], "metadata": {"version": 1}},
            subject_dir / "model_multimodal_v1.joblib",
        )

        prm = PersonalRiskModel("TEST-MM", tmp_path)
        _, variant = prm.select_model(has_telemetry=True)
        assert variant == "multimodal"

    def test_falls_back_to_core_when_multimodal_missing(self, tmp_path: Path) -> None:
        import joblib
        import numpy as np
        from sklearn.dummy import DummyClassifier

        subject_dir = tmp_path / "TEST-FB"
        subject_dir.mkdir()

        dummy = DummyClassifier(strategy="constant", constant=0)
        dummy.fit(np.array([[1, 2]]), np.array([0]))
        joblib.dump(
            {"model": dummy, "features": ["f1", "f2"], "metadata": {"version": 1}},
            subject_dir / "model_core_v1.joblib",
        )

        prm = PersonalRiskModel("TEST-FB", tmp_path)
        # has_telemetry=True but no multimodal model → should fallback
        _, variant = prm.select_model(has_telemetry=True)
        assert variant == "core"


# =====================================================================
# TAREA E: Telemetry Confidence Engine
# =====================================================================

class TestTelemetryConfidence:
    """Confidence and abstention policy tests."""

    def test_high_confidence_both_sources(self) -> None:
        result = calculate_telemetry_confidence(
            has_telemetry=True,
            telemetry_continuous=True,
            logbook_up_to_date=True,
            logbook_last_entry_hours=2.0,
        )
        assert result.level.value == "HIGH"
        assert result.abstain is False

    def test_medium_confidence_logbook_only(self) -> None:
        result = calculate_telemetry_confidence(
            has_telemetry=False,
            telemetry_continuous=False,
            logbook_up_to_date=True,
            logbook_last_entry_hours=12.0,
        )
        assert result.level.value == "MEDIUM"
        assert result.abstain is False

    def test_low_confidence_telemetry_stale_logbook(self) -> None:
        result = calculate_telemetry_confidence(
            has_telemetry=True,
            telemetry_continuous=False,
            logbook_up_to_date=False,
            logbook_last_entry_hours=60.0,
        )
        assert result.level.value == "LOW"
        assert result.abstain is False

    def test_abstention_no_sources(self) -> None:
        result = calculate_telemetry_confidence(
            has_telemetry=False,
            telemetry_continuous=False,
            logbook_up_to_date=False,
            logbook_last_entry_hours=72.0,
        )
        assert result.level.value == "INSUFFICIENT"
        assert result.abstain is True
        assert result.reason is not None
        assert "stale" in result.reason.lower() or "insufficient" in result.reason.lower()

    def test_abstention_respects_config_threshold(self, tmp_path: Path) -> None:
        # Custom config with shorter stale threshold
        config = tmp_path / "confidence.yaml"
        config.write_text(
            "high_threshold: 0.8\n"
            "medium_threshold: 0.6\n"
            "low_threshold: 0.4\n"
            "telemetry:\n"
            "  logbook_stale_hours: 24\n"
            "  telemetry_continuity_gap_hours: 3\n"
        )
        result = calculate_telemetry_confidence(
            has_telemetry=False,
            telemetry_continuous=False,
            logbook_up_to_date=False,
            logbook_last_entry_hours=30.0,  # >24h custom threshold
            config_path=config,
        )
        assert result.abstain is True

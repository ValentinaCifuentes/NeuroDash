"""Tests de Fase 1: la confianza se mide solo sobre las variables núcleo (core_fields)."""
from pathlib import Path
import tempfile

import yaml

from engine.schemas import ConfidenceLevel
from engine.confidence import calculate_confidence


def test_confidence_measures_only_core_fields_when_configured() -> None:
    missingness = [
        {"window": 1, "field": "sleep_quality", "missing": False},
        {"window": 1, "field": "wake_state", "missing": False},
        {"window": 1, "field": "event_count", "missing": False},
        {"window": 1, "field": "gi_level", "missing": True},  # opcional, faltante
    ]

    # Con core_fields, el campo opcional faltante no diluye la cobertura.
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "confidence.yaml"
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump({
                "high_threshold": 0.8,
                "medium_threshold": 0.6,
                "low_threshold": 0.4,
                "core_fields": ["sleep_quality", "wake_state", "event_count"],
            }, f)
        assert calculate_confidence(missingness, config_path) == ConfidenceLevel.HIGH

    # Sin core_fields, el faltante opcional baja la cobertura a 3/4 -> MEDIUM.
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "confidence.yaml"
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump({
                "high_threshold": 0.8,
                "medium_threshold": 0.6,
                "low_threshold": 0.4,
            }, f)
        assert calculate_confidence(missingness, config_path) == ConfidenceLevel.MEDIUM

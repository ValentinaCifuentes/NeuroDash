"""
PersonalRiskModel with dual-model fallback for NeuraDash.

Implements the "Model Fallback" strategy:

1. If telemetry data is available in the last 24 hours **and** a multimodal
   model exists, load ``model_multimodal_vN.joblib``.
2. Otherwise fall back to ``model_core_vN.joblib`` (trained only on
   subjective logbook data).
3. If neither model exists, raise ``ModelAbstentionError``.

This allows the system to operate at full fidelity when sensors are
connected, while never degrading below the CORE-only prediction when
they are not.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import joblib

logger = logging.getLogger("neuradash.models")


class ModelAbstentionError(Exception):
    """Raised when no usable model artifact is available for a subject."""
    pass


class PersonalRiskModel:
    """
    Dynamic model selector and predictor for a single subject.

    Parameters
    ----------
    subject_id : str
        Patient identifier.
    models_dir : Path
        Root directory containing per-subject model folders
        (e.g. ``models/PAC-A/``).
    """

    def __init__(self, subject_id: str, models_dir: Path) -> None:
        self._subject_id = subject_id
        self._subject_dir = models_dir / subject_id
        self._loaded_model: Any | None = None
        self._loaded_variant: str | None = None
        self._loaded_features: list[str] | None = None
        self._loaded_metadata: dict[str, Any] | None = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _find_latest_artifact(self, prefix: str) -> Path | None:
        """
        Find the highest-versioned joblib file matching *prefix* in the
        subject's model directory.

        Expects files named ``{prefix}_v{N}.joblib`` and returns the one
        with the largest N.
        """
        if not self._subject_dir.exists():
            return None

        candidates: list[tuple[int, Path]] = []
        for p in self._subject_dir.glob(f"{prefix}_v*.joblib"):
            stem = p.stem  # e.g. "model_core_v3"
            try:
                version = int(stem.rsplit("_v", 1)[1])
                candidates.append((version, p))
            except (IndexError, ValueError):
                continue

        if not candidates:
            return None

        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]

    def _load_artifact(self, path: Path) -> dict[str, Any]:
        """
        Load a joblib model artifact.

        The artifact may be a raw model or a dict with keys
        ``{"model", "features", "metadata"}``.
        """
        artifact = joblib.load(path)
        if isinstance(artifact, dict) and "model" in artifact:
            return artifact

        # Wrap raw model for uniform interface
        return {
            "model": artifact,
            "features": [],
            "metadata": {"source_file": path.name},
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def select_model(self, has_telemetry: bool) -> tuple[Any, str]:
        """
        Select and load the appropriate model variant.

        Parameters
        ----------
        has_telemetry : bool
            Whether recent telemetry data (last 24h) is available.

        Returns
        -------
        tuple[model, variant_name]
            The loaded sklearn-compatible model and a string identifier
            (``"multimodal"`` or ``"core"``).

        Raises
        ------
        ModelAbstentionError
            If no model artifact exists for this subject.
        """
        if has_telemetry:
            multimodal_path = self._find_latest_artifact("model_multimodal")
            if multimodal_path is not None:
                artifact = self._load_artifact(multimodal_path)
                self._loaded_model = artifact["model"]
                self._loaded_variant = "multimodal"
                self._loaded_features = artifact.get("features", [])
                self._loaded_metadata = artifact.get("metadata", {})
                logger.info(
                    "Loaded multimodal model for %s from %s",
                    self._subject_id, multimodal_path.name,
                )
                return self._loaded_model, "multimodal"

            # Multimodal not available — fall back to core with warning
            logger.warning(
                "Telemetry data available for %s but no multimodal model found. "
                "Falling back to core model.",
                self._subject_id,
            )

        # Try core model
        core_path = self._find_latest_artifact("model_core")
        if core_path is not None:
            artifact = self._load_artifact(core_path)
            self._loaded_model = artifact["model"]
            self._loaded_variant = "core"
            self._loaded_features = artifact.get("features", [])
            self._loaded_metadata = artifact.get("metadata", {})
            logger.info(
                "Loaded core model for %s from %s",
                self._subject_id, core_path.name,
            )
            return self._loaded_model, "core"

        # Also check legacy model files (model_v*.joblib) for backwards compat
        legacy_path = self._find_latest_artifact("model")
        if legacy_path is not None:
            artifact = self._load_artifact(legacy_path)
            self._loaded_model = artifact["model"]
            self._loaded_variant = "core"
            self._loaded_features = artifact.get("features", [])
            self._loaded_metadata = artifact.get("metadata", {})
            logger.info(
                "Loaded legacy model for %s from %s (treated as core)",
                self._subject_id, legacy_path.name,
            )
            return self._loaded_model, "core"

        raise ModelAbstentionError(
            f"No model artifact found for subject {self._subject_id} "
            f"in {self._subject_dir}"
        )

    @property
    def variant(self) -> str | None:
        """Currently loaded model variant (``'core'``, ``'multimodal'``, or ``None``)."""
        return self._loaded_variant

    @property
    def features(self) -> list[str] | None:
        """Feature names expected by the currently loaded model."""
        return self._loaded_features

    @property
    def metadata(self) -> dict[str, Any] | None:
        """Metadata dict from the currently loaded model artifact."""
        return self._loaded_metadata

    def predict(self, features: dict[str, float | None]) -> tuple[float, str]:
        """
        Run inference using the currently loaded model.

        Missing (``None``) features are replaced with ``0.0`` for robustness
        — the model was trained with the understanding that absent sensor
        features are zero-filled when the telemetry plugin is inactive.

        Parameters
        ----------
        features : dict[str, float | None]
            Feature dictionary (may contain ``None`` for missing sensors).

        Returns
        -------
        tuple[float, str]
            ``(score, risk_tier)`` where score is in [0, 1] and risk_tier
            is one of ``"GREEN"``, ``"YELLOW"``, ``"RED"``.
        """
        if self._loaded_model is None:
            raise ModelAbstentionError("No model loaded. Call select_model() first.")

        # Build ordered feature vector
        if self._loaded_features:
            feature_vector = [
                features.get(name, 0.0) or 0.0
                for name in self._loaded_features
            ]
        else:
            # Fallback: use dict values in sorted key order
            feature_vector = [
                v if v is not None else 0.0
                for _, v in sorted(features.items())
            ]

        import numpy as np
        X = np.array([feature_vector], dtype=np.float64)

        # Get probability score
        if hasattr(self._loaded_model, "predict_proba"):
            probas = self._loaded_model.predict_proba(X)
            score = float(probas[0, 1]) if probas.shape[1] > 1 else float(probas[0, 0])
        else:
            raw = self._loaded_model.predict(X)
            score = float(raw[0])

        # Map score to risk tier
        if score >= 0.7:
            risk_tier = "RED"
        elif score >= 0.4:
            risk_tier = "YELLOW"
        else:
            risk_tier = "GREEN"

        return score, risk_tier

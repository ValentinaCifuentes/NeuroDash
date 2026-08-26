import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import joblib


class ModelAbstentionError(ValueError):
    """Exception raised when prediction is requested but no model exists or inference should abstain."""
    pass


class ModelRegistry:
    """
    Manages saving and loading of subject-local model artifacts,
    supporting versioning and active model selection.
    """
    def __init__(self, base_dir: Path | str) -> None:
        self.base_dir = Path(base_dir)

    def _get_subject_dir(self, subject_id: str) -> Path:
        return self.base_dir / subject_id

    def _get_registry_path(self, subject_id: str) -> Path:
        return self._get_subject_dir(subject_id) / "registry.json"

    def save_model(
        self,
        subject_id: str,
        model: Any,
        features: list[str],
        metadata: dict[str, Any]
    ) -> Path:
        """
        Saves a trained model artifact and updates versioned registry.
        """
        subject_dir = self._get_subject_dir(subject_id)
        subject_dir.mkdir(parents=True, exist_ok=True)
        
        registry_path = self._get_registry_path(subject_id)
        versions = []
        if registry_path.exists():
            try:
                with open(registry_path, "r", encoding="utf-8") as f:
                    versions = json.load(f)
            except Exception:
                versions = []
                
        version = len(versions) + 1
        model_filename = f"model_v{version}.joblib"
        model_path = subject_dir / model_filename
        
        # Save model artifact
        artifact = {
            "model": model,
            "features": features,
            "metadata": metadata
        }
        joblib.dump(artifact, model_path)
        
        # Update registry metadata
        new_version_info = {
            "version": version,
            "filename": model_filename,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata
        }
        versions.append(new_version_info)
        
        with open(registry_path, "w", encoding="utf-8") as f:
            json.dump(versions, f, indent=2, sort_keys=True)
            
        return model_path

    def load_model(self, subject_id: str, version: int | None = None) -> dict[str, Any]:
        """
        Loads the specified version of a subject's model artifact.
        If no version is specified, loads the latest version.
        Raises ModelAbstentionError if no model is found.
        """
        registry_path = self._get_registry_path(subject_id)
        if not registry_path.exists():
            raise ModelAbstentionError(f"No active model found for subject {subject_id}")
            
        try:
            with open(registry_path, "r", encoding="utf-8") as f:
                versions = json.load(f)
        except Exception as e:
            raise ModelAbstentionError(f"Registry corrupt for subject {subject_id}") from e
            
        if not versions:
            raise ModelAbstentionError(f"No model versions registered for subject {subject_id}")
            
        # Select target version info
        target_info = None
        if version is not None:
            for v in versions:
                if v.get("version") == version:
                    target_info = v
                    break
            if target_info is None:
                raise ModelAbstentionError(f"Model version {version} not found for subject {subject_id}")
        else:
            # Default to latest version
            target_info = versions[-1]
            
        model_filename = target_info["filename"]
        model_path = self._get_subject_dir(subject_id) / model_filename
        
        if not model_path.exists():
            raise ModelAbstentionError(f"Model file {model_filename} not found for subject {subject_id}")
            
        try:
            artifact = joblib.load(model_path)
            return artifact
        except Exception as e:
            raise ModelAbstentionError(f"Failed to load model file {model_filename}") from e

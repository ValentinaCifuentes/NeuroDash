import yaml
from pathlib import Path
from typing import Any
import numpy as np

from ml.model_registry import ModelRegistry, ModelAbstentionError


def load_risk_mapping(config_path: Path | str | None = None) -> tuple[float, float]:
    """
    Loads risk thresholds from config/risk_mapping.yaml.
    Falls back to (0.3, 0.7) if config is not available or missing fields.
    """
    default_low = 0.3
    default_high = 0.7
    
    if config_path is None:
        # Search relative to project root
        proj_root = Path(__file__).resolve().parents[2]
        config_path = proj_root / "config" / "risk_mapping.yaml"
        
    config_path = Path(config_path)
    if not config_path.exists():
        return default_low, default_high
        
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
        low = cfg.get("low_threshold", default_low)
        high = cfg.get("high_threshold", default_high)
        return float(low), float(high)
    except Exception:
        return default_low, default_high


def predict_risk(
    registry: ModelRegistry,
    subject_id: str,
    X: dict[str, float | None],
    config_path: Path | str | None = None
) -> tuple[float, str]:
    """
    Predicts the risk score and maps it to a risk tier for a given subject.
    Reuses a single inference path for all prediction flows.
    """
    # 1. Load model artifact
    artifact = registry.load_model(subject_id)
    model = artifact["model"]
    feature_names = artifact["features"]
    
    # 2. Preprocess features and impute missing values (None -> 0.0)
    feature_vector = []
    for name in feature_names:
        val = X.get(name)
        feature_vector.append(0.0 if val is None else float(val))
        
    # 3. Model inference (probability of positive class)
    # We ensure X is a 2D array
    features_arr = np.array([feature_vector])
    
    # Logistic regression predict_proba returns classes in order, e.g. [False, True]
    # prob_positive is probability of index 1 (True)
    probs = model.predict_proba(features_arr)[0]
    if len(probs) > 1:
        score = float(probs[1])
    else:
        # Fallback if somehow only 1 class got trained
        score = float(probs[0])
        
    # 4. Map to risk tier
    low_thresh, high_thresh = load_risk_mapping(config_path)
    if score <= low_thresh:
        risk_tier = "LOW"
    elif score <= high_thresh:
        risk_tier = "MEDIUM"
    else:
        risk_tier = "HIGH"
        
    return score, risk_tier

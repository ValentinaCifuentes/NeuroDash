import json
import os
import tempfile
import yaml
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from ml.model_registry import ModelRegistry, ModelAbstentionError
from ml.evaluator import evaluate_model


def write_json_atomic(path: Path, value: Any) -> None:
    """Writes a JSON file atomically to prevent partial writes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
        json.dump(value, temporary, sort_keys=True, indent=2)
        temporary.flush()
        try:
            os.fsync(temporary.fileno())
        except OSError:
            pass # Fsync might fail on some filesystems (e.g. mock memory fs) but we continue
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, path)


def record_prediction_outcome(
    prediction_id: str,
    actual_outcome: bool,
    subject_dir: Path
) -> None:
    """
    Manually confirms the outcome of a prediction.
    If actual_outcome is True, appends a corresponding occurrence to the training data.
    """
    pred_path = subject_dir / "predictions" / f"{prediction_id}.json"
    if not pred_path.exists():
        raise FileNotFoundError(f"Prediction snapshot {prediction_id} not found.")

    with open(pred_path, "r", encoding="utf-8") as f:
        pred_snapshot = json.load(f)

    cutoff_str = pred_snapshot["prediction_cutoff"]
    cutoff = datetime.fromisoformat(cutoff_str)

    if actual_outcome:
        # Append an occurrence in the horizon (cutoff, cutoff + 24h]
        # Let's say it happens exactly 12 hours after the prediction cutoff
        occ_time = cutoff + timedelta(hours=12)
        
        occ_record = {
            "id": f"occ_{prediction_id}",
            "subject_id": pred_snapshot["subject_id"],
            "source_timestamp": occ_time.isoformat(),
            "availability_timestamp": occ_time.isoformat(),
            "severity": "moderate"
        }

        occurrences_path = subject_dir / "occurrences.json"
        occurrences = []
        if occurrences_path.exists():
            try:
                with open(occurrences_path, "r", encoding="utf-8") as f:
                    occurrences = json.load(f)
            except Exception:
                occurrences = []

        occurrences.append(occ_record)
        write_json_atomic(occurrences_path, occurrences)

    # Save the outcome confirmation itself for reference/lineage
    outcomes_path = subject_dir / "outcomes.json"
    outcomes = []
    if outcomes_path.exists():
        try:
            with open(outcomes_path, "r", encoding="utf-8") as f:
                outcomes = json.load(f)
        except Exception:
            outcomes = []

    outcomes.append({
        "prediction_id": prediction_id,
        "actual_outcome": actual_outcome,
        "confirmed_at": datetime.now(timezone.utc).isoformat()
    })
    write_json_atomic(outcomes_path, outcomes)


def evaluate_and_promote_model(
    subject_id: str,
    candidate_model: Any,
    candidate_features: list[str],
    candidate_metadata: dict[str, Any],
    X_val: list[dict[str, float | None]],
    y_val: list[bool],
    registry: ModelRegistry,
    config_path: Path | str | None = None,
    audit_path: Path | str | None = None
) -> tuple[bool, dict[str, Any]]:
    """
    Compares candidate model vs active model on a validation split using configured criteria.
    Promotes if candidate improves performance or no active model exists.
    """
    # 1. Load config
    metric = "f1"
    min_improvement = 0.01

    if config_path is not None:
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f)
                if cfg:
                    metric = cfg.get("metric", metric)
                    min_improvement = cfg.get("min_improvement", min_improvement)
        except Exception:
            pass
    else:
        # Standard location
        proj_root = Path(__file__).resolve().parents[2]
        std_config = proj_root / "config" / "promotion.yaml"
        if std_config.exists():
            try:
                with open(std_config, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f)
                    if cfg:
                        metric = cfg.get("metric", metric)
                        min_improvement = cfg.get("min_improvement", min_improvement)
            except Exception:
                pass

    # 2. Evaluate candidate model
    candidate_metrics = evaluate_model(candidate_model, X_val, y_val, candidate_features)

    # 3. Check for active model and evaluate if exists
    active_metrics = None
    promoted = False
    reason = ""

    try:
        active_artifact = registry.load_model(subject_id)
        active_model = active_artifact["model"]
        active_features = active_artifact["features"]
        
        active_metrics = evaluate_model(active_model, X_val, y_val, active_features)
        
        cand_val = candidate_metrics.get(metric, 0.0)
        act_val = active_metrics.get(metric, 0.0)
        
        if cand_val >= act_val + min_improvement:
            promoted = True
            reason = f"Candidate model improved {metric} from {act_val:.4f} to {cand_val:.4f} (>= threshold improvement of {min_improvement})."
        else:
            promoted = False
            reason = f"Candidate model {metric} of {cand_val:.4f} did not improve active model {metric} of {act_val:.4f} by at least {min_improvement}."
    except ModelAbstentionError:
        # No active model exists -> promote candidate unconditionally
        promoted = True
        reason = "No active model existed. Candidate promoted as the first active model."

    # 4. Save model if promoted
    if promoted:
        registry.save_model(subject_id, candidate_model, candidate_features, candidate_metadata)

    # 5. Save audit record atomically
    audit_record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "subject_id": subject_id,
        "promoted": promoted,
        "reason": reason,
        "candidate_metrics": candidate_metrics,
        "active_metrics": active_metrics,
        "metric_compared": metric,
        "min_improvement": min_improvement
    }

    if audit_path is not None:
        audit_path = Path(audit_path)
        audits = []
        if audit_path.exists():
            try:
                with open(audit_path, "r", encoding="utf-8") as f:
                    audits = json.load(f)
            except Exception:
                audits = []
        audits.append(audit_record)
        write_json_atomic(audit_path, audits)

    return promoted, audit_record

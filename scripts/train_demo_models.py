import json
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Any

from ml.dataset_builder import build_dataset
from ml.trainer import train_model, InsufficientDataError
from ml.model_registry import ModelRegistry
from engine.temporal import AvailabilityPolicy


def load_subject_data_from_dir(subject_id: str, data_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Loads profile, records, and occurrences for a subject from a specific data directory."""
    profile_path = data_dir / "demo_profiles" / subject_id / "profile.json"
    if not profile_path.exists():
        raise FileNotFoundError(f"Profile not found for {subject_id} at {profile_path}")
        
    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)
        
    history_path = data_dir / "bluba" / f"{subject_id}_history.json"
    if not history_path.exists():
        raise FileNotFoundError(f"History not found for {subject_id} at {history_path}")
        
    with open(history_path, "r", encoding="utf-8") as f:
        history = json.load(f)
        
    records = history.get("records", [])
    occurrences = history.get("occurrences", [])
    
    # Parse ISO strings into datetime objects
    def parse_dt(dt_str: str) -> datetime:
        dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
        
    for r in records:
        r["source_timestamp"] = parse_dt(r["source_timestamp"])
        r["availability_timestamp"] = parse_dt(r["availability_timestamp"])
        
    for o in occurrences:
        o["source_timestamp"] = parse_dt(o["source_timestamp"])
        o["availability_timestamp"] = parse_dt(o["availability_timestamp"])
        
    return profile, records, occurrences


def train_subject_model(
    subject_id: str,
    data_dir: Path | str,
    models_dir: Path | str
) -> dict[str, Any] | None:
    """
    Trains a Logistic Regression model for a subject if they have sufficient data.
    Registers the model in the ModelRegistry under models_dir.
    """
    d_dir = Path(data_dir)
    m_dir = Path(models_dir)
    
    profile, records, occurrences = load_subject_data_from_dir(subject_id, d_dir)
    timezone_name = profile["timezone"]
    
    if not records:
        raise InsufficientDataError(f"No records available to train model for {subject_id}.")
        
    records_sorted = sorted(records, key=lambda x: x["source_timestamp"])
    min_date = records_sorted[0]["source_timestamp"]
    max_date = records_sorted[-1]["source_timestamp"]
    
    total_days = (max_date - min_date).days
    
    # We require at least 5 days of history for standard model training,
    # otherwise it is considered a cold-start scenario.
    if total_days < 5:
        raise InsufficientDataError(
            f"Insufficient history span for subject '{subject_id}': "
            f"need at least 5 days, got {total_days} days."
        )
        
    # Generate daily cutoffs starting from min_date + 3 days to allow baseline accumulation
    cutoffs = [min_date + timedelta(days=d) for d in range(3, total_days + 1)]
    
    # Split training and validation: last 7 days (or 2 days if short) for validation
    if total_days >= 14:
        split_cutoff = max_date - timedelta(days=7)
    else:
        split_cutoff = max_date - timedelta(days=2)
        
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    
    # Build dataset
    X_train, y_train, _, _, lineage = build_dataset(
        records=records,
        occurrences=occurrences,
        cutoffs=cutoffs,
        split_cutoff=split_cutoff,
        policy=policy,
        timezone=timezone_name,
        subject_id=subject_id
    )
    
    # Train the Logistic Regression model
    model, features, metadata = train_model(
        X_train=X_train,
        y_train=y_train,
        seed=42,
        min_samples=5,
        min_positive_labels=1
    )
    
    # Save the model to the ModelRegistry
    registry = ModelRegistry(base_dir=m_dir)
    registry.save_model(
        subject_id=subject_id,
        model=model,
        features=features,
        metadata={**metadata, "lineage": lineage}
    )
    
    print(f"Successfully trained and registered model for '{subject_id}' (version 1).")
    return metadata


def train_all_models(data_dir: Path | str, models_dir: Path | str) -> None:
    """Trains models for PAC-A, PAC-B, and PAC-C if they have sufficient data."""
    d_dir = Path(data_dir)
    m_dir = Path(models_dir)
    
    for pid in ["PAC-A", "PAC-B", "PAC-C"]:
        try:
            train_subject_model(pid, d_dir, m_dir)
        except InsufficientDataError as e:
            print(f"Skipped training for '{pid}': {e} (Expected cold-start behavior)")
        except Exception as e:
            print(f"Error training model for '{pid}': {e}")


if __name__ == "__main__":
    proj_root = Path(__file__).resolve().parents[1]
    data_dir = proj_root / "data"
    models_dir = proj_root / "models"
    train_all_models(data_dir, models_dir)

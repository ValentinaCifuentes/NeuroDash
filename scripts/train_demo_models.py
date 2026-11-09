from pathlib import Path
from datetime import timedelta
from typing import Any

from ml.data_loading import load_subject_data
from ml.dataset_builder import build_dataset, training_cutoffs
from ml.trainer import train_model, InsufficientDataError
from ml.model_registry import ModelRegistry
from engine.temporal import AvailabilityPolicy


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
    
    bundle = load_subject_data(subject_id, d_dir)
    profile = bundle["profile"]
    records = bundle["records"]
    occurrences = bundle["occurrences"]
    planned_events = bundle["planned_events"]
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
        
    # Varias estimaciones por día (CUTOFF_HOURS), desde el cuarto día para que la
    # línea base tenga algo de madurez.
    cutoffs = training_cutoffs(records, timezone=timezone_name)
    
    # Split training and validation: last 7 days (or 2 days if short) for validation
    if total_days >= 14:
        split_cutoff = max_date - timedelta(days=7)
    else:
        split_cutoff = max_date - timedelta(days=2)
        
    policy = AvailabilityPolicy()  # regla de config/availability.yaml
    
    # Build dataset
    X_train, y_train, _, _, lineage = build_dataset(
        records=records,
        occurrences=occurrences,
        cutoffs=cutoffs,
        split_cutoff=split_cutoff,
        policy=policy,
        timezone=timezone_name,
        subject_id=subject_id,
        planned_events=planned_events
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

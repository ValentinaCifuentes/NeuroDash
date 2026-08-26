import json
import sys
from pathlib import Path
from datetime import datetime, timezone as dt_timezone
from typing import Any

# Import synthetic generator from our ML package
from ml.dataset_builder import generate_synthetic_history


def serialize_dt(obj: Any) -> Any:
    """Helper to convert datetimes to ISO strings for serialization."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, list):
        return [serialize_dt(item) for item in obj]
    if isinstance(obj, dict):
        return {k: serialize_dt(v) for k, v in obj.items()}
    return obj


def generate_subject_history(
    subject_id: str,
    days: int,
    seed: int,
    out_dir: Path | str
) -> None:
    """
    Generates a mock history and profile JSON for a given subject ID.
    Saves history to {out_dir}/bluba/{subject_id}_history.json
    Saves profile to {out_dir}/demo_profiles/{subject_id}/profile.json
    """
    out_path = Path(out_dir)
    
    # Load profile metadata mapping
    profiles_meta = {
        "PAC-A": {
            "timezone": "America/New_York",
            "sensory_context": {"sensory_profile": "Hipersensible"},
            "historical_supports": [
                {"id": "sup_a_1", "description": "Weighted blanket in evening.", "type": "historical"}
            ]
        },
        "PAC-B": {
            "timezone": "UTC",
            "sensory_context": {"sensory_profile": "Hiposensible"},
            "historical_supports": [
                {"id": "sup_b_1", "description": "Scheduled noise-reducing breaks.", "type": "historical"}
            ]
        },
        "PAC-C": {
            "timezone": "America/Chicago",
            "sensory_context": {"sensory_profile": "Buscador sensorial"},
            "historical_supports": []
        }
    }
    
    meta = profiles_meta.get(subject_id, {
        "timezone": "UTC",
        "sensory_context": {},
        "historical_supports": []
    })
    
    # 1. Generate synthetic history
    history = generate_synthetic_history(
        subject_id=subject_id,
        days=days,
        seed=seed,
        timezone=meta["timezone"]
    )
    
    history_serialized = serialize_dt(history)
    
    # Write history JSON
    bluba_dir = out_path / "bluba"
    bluba_dir.mkdir(parents=True, exist_ok=True)
    history_file = bluba_dir / f"{subject_id}_history.json"
    with open(history_file, "w", encoding="utf-8") as f:
        json.dump(history_serialized, f, indent=2, sort_keys=True)
        
    # 2. Write profile JSON
    profile_dir = out_path / "demo_profiles" / subject_id
    profile_dir.mkdir(parents=True, exist_ok=True)
    profile_data = {
        "subject_id": subject_id,
        "timezone": meta["timezone"],
        "sensory_context": meta["sensory_context"],
        "historical_supports": meta["historical_supports"]
    }
    with open(profile_dir / "profile.json", "w", encoding="utf-8") as f:
        json.dump(profile_data, f, indent=2, sort_keys=True)
        
    print(f"Generated {days} days of history and profile for '{subject_id}' under {out_path}.")


def generate_all_histories(out_dir: Path | str) -> None:
    """Generates default PAC-A, PAC-B, and PAC-C histories."""
    # PAC-A: 30 days (sufficient)
    generate_subject_history("PAC-A", days=30, seed=1001, out_dir=out_dir)
    # PAC-B: 30 days (sufficient)
    generate_subject_history("PAC-B", days=30, seed=1002, out_dir=out_dir)
    # PAC-C: 2 days (insufficient for training, to trigger cold-start/abstention)
    generate_subject_history("PAC-C", days=2, seed=1003, out_dir=out_dir)


if __name__ == "__main__":
    proj_root = Path(__file__).resolve().parents[1]
    data_dir = proj_root / "data"
    generate_all_histories(data_dir)

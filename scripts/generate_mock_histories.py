import argparse
import json
import sys
from pathlib import Path
from datetime import date, datetime, timedelta, timezone as dt_timezone
from typing import Any

# Import synthetic generator from our ML package
from ml.dataset_builder import DEMO_TUTOR_ID, generate_synthetic_history


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
    out_dir: Path | str,
    end_date: date | None = None,
) -> None:
    """
    Generates a mock history and profile JSON for a given subject ID.
    Saves history to {out_dir}/legacy_history/{subject_id}_history.json
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
        timezone=meta["timezone"],
        end_date=end_date,
    )
    
    history_serialized = serialize_dt(history)
    
    # Write history JSON
    legacy_history_dir = out_path / "legacy_history"
    legacy_history_dir.mkdir(parents=True, exist_ok=True)
    history_file = legacy_history_dir / f"{subject_id}_history.json"
    with open(history_file, "w", encoding="utf-8") as f:
        json.dump(history_serialized, f, indent=2, sort_keys=True)
        
    # 2. Write profile JSON
    profile_dir = out_path / "demo_profiles" / subject_id
    profile_dir.mkdir(parents=True, exist_ok=True)
    profile_data = {
        "subject_id": subject_id,
        "display_name": subject_id,
        "timezone": meta["timezone"],
        "sensory_context": meta["sensory_context"],
        "historical_supports": meta["historical_supports"],
        "provenance": {"source": "synthetic_demo", "synthetic": True},
        # Actor fijo del frontend (VITE_ACTOR_ID); permite confirmar resultados en la demo.
        "authorized_tutor_ids": [DEMO_TUTOR_ID],
    }
    with open(profile_dir / "profile.json", "w", encoding="utf-8") as f:
        json.dump(profile_data, f, indent=2, sort_keys=True)
        
    print(f"Generated {days} days of history and profile for '{subject_id}' under {out_path}.")


# (días de historial, semilla) por demo. Las semillas fijan cómo termina cada
# historial, y con eso el estado que muestra la demo:
#   PAC-A → riesgo elevado · PAC-B → riesgo bajo · PAC-C → sin estimación (2 días).
DEMO_HISTORIES = {
    "PAC-A": (90, 1020),
    "PAC-B": (90, 1004),
    "PAC-C": (2, 1003),
}


def generate_all_histories(out_dir: Path | str, end_date: date | None = None) -> None:
    """Generates default PAC-A, PAC-B, and PAC-C histories ending on `end_date`."""
    for subject_id, (days, seed) in DEMO_HISTORIES.items():
        generate_subject_history(subject_id, days=days, seed=seed, out_dir=out_dir, end_date=end_date)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Genera los historiales sintéticos de las demos.")
    parser.add_argument(
        "--end-date",
        type=date.fromisoformat,
        default=date.today() - timedelta(days=1),
        help="Día del último registro (AAAA-MM-DD). Por defecto, ayer: la demo muestra datos recientes "
             "el día en que se genera. Para una presentación, usar el día anterior a la fecha de la demo.",
    )
    args = parser.parse_args()
    proj_root = Path(__file__).resolve().parents[1]
    data_dir = proj_root / "data"
    generate_all_histories(data_dir, end_date=args.end_date)

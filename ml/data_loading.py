"""Carga de perfiles e historiales de un sujeto desde disco.

La usan tanto el entrenamiento (`scripts/train_demo_models.py`) como la
evaluación (`ml/evaluation.py`). Concentra aquí el parseo de fechas para que
ambos caminos vean exactamente los mismos datos y no se dupliquen reglas.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any


def parse_timestamp(value: str | datetime) -> datetime:
    """Devuelve un datetime con zona horaria; asume UTC si viene sin ella."""
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def load_subject_data(subject_id: str, data_dir: Path | str) -> dict[str, Any]:
    """Carga perfil, registros, ocurrencias y eventos planificados de un sujeto.

    Estructura esperada del directorio:
      data_dir/demo_profiles/{subject_id}/profile.json
      data_dir/legacy_history/{subject_id}_history.json
    """
    base = Path(data_dir)
    profile_path = base / "demo_profiles" / subject_id / "profile.json"
    history_path = base / "legacy_history" / f"{subject_id}_history.json"

    if not profile_path.exists():
        raise FileNotFoundError(
            f"Profile not found for {subject_id} at {profile_path}"
        )
    if not history_path.exists():
        raise FileNotFoundError(
            f"History not found for {subject_id} at {history_path}"
        )

    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)
    with open(history_path, "r", encoding="utf-8") as f:
        history = json.load(f)

    records = history.get("records", [])
    occurrences = history.get("occurrences", [])
    planned_events = history.get("planned_events", [])

    for record in records:
        record["source_timestamp"] = parse_timestamp(record["source_timestamp"])
        record["availability_timestamp"] = parse_timestamp(
            record["availability_timestamp"]
        )

    for occurrence in occurrences:
        occurrence["source_timestamp"] = parse_timestamp(
            occurrence["source_timestamp"]
        )
        occurrence["availability_timestamp"] = parse_timestamp(
            occurrence["availability_timestamp"]
        )

    for event in planned_events:
        if isinstance(event.get("starts_at"), str):
            event["starts_at"] = parse_timestamp(event["starts_at"])

    return {
        "subject_id": subject_id,
        "profile": profile,
        "records": records,
        "occurrences": occurrences,
        "planned_events": planned_events,
    }

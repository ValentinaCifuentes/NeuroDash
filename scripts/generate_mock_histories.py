import argparse
import json
import sys
from pathlib import Path
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
import zoneinfo
from typing import Any

# Import synthetic generator from our ML package
from ml.dataset_builder import DEMO_TUTOR_ID, demo_profile, generate_synthetic_history


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
    
    profile_data = demo_profile(subject_id)

    # 1. Generate synthetic history
    history = generate_synthetic_history(
        subject_id=subject_id,
        days=days,
        seed=seed,
        timezone=profile_data["timezone"],
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


# Mi Día del día de la demo (el día siguiente a `end_date`), como si la tutora ya lo
# hubiera llenado en la mañana. La estimación usa lo de hoy: sin esto, al abrir la app
# PAC-A y PAC-B se verían iguales. PAC-A durmió mal y despertó irritable (abre en
# riesgo moderado y sube si se registra una desregulación); PAC-B tuvo buena noche.
# PAC-C no lo trae: es un perfil recién creado y se abstiene igual.
DEMO_MORNING_TIME = time(7, 45)
DEMO_MORNINGS: dict[str, dict[str, str]] = {
    "PAC-A": {
        "sleep_quality": "Dificultad de Conciliación",
        "wake_mode": "Irritable/Llorando",
        "start_autonomy": "Con insistencia",
        "medication_adherence": "No",
        "gi_status": "Diarrea",
    },
    "PAC-B": {
        "sleep_quality": "Reparador",
        "wake_mode": "Tranquilo/Alegre",
        "start_autonomy": "Por sí solo",
        "medication_adherence": "Sí",
        "gi_status": "Normal",
    },
}


def demo_morning_record(subject_id: str, day: date) -> dict[str, Any]:
    """Mi Día de esa mañana, codificado igual que `POST /daily-records`."""
    from backend.app.routes.subjects import CareRecordWrite, _encode_care_record

    profile = demo_profile(subject_id)
    occurred_at = datetime.combine(day, DEMO_MORNING_TIME, tzinfo=zoneinfo.ZoneInfo(profile["timezone"]))
    request = CareRecordWrite(
        occurred_at=occurred_at,
        idempotency_key=f"demo-morning:{subject_id}:{day.isoformat()}",
        provenance={"source": "synthetic_demo", "synthetic": True},
        **DEMO_MORNINGS[subject_id],
    )
    return {
        **_encode_care_record(request),
        "contract_version": "2.0",
        "record_id": f"demo-morning-{subject_id}-{day.isoformat()}",
        "subject_id": subject_id,
        "author_id": DEMO_TUTOR_ID,
        "source_timestamp": occurred_at.isoformat(),
        "availability_timestamp": occurred_at.isoformat(),
        "date": day.isoformat(),
        "prediction_availability": "immediate",
        "received_at": occurred_at.isoformat(),
    }


def write_demo_mornings(out_dir: Path | str, day: date) -> None:
    """Deja el Mi Día de `day` como lo registrado en la app (`demo_profiles/{id}/records.json`).

    Reemplaza lo que hubiera: las demos parten limpias, igual que con `docker compose down -v`.
    El entrenamiento no lo usa (lee solo el historial sintético).
    """
    for subject_id in DEMO_HISTORIES:
        subject_dir = Path(out_dir) / "demo_profiles" / subject_id
        for name in ("records.json", "occurrences.json"):
            (subject_dir / name).unlink(missing_ok=True)
        if subject_id in DEMO_MORNINGS:
            with open(subject_dir / "records.json", "w", encoding="utf-8") as f:
                json.dump([demo_morning_record(subject_id, day)], f, indent=2, ensure_ascii=False)


def generate_all_histories(out_dir: Path | str, end_date: date | None = None) -> None:
    """Generates default PAC-A, PAC-B, and PAC-C histories ending on `end_date`,
    plus the demo morning (Mi Día) of the day after."""
    for subject_id, (days, seed) in DEMO_HISTORIES.items():
        generate_subject_history(subject_id, days=days, seed=seed, out_dir=out_dir, end_date=end_date)
    if end_date is not None:
        write_demo_mornings(out_dir, end_date + timedelta(days=1))


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

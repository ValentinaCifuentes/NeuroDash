from datetime import datetime, timezone as dt_timezone, timedelta
import json
import math
from pathlib import Path
import random
import zoneinfo
from typing import Any

from engine.temporal import AvailabilityPolicy, filter_records
from engine.baseline import build_baseline, BaselineSnapshot
from engine.features import build_features
from engine.schemas import HORIZON_HOURS


def build_training_example(
    records: list[dict[str, Any]],
    occurrences: list[dict[str, Any]],
    baseline: BaselineSnapshot,
    cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC",
    horizon_hours: int = HORIZON_HOURS
) -> tuple[dict[str, float | None], bool]:
    """
    Builds a training example (X, y) for a given timezone-aware cutoff T.
    X represents the rolling features as of cutoff T.
    y is True if there is a moderate or severe occurrence in the horizon (T, T + horizon_hours].
    """
    # 1. Build features as of cutoff T
    feat_set = build_features(
        records=records,
        baseline=baseline,
        cutoff=cutoff,
        policy=policy,
        timezone=timezone
    )
    
    # 2. Determine label y
    # Horizon is (cutoff, cutoff + horizon_hours]
    horizon_start = cutoff
    horizon_end = cutoff + timedelta(hours=horizon_hours)
    
    label = False
    if occurrences:
        for occ in occurrences:
            src_ts = occ.get("source_timestamp")
            if not isinstance(src_ts, datetime):
                continue
            
            # Occurrence must be strictly after cutoff and within the horizon
            if horizon_start < src_ts <= horizon_end:
                severity = str(occ.get("severity", "")).lower()
                if severity in ("moderate", "severe"):
                    label = True
                    break
                    
    return feat_set.rolling_features, label


def build_dataset(
    records: list[dict[str, Any]],
    occurrences: list[dict[str, Any]],
    cutoffs: list[datetime],
    split_cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC",
    subject_id: str = "unknown",
    horizon_hours: int = HORIZON_HOURS
) -> tuple[
    list[dict[str, float | None]],
    list[bool],
    list[dict[str, float | None]],
    list[bool],
    dict[str, Any]
]:
    """
    Builds and temporally splits training and validation examples.
    No lookahead: training examples only access records before split_cutoff.
    """
    pol = policy or AvailabilityPolicy()
    
    X_train: list[dict[str, float | None]] = []
    y_train: list[bool] = []
    X_test: list[dict[str, float | None]] = []
    y_test: list[bool] = []
    
    for cutoff in cutoffs:
        # Build baseline as of this cutoff
        baseline = build_baseline(records, cutoff, pol, timezone=timezone)
        
        # Build example
        X, y = build_training_example(
            records=records,
            occurrences=occurrences,
            baseline=baseline,
            cutoff=cutoff,
            policy=pol,
            timezone=timezone,
            horizon_hours=horizon_hours
        )
        
        if cutoff < split_cutoff:
            X_train.append(X)
            y_train.append(y)
        else:
            X_test.append(X)
            y_test.append(y)
            
    lineage = {
        "split_cutoff": split_cutoff.isoformat(),
        "subject_id": subject_id,
        "data_generation_timestamp": datetime.now(dt_timezone.utc).isoformat(),
        "horizon_hours": horizon_hours,
        "policy": {
            "daily_regulation": pol.daily_regulation,
            "exclusion_policy": pol.exclusion_policy
        }
    }
    
    return X_train, y_train, X_test, y_test, lineage


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def generate_synthetic_history(
    subject_id: str,
    days: int,
    seed: int,
    timezone: str = "UTC"
) -> dict[str, Any]:
    """
    Generates a deterministic synthetic history of daily records and occurrence events.

    The data is driven by a hidden "dysregulation load" (an autocorrelated process in
    [0, 1]): every numeric feature is a noisy function of that load, and the probability
    of a moderate/severe crisis later that day is a logistic function of the same load.
    Because the load is persistent across days, *past* records are genuinely predictive
    of *today's* crisis, so the model has real signal to learn (it beats a naive baseline).
    """
    rng = random.Random(seed)

    tz = zoneinfo.ZoneInfo(timezone)
    start_date = datetime(2026, 8, 1, 12, 0, 0, tzinfo=tz)

    records: list[dict[str, Any]] = []
    occurrences: list[dict[str, Any]] = []

    load = 0.5  # latent dysregulation load in [0, 1]

    for d in range(days):
        current_time = start_date + timedelta(days=d)

        # 1. Evolve latent load: strongly autocorrelated (persistent) around 0.5.
        #    A high load today makes a high load tomorrow likely, which is what lets
        #    past features anticipate a future crisis.
        load = _clip(0.5 + 0.85 * (load - 0.5) + 0.20 * rng.gauss(0.0, 1.0), 0.0, 1.0)

        # 2. Numeric features as noisy functions of load (higher load -> worse state).
        #    Noise is deliberately small so the load signal dominates.
        sleep_quality = round(_clip(10.0 - 5.5 * load + 0.35 * rng.gauss(0.0, 1.0), 4.0, 10.0), 2)
        wake_state = round(_clip(2.0 + 6.5 * load + 0.35 * rng.gauss(0.0, 1.0), 2.0, 9.0), 2)
        event_count = max(0, int(round(6.0 * load + 0.5 * rng.gauss(0.0, 1.0))))
        dysregulation_count = min(
            event_count,
            max(0, int(round(3.0 * load + 0.3 * rng.gauss(0.0, 1.0))))
        )
        max_intensity = int(_clip(round(1.0 + 9.0 * load + 0.5 * rng.gauss(0.0, 1.0)), 1, 10))
        start_autonomy_level = int(_clip(round(2.0 * load + 0.3 * rng.gauss(0.0, 1.0)), 0, 2))
        medication_taken = 1 if rng.random() > 0.30 * load else 0
        gi_level = int(_clip(round(2.0 * load + 0.3 * rng.gauss(0.0, 1.0)), 0, 2))
        day_regulation_level_num = int(_clip(round(2.0 * load + 0.3 * rng.gauss(0.0, 1.0)), 0, 2))

        record = {
            "id": f"rec_{subject_id}_{d}",
            "subject_id": subject_id,
            "source_timestamp": current_time,
            "availability_timestamp": current_time,
            "sleep_quality": sleep_quality,
            "wake_state": wake_state,
            "event_count": event_count,
            "dysregulation_count": dysregulation_count,
            "max_intensity": max_intensity,
            "start_autonomy_level": start_autonomy_level,
            "medication_taken": medication_taken,
            "gi_level": gi_level,
            "day_regulation_level_num": day_regulation_level_num,
        }
        records.append(record)

        # 3. Crisis occurrence (moderate/severe) later that day, driven by the load.
        #    Occurrences fall within the 8h horizon after the noon cutoff (13:00–20:00).
        #    Steep logistic keeps the base rate realistic (~15–20%) while remaining
        #    strongly dependent on the load.
        p_crisis = 1.0 / (1.0 + math.exp(-8.0 * (load - 0.7)))
        if rng.random() < p_crisis:
            occ_hour = rng.randint(1, 8)
            occ_time = current_time + timedelta(hours=occ_hour)
            avail_time = occ_time + timedelta(hours=2)  # 2 hours notification delay
            severity = "severe" if load > 0.72 else "moderate"
            intensity_value = int(_clip(round(1.0 + 9.0 * load + rng.gauss(0.0, 0.8)), 1, 10))

            occurrence = {
                "id": f"occ_{subject_id}_{d}",
                "subject_id": subject_id,
                "source_timestamp": occ_time,
                "availability_timestamp": avail_time,
                "severity": severity,
                "event_type": "Desregulación Emocional",
                "intensity_value": intensity_value,
            }
            occurrences.append(occurrence)

    lineage = {
        "seed": seed,
        "generator_name": "synthetic_history_generator",
        "generator_version": "2.0-load-driven",
        "data_generation_timestamp": datetime.now(dt_timezone.utc).isoformat()
    }

    return {
        "records": records,
        "occurrences": occurrences,
        "lineage": lineage
    }


# Actor fijo del frontend (`VITE_ACTOR_ID` por defecto). Va en `authorized_tutor_ids`
# de los perfiles demo para que la demo pueda confirmar resultados.
DEMO_TUTOR_ID = "tutor-demo"


def populate_demo_fixtures(project_root: Path | str) -> None:
    """
    Populates data/legacy_history/ and data/demo_profiles/ with mock profiles and histories.
    """
    root = Path(project_root)
    legacy_history_dir = root / "data" / "legacy_history"
    legacy_history_dir.mkdir(parents=True, exist_ok=True)
    
    profiles = {
        "PAC-A": {
            "subject_id": "PAC-A",
            "timezone": "America/New_York",
            "sensory_context": {"sensory_profile": "Hipersensible"},
            "seed": 1001
        },
        "PAC-B": {
            "subject_id": "PAC-B",
            "timezone": "UTC",
            "sensory_context": {"sensory_profile": "Hiposensible"},
            "seed": 1002
        },
        "PAC-C": {
            "subject_id": "PAC-C",
            "timezone": "America/Chicago",
            "sensory_context": {"sensory_profile": "Buscador sensorial"},
            "seed": 1003
        }
    }
    
    for pid, info in profiles.items():
        # 1. Generate history
        history = generate_synthetic_history(
            subject_id=pid,
            days=30,
            seed=info["seed"],
            timezone=info["timezone"]
        )
        
        # Helper to convert datetimes to ISO strings for serialization
        def serialize_dt(obj: Any) -> Any:
            if isinstance(obj, datetime):
                return obj.isoformat()
            if isinstance(obj, list):
                return [serialize_dt(item) for item in obj]
            if isinstance(obj, dict):
                return {k: serialize_dt(v) for k, v in obj.items()}
            return obj
            
        history_serialized = serialize_dt(history)
        
        # Save history to data/legacy_history/PAC-X_history.json
        history_path = legacy_history_dir / f"{pid}_history.json"
        with open(history_path, "w", encoding="utf-8") as f:
            json.dump(history_serialized, f, indent=2, sort_keys=True)
            
        # 2. Save profile
        profile_dir = root / "data" / "demo_profiles" / pid
        profile_dir.mkdir(parents=True, exist_ok=True)
        
        profile_data = {
            "subject_id": pid,
            "display_name": pid,
            "timezone": info["timezone"],
            "sensory_context": info["sensory_context"],
            "provenance": {"source": "synthetic_demo", "synthetic": True},
            "authorized_tutor_ids": [DEMO_TUTOR_ID],
        }
        
        with open(profile_dir / "profile.json", "w", encoding="utf-8") as f:
            json.dump(profile_data, f, indent=2, sort_keys=True)

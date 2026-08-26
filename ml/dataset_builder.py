from datetime import datetime, timezone as dt_timezone, timedelta
import json
from pathlib import Path
import random
import zoneinfo
from typing import Any

from engine.temporal import AvailabilityPolicy, filter_records
from engine.baseline import build_baseline, BaselineSnapshot
from engine.features import build_features


def build_training_example(
    records: list[dict[str, Any]],
    occurrences: list[dict[str, Any]],
    baseline: BaselineSnapshot,
    cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC"
) -> tuple[dict[str, float | None], bool]:
    """
    Builds a training example (X, y) for a given timezone-aware cutoff T.
    X represents the rolling features as of cutoff T.
    y is True if there is a moderate or severe occurrence in the horizon (T, T + 24h].
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
    # Horizon is (cutoff, cutoff + 24h]
    horizon_start = cutoff
    horizon_end = cutoff + timedelta(hours=24)
    
    label = False
    if occurrences:
        for occ in occurrences:
            src_ts = occ.get("source_timestamp")
            if not isinstance(src_ts, datetime):
                continue
            
            # Occurrence must be strictly after cutoff and <= cutoff + 24h
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
    subject_id: str = "unknown"
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
            timezone=timezone
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
        "policy": {
            "daily_regulation": pol.daily_regulation,
            "exclusion_policy": pol.exclusion_policy
        }
    }
    
    return X_train, y_train, X_test, y_test, lineage


def generate_synthetic_history(
    subject_id: str,
    days: int,
    seed: int,
    timezone: str = "UTC"
) -> dict[str, Any]:
    """
    Generates a deterministic synthetic history of daily records and occurrence events.
    Tracks lineage metadata explicitly.
    """
    rng = random.Random(seed)
    
    # Start date in the past
    tz = zoneinfo.ZoneInfo(timezone)
    start_date = datetime(2026, 8, 1, 12, 0, 0, tzinfo=tz)
    
    records = []
    occurrences = []
    
    for d in range(days):
        current_time = start_date + timedelta(days=d)
        
        # Generate daily record
        # Metric ranges:
        # sleep_quality: 4.0 - 10.0
        # wake_state: 3.0 - 9.0
        # event_count: 0 - 5
        sleep_quality = rng.uniform(4.0, 10.0)
        wake_state = rng.uniform(3.0, 9.0)
        event_count = rng.randint(0, 5)
        
        record = {
            "id": f"rec_{subject_id}_{d}",
            "subject_id": subject_id,
            "source_timestamp": current_time,
            "availability_timestamp": current_time,
            "sleep_quality": round(sleep_quality, 2),
            "wake_state": round(wake_state, 2),
            "event_count": event_count
        }
        records.append(record)
        
        # Generate occurrences with a low probability (e.g. 15%)
        if rng.random() < 0.15:
            occ_hour = rng.randint(13, 23)
            occ_time = current_time + timedelta(hours=occ_hour)
            avail_time = occ_time + timedelta(hours=2) # 2 hours notification delay
            severity = rng.choice(["mild", "moderate", "severe"])
            
            occurrence = {
                "id": f"occ_{subject_id}_{d}",
                "subject_id": subject_id,
                "source_timestamp": occ_time,
                "availability_timestamp": avail_time,
                "severity": severity
            }
            occurrences.append(occurrence)
            
    lineage = {
        "seed": seed,
        "generator_name": "synthetic_history_generator",
        "data_generation_timestamp": datetime.now(dt_timezone.utc).isoformat()
    }
    
    return {
        "records": records,
        "occurrences": occurrences,
        "lineage": lineage
    }


def populate_demo_fixtures(project_root: Path | str) -> None:
    """
    Populates data/bluba/ and data/demo_profiles/ with mock profiles and histories.
    """
    root = Path(project_root)
    bluba_dir = root / "data" / "bluba"
    bluba_dir.mkdir(parents=True, exist_ok=True)
    
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
        
        # Save history to data/bluba/PAC-X_history.json
        history_path = bluba_dir / f"{pid}_history.json"
        with open(history_path, "w", encoding="utf-8") as f:
            json.dump(history_serialized, f, indent=2, sort_keys=True)
            
        # 2. Save profile
        profile_dir = root / "data" / "demo_profiles" / pid
        profile_dir.mkdir(parents=True, exist_ok=True)
        
        profile_data = {
            "subject_id": pid,
            "timezone": info["timezone"],
            "sensory_context": info["sensory_context"]
        }
        
        with open(profile_dir / "profile.json", "w", encoding="utf-8") as f:
            json.dump(profile_data, f, indent=2, sort_keys=True)

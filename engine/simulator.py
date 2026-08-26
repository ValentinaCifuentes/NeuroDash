"""
Adaptive telemetry simulator for NeuraDash.

Generates synthetic sensor bursts using **adaptive sampling**: readings are
only emitted when a value changes beyond a configurable dead-band threshold.
A low-frequency heartbeat (~every 2 hours) is emitted regardless to confirm
sensor liveness.

This yields clinically coherent data densities:
  - "estable" profile  → ~15-25 readings / 24h (quiet, minimal change)
  - "riesgo_acumulado" → ~80-120 readings / 24h (high variability, many triggers)
  - "datos_insuficientes" → 0 or stale-only readings (>48h old)

Every generated observation includes mandatory provenance with
``synthetic_flag=True``.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any

# ---------------------------------------------------------------------------
# Dead-band thresholds: a new reading is emitted only when the value changes
# by more than this amount since the last emitted reading.
# ---------------------------------------------------------------------------
DEAD_BAND: dict[str, float] = {
    "environmental_noise": 5.0,   # ±5 dBA
    "movement_agitation": 0.3,    # ±0.3 g
    "ambient_light": 30.0,        # ±30 lux
    "heart_rate": 5.0,            # ±5 bpm
}

# Maximum gap (seconds) between readings even if values are stable.
# Acts as a "sensor alive" heartbeat.
HEARTBEAT_INTERVAL_S: int = 2 * 3600  # 2 hours

# Minimum gap between consecutive readings (avoid sub-second bursts).
MIN_INTERVAL_S: int = 60  # 1 minute

# Canonical units per signal (must match telemetry_schemas.SIGNAL_UNIT_MAP).
SIGNAL_UNITS: dict[str, str] = {
    "environmental_noise": "dBA",
    "movement_agitation": "g",
    "ambient_light": "lux",
    "heart_rate": "bpm",
}

SIMULATOR_ORIGIN = "neuradash_simulator_v1"


# ---------------------------------------------------------------------------
# Profile generators: produce a raw time-series of values for each signal
# over 24 hours, then the adaptive sampler decides which to keep.
# ---------------------------------------------------------------------------

def _generate_raw_series_estable(
    rng: random.Random,
    duration_h: int = 24,
    step_minutes: int = 5,
) -> dict[str, list[tuple[int, float]]]:
    """
    Stable profile: quiet environment, normal movement, resting heart rate.

    Returns {signal: [(offset_seconds, value), ...]} with dense 5-minute
    raw samples that the adaptive filter will thin out.
    """
    steps = (duration_h * 60) // step_minutes
    series: dict[str, list[tuple[int, float]]] = {s: [] for s in SIGNAL_UNITS}

    for i in range(steps):
        offset_s = i * step_minutes * 60
        # Noise: quiet household, 30-48 dBA with slow drift
        noise = 35.0 + 5.0 * math.sin(i * 0.02) + rng.gauss(0, 1.5)
        noise = max(25.0, min(noise, 50.0))
        series["environmental_noise"].append((offset_s, round(noise, 1)))

        # Movement: minimal, 0.1-0.5 g
        movement = 0.2 + 0.1 * math.sin(i * 0.05) + rng.gauss(0, 0.05)
        movement = max(0.05, min(movement, 0.6))
        series["movement_agitation"].append((offset_s, round(movement, 2)))

        # Light: day/night cycle
        hour_of_day = (i * step_minutes / 60) % 24
        if 7 <= hour_of_day <= 20:
            light = 150.0 + 30 * math.sin((hour_of_day - 7) * math.pi / 13) + rng.gauss(0, 10)
        else:
            light = 10.0 + rng.gauss(0, 3)
        light = max(0.0, min(light, 500.0))
        series["ambient_light"].append((offset_s, round(light, 1)))

        # Heart rate: resting 70-80 bpm
        hr = 74.0 + 3.0 * math.sin(i * 0.03) + rng.gauss(0, 1.5)
        hr = max(60.0, min(hr, 90.0))
        series["heart_rate"].append((offset_s, round(hr, 1)))

    return series


def _generate_raw_series_riesgo(
    rng: random.Random,
    duration_h: int = 24,
    step_minutes: int = 2,
) -> dict[str, list[tuple[int, float]]]:
    """
    Escalating risk profile: rising noise, increasing agitation, HR spikes.

    Uses denser 2-minute raw sampling to capture rapid changes.
    """
    steps = (duration_h * 60) // step_minutes
    series: dict[str, list[tuple[int, float]]] = {s: [] for s in SIGNAL_UNITS}

    for i in range(steps):
        offset_s = i * step_minutes * 60
        progress = i / max(steps - 1, 1)  # 0 → 1 over the 24h

        # Noise: starts moderate ~60 dBA, ramps to 75-95 dBA with spikes
        base_noise = 60.0 + 30.0 * progress
        noise = base_noise + rng.gauss(0, 4) + (10 * rng.random() if rng.random() < 0.15 else 0)
        noise = max(45.0, min(noise, 100.0))
        series["environmental_noise"].append((offset_s, round(noise, 1)))

        # Agitation: ramps from 0.3 to 2.5 g with bursts
        base_agit = 0.3 + 2.0 * progress
        agitation = base_agit + rng.gauss(0, 0.2) + (0.8 * rng.random() if rng.random() < 0.2 else 0)
        agitation = max(0.1, min(agitation, 3.5))
        series["movement_agitation"].append((offset_s, round(agitation, 2)))

        # Light: erratic, simulating frequent room changes
        light = 100.0 + 150 * rng.random() + 50 * math.sin(i * 0.3)
        light = max(0.0, min(light, 600.0))
        series["ambient_light"].append((offset_s, round(light, 1)))

        # Heart rate: elevated baseline rising from 85 to 120 with peaks
        base_hr = 85.0 + 35.0 * progress
        hr = base_hr + rng.gauss(0, 5) + (15 * rng.random() if rng.random() < 0.1 else 0)
        hr = max(70.0, min(hr, 140.0))
        series["heart_rate"].append((offset_s, round(hr, 1)))

    return series


# ---------------------------------------------------------------------------
# Adaptive sampler
# ---------------------------------------------------------------------------

def _adaptive_sample(
    raw_series: dict[str, list[tuple[int, float]]],
) -> list[tuple[int, str, float]]:
    """
    Apply dead-band filtering to raw series.

    Returns a merged, time-sorted list of (offset_seconds, signal, value)
    tuples that passed the adaptive threshold or heartbeat condition.
    """
    emitted: list[tuple[int, str, float]] = []

    for signal, readings in raw_series.items():
        if not readings:
            continue

        threshold = DEAD_BAND.get(signal, 5.0)
        last_emitted_value: float | None = None
        last_emitted_offset: int = -(HEARTBEAT_INTERVAL_S + 1)  # force first emit

        for offset_s, value in readings:
            elapsed = offset_s - last_emitted_offset

            # Emit if: value changed beyond dead-band OR heartbeat interval exceeded
            value_changed = (
                last_emitted_value is None
                or abs(value - last_emitted_value) >= threshold
            )
            heartbeat_due = elapsed >= HEARTBEAT_INTERVAL_S

            if value_changed or heartbeat_due:
                # Respect minimum interval to avoid sub-minute bursts
                if elapsed >= MIN_INTERVAL_S or last_emitted_value is None:
                    emitted.append((offset_s, signal, value))
                    last_emitted_value = value
                    last_emitted_offset = offset_s

    # Sort by time across all signals
    emitted.sort(key=lambda x: x[0])
    return emitted


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_telemetry_burst(
    subject_id: str,
    profile: str,
    reference_time: datetime | None = None,
    seed: int | None = None,
) -> list[dict[str, Any]]:
    """
    Generate a burst of adaptive-sampled telemetry observations.

    Parameters
    ----------
    subject_id : str
        Patient identifier.
    profile : str
        One of ``"estable"``, ``"riesgo_acumulado"``, ``"datos_insuficientes"``.
    reference_time : datetime, optional
        The "now" anchor.  Defaults to ``datetime.now(timezone.utc)``.
    seed : int, optional
        RNG seed for reproducible output.

    Returns
    -------
    list[dict]
        Each dict is a flat observation record ready for storage, including
        ``provenance`` with ``synthetic_flag=True``.
    """
    ref = reference_time or datetime.now(timezone.utc)
    rng = random.Random(seed)

    if profile == "datos_insuficientes":
        # Return either empty or a handful of very stale readings (>48h old)
        if rng.random() < 0.5:
            return []
        # Generate 3 stale readings from 60-72 hours ago
        stale_observations: list[dict[str, Any]] = []
        for i in range(3):
            stale_time = ref - timedelta(hours=rng.randint(60, 72))
            stale_observations.append({
                "subject_id": subject_id,
                "device_id": "sim_device_stale",
                "timestamp": stale_time.isoformat(),
                "signal": "environmental_noise",
                "value": round(rng.uniform(30, 45), 1),
                "unit": "dBA",
                "window": "adaptive",
                "provenance": {
                    "origin": SIMULATOR_ORIGIN,
                    "synthetic_flag": True,
                },
            })
        return stale_observations

    # Generate dense raw series and apply adaptive sampling
    if profile == "estable":
        raw = _generate_raw_series_estable(rng)
    elif profile == "riesgo_acumulado":
        raw = _generate_raw_series_riesgo(rng)
    else:
        raise ValueError(f"Unknown simulation profile: '{profile}'")

    sampled = _adaptive_sample(raw)

    # Convert to observation dicts with absolute timestamps
    start_time = ref - timedelta(hours=24)
    observations: list[dict[str, Any]] = []

    for offset_s, signal, value in sampled:
        obs_time = start_time + timedelta(seconds=offset_s)
        observations.append({
            "subject_id": subject_id,
            "device_id": f"sim_device_{profile}",
            "timestamp": obs_time.isoformat(),
            "signal": signal,
            "value": value,
            "unit": SIGNAL_UNITS[signal],
            "window": "adaptive",
            "provenance": {
                "origin": SIMULATOR_ORIGIN,
                "synthetic_flag": True,
            },
        })

    return observations

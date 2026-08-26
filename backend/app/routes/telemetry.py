"""
FastAPI router for the NeuraDash Telemetry Plugin.

Endpoints
---------
POST /api/v1/telemetry
    Ingest a validated telemetry payload from a device or external system.

POST /api/v1/telemetry/simulate
    Generate adaptive-sampled synthetic data for one of three test profiles.

GET  /api/v1/telemetry/{subject_id}
    Retrieve stored observations for a subject (debug / demo utility).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backend.app.telemetry_schemas import (
    SimulationRequest,
    TelemetryPayload,
    TelemetryResponse,
)
from engine.simulator import generate_telemetry_burst
from engine.telemetry_store import TelemetryStore

logger = logging.getLogger("neuradash.telemetry")

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry Plugin"])

# ---------------------------------------------------------------------------
# Store singleton — uses project-level ``data/`` directory.
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_DATA_DIR = _PROJECT_ROOT / "data"


def _get_store() -> TelemetryStore:
    """Lazy-initialised store so import time stays fast."""
    return TelemetryStore(data_dir=_DEFAULT_DATA_DIR)


# ---------------------------------------------------------------------------
# POST /api/v1/telemetry — Ingest
# ---------------------------------------------------------------------------

@router.post("", response_model=TelemetryResponse)
def ingest_telemetry(payload: TelemetryPayload) -> TelemetryResponse:
    """
    Validate and persist a telemetry payload.

    Each observation in the payload is stored as a flat dict in the
    subject's ``telemetry_{subject_id}.json`` file.
    """
    store = _get_store()

    observations: list[dict[str, Any]] = []
    for obs in payload.observations:
        observations.append({
            "subject_id": payload.subject_id,
            "device_id": payload.device_id,
            "timestamp": payload.timestamp.isoformat(),
            "signal": obs.signal.value,
            "value": obs.value,
            "unit": obs.unit,
            "window": obs.window,
            "provenance": {
                "origin": obs.provenance.origin,
                "synthetic_flag": obs.provenance.synthetic_flag,
            },
        })

    stored = store.append_observations(payload.subject_id, observations)
    logger.info(
        "Ingested %d observations for subject %s from device %s",
        stored, payload.subject_id, payload.device_id,
    )

    return TelemetryResponse(
        status="ok",
        stored_count=stored,
        subject_id=payload.subject_id,
        message=f"Successfully stored {stored} observation(s).",
    )


# ---------------------------------------------------------------------------
# POST /api/v1/telemetry/simulate — Simulation
# ---------------------------------------------------------------------------

@router.post("/simulate", response_model=TelemetryResponse)
def simulate_telemetry(req: SimulationRequest) -> TelemetryResponse:
    """
    Generate and persist a burst of adaptive-sampled synthetic telemetry
    for the requested profile.

    Profiles
    --------
    - ``estable``: ~15-25 readings, quiet environment.
    - ``riesgo_acumulado``: ~80-120 readings, escalating risk indicators.
    - ``datos_insuficientes``: 0 or stale-only readings (>48h old).
    """
    reference_time = datetime.now(timezone.utc)

    observations = generate_telemetry_burst(
        subject_id=req.subject_id,
        profile=req.profile,
        reference_time=reference_time,
        seed=req.seed,
    )

    store = _get_store()

    if observations:
        store.append_observations(req.subject_id, observations)

    logger.info(
        "Simulated profile '%s' for subject %s: %d observations generated",
        req.profile, req.subject_id, len(observations),
    )

    return TelemetryResponse(
        status="ok",
        stored_count=len(observations),
        subject_id=req.subject_id,
        message=(
            f"Simulated '{req.profile}' profile with adaptive sampling: "
            f"{len(observations)} observation(s) generated."
        ),
    )


# ---------------------------------------------------------------------------
# GET /api/v1/telemetry/{subject_id} — Read
# ---------------------------------------------------------------------------

@router.get("/{subject_id}")
def get_telemetry(
    subject_id: str,
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours."),
) -> dict[str, Any]:
    """
    Retrieve stored telemetry observations for a subject within a lookback
    window.  Useful for debugging and demo purposes.
    """
    store = _get_store()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    observations = store.read_observations(subject_id, after=cutoff)

    return {
        "subject_id": subject_id,
        "lookback_hours": hours,
        "total_observations": len(observations),
        "observations": observations,
    }

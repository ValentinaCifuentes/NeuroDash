import yaml
from pathlib import Path
from engine.schemas import ConfidenceLevel

def calculate_confidence(missingness: list[dict], config_path: Path | str | None = None) -> ConfidenceLevel:
    """
    Calculates confidence level based on missingness coverage of features.
    Confidence is monotonic with coverage.
    """
    # Default thresholds if config is missing/unreadable
    high_threshold = 0.8
    medium_threshold = 0.6
    low_threshold = 0.4

    if config_path is not None:
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f)
                if cfg:
                    high_threshold = cfg.get("high_threshold", high_threshold)
                    medium_threshold = cfg.get("medium_threshold", medium_threshold)
                    low_threshold = cfg.get("low_threshold", low_threshold)
        except Exception:
            pass
    else:
        # Check standard config path
        proj_root = Path(__file__).resolve().parents[2]
        std_config = proj_root / "config" / "confidence.yaml"
        if std_config.exists():
            try:
                with open(std_config, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f)
                    if cfg:
                        high_threshold = cfg.get("high_threshold", high_threshold)
                        medium_threshold = cfg.get("medium_threshold", medium_threshold)
                        low_threshold = cfg.get("low_threshold", low_threshold)
            except Exception:
                pass

    if not missingness:
        return ConfidenceLevel.HIGH

    missing_count = sum(1 for m in missingness if m.get("missing", False))
    total_count = len(missingness)
    coverage = (total_count - missing_count) / total_count

    if coverage >= high_threshold:
        return ConfidenceLevel.HIGH
    elif coverage >= medium_threshold:
        return ConfidenceLevel.MEDIUM
    elif coverage >= low_threshold:
        return ConfidenceLevel.LOW
    else:
        return ConfidenceLevel.INSUFFICIENT


# ---------------------------------------------------------------------------
# TELEMETRY PLUGIN: Extended confidence with telemetry awareness
# ---------------------------------------------------------------------------
# This function is ADDITIVE — it does not modify calculate_confidence()
# above.  The CORE pipeline continues to use calculate_confidence() and
# the abstention module as before.
# ---------------------------------------------------------------------------

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TelemetryConfidenceResult:
    """
    Result of the telemetry-aware confidence calculation.

    Attributes
    ----------
    level : ConfidenceLevel
        Computed confidence level.
    abstain : bool
        Whether the system should refuse to emit a prediction.
    reason : str | None
        Human-readable explanation (populated when ``abstain=True`` or
        confidence is degraded).
    """

    level: ConfidenceLevel
    abstain: bool
    reason: str | None


def calculate_telemetry_confidence(
    has_telemetry: bool,
    telemetry_continuous: bool,
    logbook_up_to_date: bool,
    logbook_last_entry_hours: float,
    config_path: Path | str | None = None,
) -> TelemetryConfidenceResult:
    """
    Determine prediction confidence incorporating telemetry availability and
    logbook consistency.

    Policy Table
    -------------
    | Telemetry (active + continuous) | Logbook up-to-date | → Confidence | Abstain |
    |---------------------------------|--------------------|--------------| --------|
    | ✅ Yes                          | ✅ Yes             | HIGH         | False   |
    | ✅ Yes (but gaps)               | ❌ No (>48h)       | LOW          | False   |
    | ❌ No                           | ✅ Yes             | MEDIUM       | False   |
    | ❌ No                           | ❌ No (>48h)       | INSUFFICIENT | True    |

    Parameters
    ----------
    has_telemetry : bool
        Whether any telemetry data exists for the last 24h.
    telemetry_continuous : bool
        Whether telemetry has been arriving without gaps > continuity threshold.
    logbook_up_to_date : bool
        Whether the family logbook has entries within the staleness window.
    logbook_last_entry_hours : float
        Hours since the last logbook entry.
    config_path : Path | str | None
        Optional path to ``confidence.yaml`` to read thresholds.
    """
    # Load configurable thresholds
    stale_hours: float = 48.0
    continuity_gap_hours: float = 6.0

    resolved_config = config_path
    if resolved_config is None:
        proj_root = Path(__file__).resolve().parents[2]
        std = proj_root / "config" / "confidence.yaml"
        if std.exists():
            resolved_config = std

    if resolved_config is not None:
        try:
            with open(resolved_config, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f)
                if cfg and isinstance(cfg.get("telemetry"), dict):
                    tel_cfg = cfg["telemetry"]
                    stale_hours = float(tel_cfg.get("logbook_stale_hours", stale_hours))
                    continuity_gap_hours = float(
                        tel_cfg.get("telemetry_continuity_gap_hours", continuity_gap_hours)
                    )
        except Exception:
            pass

    # Apply policy table
    logbook_stale = logbook_last_entry_hours > stale_hours

    if has_telemetry and telemetry_continuous and not logbook_stale:
        return TelemetryConfidenceResult(
            level=ConfidenceLevel.HIGH,
            abstain=False,
            reason=None,
        )

    if has_telemetry and not logbook_stale:
        return TelemetryConfidenceResult(
            level=ConfidenceLevel.HIGH,
            abstain=False,
            reason="Telemetry data has minor gaps but logbook is current.",
        )

    if has_telemetry and logbook_stale:
        return TelemetryConfidenceResult(
            level=ConfidenceLevel.LOW,
            abstain=False,
            reason=(
                f"Telemetry data is available but family logbook is stale "
                f"({logbook_last_entry_hours:.0f}h since last entry, "
                f"threshold: {stale_hours:.0f}h)."
            ),
        )

    if not has_telemetry and not logbook_stale:
        return TelemetryConfidenceResult(
            level=ConfidenceLevel.MEDIUM,
            abstain=False,
            reason=(
                "No telemetry data available. Prediction based on "
                "subjective logbook only."
            ),
        )

    # No telemetry AND stale logbook → Abstain
    return TelemetryConfidenceResult(
        level=ConfidenceLevel.INSUFFICIENT,
        abstain=True,
        reason=(
            f"Insufficient data: no telemetry and family logbook is stale "
            f"({logbook_last_entry_hours:.0f}h since last entry, "
            f"threshold: {stale_hours:.0f}h). Cannot produce reliable prediction."
        ),
    )

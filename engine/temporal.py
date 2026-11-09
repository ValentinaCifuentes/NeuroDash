from datetime import date, datetime, timezone, tzinfo
from functools import lru_cache
from pathlib import Path
from typing import Any
import yaml
import zoneinfo

# Única fuente de la regla de fechas: la usan la predicción, el entrenamiento y la evaluación.
AVAILABILITY_CONFIG = Path(__file__).resolve().parents[1] / "config" / "availability.yaml"

# `prior_day_only`: nada del día del corte cuenta (regla anterior, se mantiene para comparar).
# `intraday`: cuenta todo lo disponible hasta el corte, salvo lo marcado en el propio
# registro como `prediction_availability: prior_day_only` (el cierre del día), que
# resume la jornada completa y recién cuenta al día siguiente.
DAILY_REGULATIONS = ("prior_day_only", "intraday")


class TemporalError(ValueError):
    """Exception raised for temporal validation errors."""
    pass


@lru_cache(maxsize=1)
def configured_daily_regulation() -> str:
    """Regla de `config/availability.yaml` (se lee una vez por proceso)."""
    with open(AVAILABILITY_CONFIG, "r", encoding="utf-8") as f:
        return (yaml.safe_load(f) or {}).get("daily_regulation", "prior_day_only")


class AvailabilityPolicy:
    """Holds configuration for data availability and temporal regulation.

    Sin `daily_regulation` usa la de `config/availability.yaml`.
    """
    def __init__(self, daily_regulation: str | None = None, exclusion_policy: str = "conservative") -> None:
        regulation = daily_regulation or configured_daily_regulation()
        if regulation not in DAILY_REGULATIONS:
            raise TemporalError(f"Unknown daily_regulation: {regulation!r} (expected one of {DAILY_REGULATIONS})")
        self.daily_regulation = regulation
        self.exclusion_policy = exclusion_policy

    @classmethod
    def load_from_yaml(cls, path: str | Path) -> "AvailabilityPolicy":
        with open(path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
        return cls(
            daily_regulation=config.get("daily_regulation", "prior_day_only"),
            exclusion_policy=config.get("exclusion_policy", "conservative")
        )


def resolve_timezone(tz: str | tzinfo | zoneinfo.ZoneInfo) -> tzinfo:
    if not isinstance(tz, str):
        return tz
    try:
        return zoneinfo.ZoneInfo(tz)
    except Exception as e:
        if tz.upper() == "UTC":
            return timezone.utc
        raise TemporalError(f"Invalid timezone: {tz}") from e


def _require_aware_timestamps(record: dict[str, Any]) -> tuple[datetime, datetime]:
    source_ts = record.get("source_timestamp")
    avail_ts = record.get("availability_timestamp")
    if not isinstance(source_ts, datetime) or not isinstance(avail_ts, datetime):
        raise TemporalError("Timestamps must be datetime objects")
    if source_ts.tzinfo is None or avail_ts.tzinfo is None:
        raise TemporalError("source_timestamp and availability_timestamp must be timezone-aware")
    return source_ts, avail_ts


def exclusion_reason(
    record: dict[str, Any],
    cutoff: datetime,
    policy: AvailabilityPolicy,
    tz: tzinfo,
) -> str | None:
    """Por qué un registro no se puede usar en el corte, o None si se puede."""
    source_ts, avail_ts = _require_aware_timestamps(record)
    if avail_ts > cutoff:
        return "after_cutoff"

    cutoff_local_date = cutoff.astimezone(tz).date()
    if policy.daily_regulation == "prior_day_only":
        if avail_ts.astimezone(tz).date() >= cutoff_local_date:
            return "same_day_regulation"
    elif record.get("prediction_availability") == "prior_day_only":
        if source_ts.astimezone(tz).date() >= cutoff_local_date:
            return "same_day_regulation"
    return None


def completed_days(
    records: list[dict[str, Any]],
    cutoff: datetime,
    tz: tzinfo,
) -> list[dict[str, Any]]:
    """Registros de días ya terminados (fecha local anterior a la del corte).

    El historial (ventanas de 1–14 días y línea base) se arma solo con estos, con
    cualquier regla: lo de hoy todavía está incompleto y no se mezcla con los días cerrados.
    """
    cutoff_local_date: date = cutoff.astimezone(tz).date()
    return [r for r in records if r["source_timestamp"].astimezone(tz).date() < cutoff_local_date]


class TemporalContext:
    """Encapsulates the temporal constraints (cutoff time and timezone) for a prediction request."""
    def __init__(
        self,
        cutoff: datetime,
        policy: AvailabilityPolicy | None = None,
        timezone: str | tzinfo | zoneinfo.ZoneInfo = "UTC"
    ) -> None:
        if cutoff.tzinfo is None:
            raise TemporalError("cutoff must be timezone-aware")

        self.cutoff = cutoff
        self.policy = policy or AvailabilityPolicy()
        self.timezone = resolve_timezone(timezone)

    def is_eligible(self, record: dict[str, Any]) -> bool:
        """Determines if a record satisfies the temporal cutoff and daily regulation policies."""
        return exclusion_reason(record, self.cutoff, self.policy, self.timezone) is None


def filter_records(
    records: list[dict[str, Any]],
    cutoff: datetime,
    policy: AvailabilityPolicy,
    timezone: str | tzinfo | zoneinfo.ZoneInfo = "UTC"
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Filter records based on a cutoff date and availability policy.
    Returns:
        (eligible_records, provenance_metadata)
    """
    context = TemporalContext(cutoff=cutoff, policy=policy, timezone=timezone)
    eligible = []
    exclusions = []

    for record in records:
        reason = exclusion_reason(record, cutoff, policy, context.timezone)
        if reason is not None:
            exclusions.append({
                "record_id": record.get("id") or record.get("subject_id") or "unknown",
                "reason": reason,
                "availability_timestamp": record["availability_timestamp"].isoformat()
            })
            continue
        eligible.append(record)

    provenance = {
        "excluded_count": len(exclusions),
        "exclusions": exclusions,
        "policy": {
            "daily_regulation": policy.daily_regulation,
            "exclusion_policy": policy.exclusion_policy
        }
    }

    return eligible, provenance

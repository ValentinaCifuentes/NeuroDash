from datetime import datetime, timezone, tzinfo
from pathlib import Path
from typing import Any
import yaml
import zoneinfo

class TemporalError(ValueError):
    """Exception raised for temporal validation errors."""
    pass


class AvailabilityPolicy:
    """Holds configuration for data availability and temporal regulation."""
    def __init__(self, daily_regulation: str = "prior_day_only", exclusion_policy: str = "conservative") -> None:
        self.daily_regulation = daily_regulation
        self.exclusion_policy = exclusion_policy

    @classmethod
    def load_from_yaml(cls, path: str | Path) -> "AvailabilityPolicy":
        with open(path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
        return cls(
            daily_regulation=config.get("daily_regulation", "prior_day_only"),
            exclusion_policy=config.get("exclusion_policy", "conservative")
        )


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
        
        if isinstance(timezone, str):
            try:
                self.timezone = zoneinfo.ZoneInfo(timezone)
            except Exception as e:
                # Fallback to simple timezone parsing or timezone objects
                if timezone.upper() == "UTC":
                    self.timezone = timezone.utc
                else:
                    raise TemporalError(f"Invalid timezone: {timezone}") from e
        else:
            self.timezone = timezone

    def is_eligible(self, record: dict[str, Any]) -> bool:
        """Determines if a record satisfies the temporal cutoff and daily regulation policies."""
        source_ts = record.get("source_timestamp")
        avail_ts = record.get("availability_timestamp")
        
        if not isinstance(source_ts, datetime) or not isinstance(avail_ts, datetime):
            raise TemporalError("Timestamps must be datetime objects")
            
        if source_ts.tzinfo is None or avail_ts.tzinfo is None:
            raise TemporalError("source_timestamp and availability_timestamp must be timezone-aware")

        # 1. Cutoff check: must be <= cutoff
        if avail_ts > self.cutoff:
            return False

        # 2. Daily regulation check: prior-day-only
        if self.policy.daily_regulation == "prior_day_only":
            avail_local_date = avail_ts.astimezone(self.timezone).date()
            cutoff_local_date = self.cutoff.astimezone(self.timezone).date()
            if avail_local_date >= cutoff_local_date:
                return False

        return True


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
        source_ts = record.get("source_timestamp")
        avail_ts = record.get("availability_timestamp")
        
        # Check naive datetimes explicitly
        if not isinstance(source_ts, datetime) or not isinstance(avail_ts, datetime):
            raise TemporalError("Timestamps must be datetime objects")
        if source_ts.tzinfo is None or avail_ts.tzinfo is None:
            raise TemporalError("Timestamps must be timezone-aware")
            
        # Check reason for exclusion
        if avail_ts > cutoff:
            exclusions.append({
                "record_id": record.get("id") or record.get("subject_id") or "unknown",
                "reason": "after_cutoff",
                "availability_timestamp": avail_ts.isoformat()
            })
            continue

        if policy.daily_regulation == "prior_day_only":
            avail_local_date = avail_ts.astimezone(context.timezone).date()
            cutoff_local_date = cutoff.astimezone(context.timezone).date()
            if avail_local_date >= cutoff_local_date:
                exclusions.append({
                    "record_id": record.get("id") or record.get("subject_id") or "unknown",
                    "reason": "same_day_regulation",
                    "availability_timestamp": avail_ts.isoformat()
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

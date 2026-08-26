from datetime import datetime, tzinfo
import statistics
import zoneinfo
from typing import Any

from engine.temporal import AvailabilityPolicy, filter_records


class BaselineSnapshot:
    """Represents a computed baseline snapshot for a subject as of a specific timezone-aware cutoff."""
    def __init__(
        self,
        subject_id: str,
        as_of: datetime,
        modality_baselines: dict[str, float],
        maturity: int
    ) -> None:
        self.subject_id = subject_id
        self.as_of = as_of
        self.modality_baselines = modality_baselines
        self.maturity = maturity


def build_baseline(
    records: list[dict[str, Any]],
    cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str | tzinfo | zoneinfo.ZoneInfo = "UTC"
) -> BaselineSnapshot:
    """
    Computes a baseline snapshot for a subject by calculating the median of historical modalities.
    Only records that are eligible under the temporal policy are included.
    """
    pol = policy or AvailabilityPolicy()
    eligible_records, _ = filter_records(records, cutoff, pol, timezone=timezone)
    
    # Extract subject ID if available
    subject_id = "unknown"
    if eligible_records:
        subject_id = eligible_records[0].get("subject_id") or eligible_records[0].get("id") or "unknown"
        
    # Dynamically find numeric modalities in the records
    modalities: dict[str, list[float]] = {}
    ignored_keys = {"source_timestamp", "availability_timestamp", "id", "subject_id"}
    
    for record in eligible_records:
        for key, value in record.items():
            if key in ignored_keys:
                continue
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                modalities.setdefault(key, []).append(float(value))
                
    # Calculate median for each modality
    modality_baselines = {}
    for modality, values in modalities.items():
        if values:
            modality_baselines[modality] = statistics.median(values)
            
    return BaselineSnapshot(
        subject_id=subject_id,
        as_of=cutoff,
        modality_baselines=modality_baselines,
        maturity=len(eligible_records)
    )

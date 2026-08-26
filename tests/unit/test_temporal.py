from datetime import datetime, timezone, timedelta
import pytest
import zoneinfo

from engine.temporal import (
    TemporalContext,
    AvailabilityPolicy,
    filter_records,
    TemporalError
)


def test_aware_timestamps_requirement() -> None:
    # Test case 1: Naive cutoff must raise TemporalError
    naive_cutoff = datetime(2026, 8, 26, 12, 0, 0)
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    
    with pytest.raises(TemporalError, match="cutoff must be timezone-aware"):
        TemporalContext(cutoff=naive_cutoff, policy=policy)

    # Test case 2: Aware cutoff must not raise
    aware_cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    ctx = TemporalContext(cutoff=aware_cutoff, policy=policy)
    assert ctx.cutoff == aware_cutoff


def test_naive_timestamp_rejection() -> None:
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    context = TemporalContext(
        cutoff=datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc),
        policy=policy
    )
    
    # Test case 1: Record with naive source_timestamp
    record_naive_source = {
        "source_timestamp": datetime(2026, 8, 25, 12, 0, 0),
        "availability_timestamp": datetime(2026, 8, 25, 12, 0, 0, tzinfo=timezone.utc),
        "value": 42
    }
    with pytest.raises(TemporalError, match="naive|timezone-aware"):
        context.is_eligible(record_naive_source)
        
    # Test case 2: Record with naive availability_timestamp
    record_naive_avail = {
        "source_timestamp": datetime(2026, 8, 25, 12, 0, 0, tzinfo=timezone.utc),
        "availability_timestamp": datetime(2026, 8, 25, 12, 0, 0),
        "value": 42
    }
    with pytest.raises(TemporalError, match="naive|timezone-aware"):
        context.is_eligible(record_naive_avail)


def test_cutoff_equality_and_future_exclusion() -> None:
    policy = AvailabilityPolicy(daily_regulation="none", exclusion_policy="conservative")
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    context = TemporalContext(cutoff=cutoff, policy=policy, timezone="UTC")

    # Test case 1: Record exactly at cutoff is eligible
    record_at_cutoff = {
        "source_timestamp": datetime(2026, 8, 25, 12, 0, 0, tzinfo=timezone.utc),
        "availability_timestamp": cutoff,
        "value": 1
    }
    assert context.is_eligible(record_at_cutoff) is True

    # Test case 2: Record after cutoff is excluded
    record_after_cutoff = {
        "source_timestamp": datetime(2026, 8, 25, 12, 0, 0, tzinfo=timezone.utc),
        "availability_timestamp": cutoff + timedelta(seconds=1),
        "value": 2
    }
    assert context.is_eligible(record_after_cutoff) is False


def test_daily_regulation_prior_day_only() -> None:
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    
    # Test case 1: UTC timezone. Prior day record vs Same day record.
    context_utc = TemporalContext(cutoff=cutoff, policy=policy, timezone="UTC")
    
    record_prior_utc = {
        "source_timestamp": datetime(2026, 8, 25, 23, 59, 59, tzinfo=timezone.utc),
        "availability_timestamp": datetime(2026, 8, 25, 23, 59, 59, tzinfo=timezone.utc),
        "value": 10
    }
    record_same_utc = {
        "source_timestamp": datetime(2026, 8, 26, 0, 0, 0, tzinfo=timezone.utc),
        "availability_timestamp": datetime(2026, 8, 26, 0, 0, 0, tzinfo=timezone.utc),
        "value": 20
    }
    
    assert context_utc.is_eligible(record_prior_utc) is True
    assert context_utc.is_eligible(record_same_utc) is False

    # Test case 2: America/New_York timezone (UTC-4).
    # Cutoff is 2026-08-26 12:00:00 UTC (which is 2026-08-26 08:00:00 EDT).
    # Same-day local cutoff date: 2026-08-26.
    # An availability timestamp of 2026-08-26 01:00:00 UTC is 2026-08-25 21:00:00 EDT (prior day local).
    # Therefore, it MUST be eligible under America/New_York, even though it shares UTC calendar day.
    context_ny = TemporalContext(cutoff=cutoff, policy=policy, timezone="America/New_York")
    record_timezone_shift = {
        "source_timestamp": datetime(2026, 8, 26, 1, 0, 0, tzinfo=timezone.utc),
        "availability_timestamp": datetime(2026, 8, 26, 1, 0, 0, tzinfo=timezone.utc),
        "value": 30
    }
    assert context_ny.is_eligible(record_timezone_shift) is True


def test_conservative_exclusion_policy_with_provenance() -> None:
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    cutoff = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    
    records = [
        # Test case 1: Eligible prior day
        {
            "id": "rec1",
            "source_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "value": 1
        },
        # Test case 2: Excluded same day
        {
            "id": "rec2",
            "source_timestamp": datetime(2026, 8, 26, 2, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 26, 2, 0, 0, tzinfo=timezone.utc),
            "value": 2
        },
        # Test case 3: Excluded future
        {
            "id": "rec3",
            "source_timestamp": datetime(2026, 8, 25, 10, 0, 0, tzinfo=timezone.utc),
            "availability_timestamp": datetime(2026, 8, 26, 13, 0, 0, tzinfo=timezone.utc),
            "value": 3
        }
    ]
    
    eligible, provenance = filter_records(records, cutoff, policy, timezone="UTC")
    
    assert len(eligible) == 1
    assert eligible[0]["id"] == "rec1"
    assert provenance["excluded_count"] == 2
    
    reasons = [e["reason"] for e in provenance["exclusions"]]
    assert "same_day_regulation" in reasons
    assert "after_cutoff" in reasons

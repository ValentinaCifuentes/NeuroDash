from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.app.schemas import ActorContext, ApiErrorEnvelope, CareWriteV2


def valid_write(**overrides: object) -> dict[str, object]:
    fixture = Path("tests/fixtures/v2-care-write.json")
    payload: dict[str, object] = json.loads(fixture.read_text(encoding="utf-8"))
    payload.update(overrides)
    return payload


def test_care_write_v2_preserves_aware_timestamp_and_provenance() -> None:
    write = CareWriteV2.model_validate(valid_write())

    assert write.occurred_at == datetime(2026, 8, 26, 12, tzinfo=timezone.utc)
    assert write.provenance.source == "caregiver"
    assert write.provenance.synthetic is False


def test_care_write_v2_rejects_naive_timestamp_before_any_persistence() -> None:
    with pytest.raises(ValidationError, match="timezone-aware"):
        CareWriteV2.model_validate(valid_write(occurred_at="2026-08-26T12:00:00"))


def test_error_envelope_and_actor_context_have_stable_public_shape() -> None:
    error = ApiErrorEnvelope(code="invalid_timestamp", message="Use an aware timestamp.", details={"occurred_at": "timezone-aware"})
    actor = ActorContext(actor_id="tutor-001", role="tutor")

    assert error.model_dump(exclude_none=True) == {
        "code": "invalid_timestamp",
        "message": "Use an aware timestamp.",
        "details": {"occurred_at": "timezone-aware"},
    }
    assert actor.role == "tutor"

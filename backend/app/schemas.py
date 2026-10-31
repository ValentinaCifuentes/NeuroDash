from datetime import datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from engine.schemas import CONTRACT_VERSION, ConfidenceLevel


CARE_CONTRACT_VERSION = "2.0"


class ApiErrorEnvelope(BaseModel):
    code: str
    message: str
    details: dict[str, str] | None = None


class ActorContext(BaseModel):
    actor_id: str
    role: Literal["tutor", "system"]


class ProvenanceV2(BaseModel):
    source: str
    synthetic: bool


class CareWriteV2(BaseModel):
    contract_version: Literal["2.0"] = CARE_CONTRACT_VERSION
    subject_id: str = Field(min_length=1)
    occurred_at: datetime
    idempotency_key: str = Field(min_length=1)
    provenance: ProvenanceV2

    @field_validator("occurred_at")
    @classmethod
    def require_aware_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("occurred_at must be timezone-aware")
        return value


class PredictionContractV2(BaseModel):
    contract_version: Literal["2"] = CONTRACT_VERSION
    prediction_id: str = Field(default_factory=lambda: uuid4().hex)
    subject_id: str
    prediction_cutoff: datetime
    horizon_hours: int
    risk: str | None
    confidence: ConfidenceLevel
    abstained: bool
    factors: list[dict[str, Any]]
    missingness: list[dict[str, Any]]
    supports: list[dict[str, Any]]
    provenance: dict[str, Any]
    versions: dict[str, str]

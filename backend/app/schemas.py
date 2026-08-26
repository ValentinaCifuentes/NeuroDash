from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from engine.schemas import CONTRACT_VERSION, ConfidenceLevel


class PredictionContractV2(BaseModel):
    contract_version: Literal["2"] = CONTRACT_VERSION
    subject_id: str
    prediction_cutoff: datetime
    horizon_hours: int
    risk: str | None
    model_score: float | None = Field(default=None, description="Non-clinical technical metadata.")
    confidence: ConfidenceLevel
    abstained: bool
    factors: list[dict[str, Any]]
    missingness: list[dict[str, Any]]
    supports: list[dict[str, Any]]
    provenance: dict[str, Any]
    versions: dict[str, str]

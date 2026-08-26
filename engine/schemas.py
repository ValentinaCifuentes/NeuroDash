from enum import StrEnum


CONTRACT_VERSION = "2"


class ConfidenceLevel(StrEnum):
    INSUFFICIENT = "INSUFFICIENT"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

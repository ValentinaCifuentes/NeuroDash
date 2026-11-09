from enum import StrEnum


CONTRACT_VERSION = "2"

# Horizonte de predicción en horas. El modelo aprende a anticipar una crisis
# moderate/severe dentro de esta ventana posterior al corte de predicción.
# Anticipar con >= 8 h es el objetivo del producto; 24 h es inviable con la
# señal disponible (ver docs/plan-conexion-datos-modelo.md, sección "Riesgos").
HORIZON_HOURS = 8

# Tipo de evento y resultado que el motor cuenta como desregulación (hojas de registro).
DYSREGULATION_EVENT_TYPE = "Desregulación Emocional"
UNRESOLVED_OUTCOME = "Sin Regulación"


class ConfidenceLevel(StrEnum):
    INSUFFICIENT = "INSUFFICIENT"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

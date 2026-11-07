from datetime import datetime, date, timedelta, timezone, tzinfo
import zoneinfo
from typing import Any

from engine.temporal import AvailabilityPolicy, filter_records
from engine.baseline import BaselineSnapshot
from engine.schemas import HORIZON_HOURS


# Expectativas de un evento planificado que anticipan una crisis en el horizonte.
STRESSFUL_EXPECTATIONS = {"Estresante", "Desagradable"}

# Campos donde la ausencia es informativa y merece el indicador binario `*_missing`:
# «No Aplica»/«No sé» y las escalas de eventos que no se registran todos los días.
# El resto (sueño, despertar, conteos) se asume presente; no se les agrega el flag
# para no inflar el vector de features con indicadores siempre en 0.
MISSING_INDICATOR_FIELDS = {
    "medication_taken",
    "sleep_hours",
    "transition_difficulty",
    "feeding_difficulty",
    "sensory_diet_done",
    "early_signs_count",
    "physical_discomfort",
    "routine_change",
    "school_attendance",
}


class FeatureSet:
    """Represents a set of calculated features and missingness metadata for a subject."""
    def __init__(
        self,
        rolling_features: dict[str, float | None],
        missingness: list[dict[str, Any]],
        sensory_context: dict[str, Any],
        baseline_maturity: int
    ) -> None:
        self.rolling_features = rolling_features
        self.missingness = missingness
        self.sensory_context = sensory_context
        self.baseline_maturity = baseline_maturity


def get_local_date(dt: datetime, tz: tzinfo) -> date:
    """Converts a timezone-aware datetime to a date in the target timezone."""
    return dt.astimezone(tz).date()


def get_records_in_window(
    records: list[dict[str, Any]],
    cutoff: datetime,
    window_days: int,
    tz: tzinfo
) -> list[dict[str, Any]]:
    """
    Returns records that fall within the rolling window of size `window_days`
    relative to the prior day of the cutoff date in the given timezone.
    """
    cutoff_local_date = get_local_date(cutoff, tz)
    prior_day = cutoff_local_date - timedelta(days=1)
    start_day = prior_day - timedelta(days=window_days - 1)
    
    matching_records = []
    for record in records:
        avail_ts = record["availability_timestamp"]
        avail_date = get_local_date(avail_ts, tz)
        if start_day <= avail_date <= prior_day:
            matching_records.append(record)
            
    return matching_records


def build_features(
    records: list[dict[str, Any]],
    baseline: BaselineSnapshot,
    cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str | tzinfo | zoneinfo.ZoneInfo = "UTC",
    subject: dict[str, Any] | None = None,
    planned_events: list[dict[str, Any]] | None = None
) -> FeatureSet:
    """
    Builds a FeatureSet for a subject as of a specific cutoff.
    Aggregates numeric fields over 1, 3, 7, and 14 days windows, computes deltas against
    the baseline median, records missingness, and captures sensory context.

    `planned_events` añade la variable `planned_stressful_event_8h` (0/1): si hay un
    evento planificado «Estresante»/«Desagradable» en el horizonte siguiente al corte.
    No hay fuga de información: el evento se conoce antes del corte.
    """
    pol = policy or AvailabilityPolicy()
    eligible_records, _ = filter_records(records, cutoff, pol, timezone=timezone)
    
    # Resolve timezone object
    if isinstance(timezone, str):
        tz = zoneinfo.ZoneInfo(timezone)
    else:
        tz = timezone
        
    # Get subject metadata
    subject_data = subject or {}
    sensory_context = subject_data.get("sensory_context", {})
    
    # Identify modalities to aggregate
    # We include fields from baseline modalities, plus any numeric fields found in eligible records
    modalities = set(baseline.modality_baselines.keys())
    ignored_keys = {"source_timestamp", "availability_timestamp", "id", "subject_id"}
    for record in eligible_records:
        for key, value in record.items():
            if key not in ignored_keys and isinstance(value, (int, float)) and not isinstance(value, bool):
                modalities.add(key)
                
    # Also default to wake_state if not present to ensure tests can verify missingness representation
    modalities.add("wake_state")
    # Se recorren en orden (`sorted`): un `set` cambia de orden entre procesos, y la
    # misma entrada debe dar siempre la misma respuesta (missingness incluida).
    
    rolling_features: dict[str, float | None] = {}
    missingness: list[dict[str, Any]] = []
    windows = [1, 3, 7, 14]
    
    # Calculate rolling feature aggregates and track missingness
    for window in windows:
        window_records = get_records_in_window(eligible_records, cutoff, window, tz)
        
        # Count records in this window
        rolling_features[f"record_count_{window}d"] = float(len(window_records))
        
        for modality in sorted(modalities):
            values = [
                float(r[modality])
                for r in window_records
                if modality in r and isinstance(r[modality], (int, float)) and not isinstance(r[modality], bool)
            ]
            
            feat_name = f"{modality}_mean_{window}d"
            missing_feat = f"{modality}_missing_{window}d"
            if values:
                rolling_features[feat_name] = sum(values) / len(values)
                # Indicador binario de faltante, solo para campos opcionales: así el
                # modelo distingue un valor real (p. ej. "0 eventos" o "No") de un
                # dato ausente ("No Aplica", "No sé" o sin registro).
                if modality in MISSING_INDICATOR_FIELDS:
                    rolling_features[missing_feat] = 0.0
                missingness.append({
                    "window": window,
                    "field": modality,
                    "missing": False
                })
            else:
                # Rellena el agregado faltante con la línea base del infante en lugar
                # de dejarlo en None (que el entrenador imputa a 0). Así "sin datos"
                # no se confunde con un valor real (p. ej. "0 eventos"). Solo cae a
                # None en arranque en frío, cuando aún no hay línea base.
                rolling_features[feat_name] = baseline.modality_baselines.get(modality)
                if modality in MISSING_INDICATOR_FIELDS:
                    rolling_features[missing_feat] = 1.0
                missingness.append({
                    "window": window,
                    "field": modality,
                    "missing": True
                })
                
    # Compute delta features against baseline
    # Delta is: current value (most recent eligible record) minus baseline median
    sorted_records = sorted(eligible_records, key=lambda r: r["availability_timestamp"], reverse=True)
    most_recent_record = sorted_records[0] if sorted_records else None
    
    for modality in sorted(modalities):
        baseline_val = baseline.modality_baselines.get(modality)
        current_val = None
        if most_recent_record and modality in most_recent_record:
            val = most_recent_record[modality]
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                current_val = float(val)
                
        delta_name = f"{modality}_delta_baseline"
        if current_val is not None and baseline_val is not None:
            rolling_features[delta_name] = current_val - baseline_val
        else:
            rolling_features[delta_name] = None

    # Contexto al corte (no agregado por ventanas): evento planificado estresante.
    rolling_features["planned_stressful_event_8h"] = float(
        _planned_stressful_in_horizon(planned_events or [], cutoff, HORIZON_HOURS)
    )

    return FeatureSet(
        rolling_features=rolling_features,
        missingness=missingness,
        sensory_context=sensory_context,
        baseline_maturity=baseline.maturity
    )


def _planned_stressful_in_horizon(
    planned_events: list[dict[str, Any]],
    cutoff: datetime,
    horizon_hours: int,
) -> float:
    """1.0 si hay un evento planificado estresante en (cutoff, cutoff + horizon_hours]."""
    horizon_end = cutoff + timedelta(hours=horizon_hours)
    for event in planned_events:
        starts = event.get("starts_at")
        if not isinstance(starts, datetime):
            continue
        if starts.tzinfo is None:
            continue
        if cutoff < starts <= horizon_end and event.get("expectation") in STRESSFUL_EXPECTATIONS:
            return 1.0
    return 0.0

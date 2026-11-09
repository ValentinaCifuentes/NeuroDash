from datetime import datetime, date, timedelta, timezone, tzinfo
import zoneinfo
from typing import Any

from engine.temporal import AvailabilityPolicy, completed_days, filter_records, resolve_timezone
from engine.baseline import BaselineSnapshot
from engine.schemas import DYSREGULATION_EVENT_TYPE, HORIZON_HOURS, UNRESOLVED_OUTCOME


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


# Lo que se sabe del día en curso al momento de la estimación. Estado de la mañana
# (Mi Día): el último valor registrado hoy de cada campo, como `{campo}_today`.
# Los conteos del registro diario quedan fuera a propósito: se actualizan durante
# el día, así que lo de hoy se cuenta desde los eventos, cada uno con su hora.
TODAY_BASAL_FIELDS = (
    "sleep_quality",
    "wake_state",
    "start_autonomy_level",
    "medication_taken",
    "gi_level",
    "sleep_hours",
    "early_signs_count",
    "physical_discomfort",
    "routine_change",
    "school_attendance",
)
# Severidades que cuentan como crisis (las mismas de la etiqueta, `ml/dataset_builder.py › label_for_cutoff`).
CRISIS_SEVERITIES = ("moderate", "severe")
# Sin desregulaciones recientes, «horas desde la última» se topa en un día.
HOURS_SINCE_CAP = 24.0
# Momento del día de la estimación (hora local). La madrugada (0–6 h) es la referencia.
DAY_PERIODS = {"period_morning": (6, 12), "period_afternoon": (12, 18), "period_evening": (18, 24)}
TODAY_FEATURE_NAMES = (
    *(f"{field}_today" for field in TODAY_BASAL_FIELDS),
    "today_record_missing",
    "event_count_today",
    "dysregulation_count_today",
    "crisis_count_today",
    "max_intensity_today",
    "dysregulation_unresolved_today",
    "dysregulation_count_8h",
    "hours_since_dysregulation",
    *DAY_PERIODS,
)


class FeatureSet:
    """Represents a set of calculated features and missingness metadata for a subject."""
    def __init__(
        self,
        rolling_features: dict[str, float | None],
        missingness: list[dict[str, Any]],
        sensory_context: dict[str, Any],
        baseline_maturity: int,
        today_imputed: list[str] | None = None
    ) -> None:
        self.rolling_features = rolling_features
        self.missingness = missingness
        self.sensory_context = sensory_context
        self.baseline_maturity = baseline_maturity
        # Variables de hoy rellenadas con la línea base (no se registraron): la
        # explicación no las compara con lo habitual.
        self.today_imputed = today_imputed or []


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

    Cada registro cae en el día en que ocurrió (no en el que quedó disponible): el
    cierre del día de ayer, disponible desde la medianoche, sigue siendo de ayer.
    """
    cutoff_local_date = get_local_date(cutoff, tz)
    prior_day = cutoff_local_date - timedelta(days=1)
    start_day = prior_day - timedelta(days=window_days - 1)
    
    matching_records = []
    for record in records:
        source_date = get_local_date(record["source_timestamp"], tz)
        if start_day <= source_date <= prior_day:
            matching_records.append(record)
            
    return matching_records


def build_features(
    records: list[dict[str, Any]],
    baseline: BaselineSnapshot,
    cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str | tzinfo | zoneinfo.ZoneInfo = "UTC",
    subject: dict[str, Any] | None = None,
    planned_events: list[dict[str, Any]] | None = None,
    occurrences: list[dict[str, Any]] | None = None
) -> FeatureSet:
    """
    Builds a FeatureSet for a subject as of a specific cutoff.
    Aggregates numeric fields over 1, 3, 7, and 14 days windows, computes deltas against
    the baseline median, records missingness, and captures sensory context.

    Con la regla `intraday` suma lo que se sabe del día en curso (`_today_features`):
    el estado de la mañana, los eventos hasta el corte (`occurrences`, de las que solo
    se usan las disponibles al corte) y el momento del día.

    `planned_events` añade la variable `planned_stressful_event_8h` (0/1): si hay un
    evento planificado «Estresante»/«Desagradable» en el horizonte siguiente al corte.
    No hay fuga de información: el evento se conoce antes del corte.
    """
    pol = policy or AvailabilityPolicy()
    eligible_records, _ = filter_records(records, cutoff, pol, timezone=timezone)
    tz = resolve_timezone(timezone)
    # El historial (ventanas, deltas y campos a recorrer) se arma con días completos.
    # Con la regla `intraday` lo de hoy también es elegible, pero todavía no se usa.
    history_records = completed_days(eligible_records, cutoff, tz)
        
    # Get subject metadata
    subject_data = subject or {}
    sensory_context = subject_data.get("sensory_context", {})
    
    # Identify modalities to aggregate
    # We include fields from baseline modalities, plus any numeric fields found in eligible records
    modalities = set(baseline.modality_baselines.keys())
    ignored_keys = {"source_timestamp", "availability_timestamp", "id", "subject_id"}
    for record in history_records:
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
        window_records = get_records_in_window(history_records, cutoff, window, tz)
        
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
    # Delta is: current value (most recent eligible record that has it) minus baseline
    # median. Un día tiene varios registros (Mi Día por partes, el cierre): el último
    # registro puede no traer el campo, y eso no lo vuelve un faltante.
    sorted_records = sorted(history_records, key=lambda r: r["availability_timestamp"], reverse=True)
    
    for modality in sorted(modalities):
        baseline_val = baseline.modality_baselines.get(modality)
        current_val = None
        for record in sorted_records:
            val = record.get(modality)
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                current_val = float(val)
                break
                
        delta_name = f"{modality}_delta_baseline"
        if current_val is not None and baseline_val is not None:
            rolling_features[delta_name] = current_val - baseline_val
        else:
            rolling_features[delta_name] = None

    today_features, today_imputed = _today_features(
        eligible_records, occurrences or [], baseline, cutoff, pol, tz
    )
    rolling_features.update(today_features)

    # Contexto al corte (no agregado por ventanas): evento planificado estresante.
    rolling_features["planned_stressful_event_8h"] = float(
        _planned_stressful_in_horizon(planned_events or [], cutoff, HORIZON_HOURS)
    )

    return FeatureSet(
        rolling_features=rolling_features,
        missingness=missingness,
        sensory_context=sensory_context,
        baseline_maturity=baseline.maturity,
        today_imputed=today_imputed
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


def _today_features(
    eligible_records: list[dict[str, Any]],
    occurrences: list[dict[str, Any]],
    baseline: BaselineSnapshot,
    cutoff: datetime,
    policy: AvailabilityPolicy,
    tz: tzinfo,
) -> tuple[dict[str, float | None], list[str]]:
    """Variables del día en curso, con lo disponible hasta el corte, y cuáles se rellenaron.

    No entran a `missingness`: temprano en el día es normal que todavía no haya
    nada, y eso no debe bajar la confianza. `today_record_missing` le dice al
    modelo si ya hay registro de Mi Día.
    """
    today = cutoff.astimezone(tz).date()
    features: dict[str, float | None] = {}
    imputed: list[str] = []

    # 1. Estado de la mañana: el último valor de hoy de cada campo (Mi Día se puede
    #    guardar por partes). Sin dato, la línea base, como en las ventanas.
    today_records = sorted(
        (r for r in eligible_records if get_local_date(r["source_timestamp"], tz) == today),
        key=lambda r: r["availability_timestamp"],
    )
    seen_any = False
    for field in TODAY_BASAL_FIELDS:
        value = None
        for record in today_records:
            raw = record.get(field)
            if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                value = float(raw)
        seen_any = seen_any or value is not None
        if value is None:
            imputed.append(f"{field}_today")
        features[f"{field}_today"] = value if value is not None else baseline.modality_baselines.get(field)
    features["today_record_missing"] = 0.0 if seen_any else 1.0

    # 2. Eventos hasta el corte, cada uno con su hora (nunca los que llegan después).
    known, _ = filter_records(occurrences, cutoff, policy, timezone=tz)
    known = [o for o in known if o["source_timestamp"] <= cutoff]
    today_events = [o for o in known if get_local_date(o["source_timestamp"], tz) == today]
    dysregulations = [o for o in known if o.get("event_type") == DYSREGULATION_EVENT_TYPE]
    today_dysregulations = [o for o in today_events if o.get("event_type") == DYSREGULATION_EVENT_TYPE]
    intensities = [
        float(o["intensity_value"]) for o in today_events
        if isinstance(o.get("intensity_value"), (int, float)) and not isinstance(o.get("intensity_value"), bool)
    ]
    features["event_count_today"] = float(len(today_events))
    features["dysregulation_count_today"] = float(len(today_dysregulations))
    # Las crisis (moderadas o severas) van aparte: una leve avisa que el día escala,
    # una crisis que ya pasó es otra situación, y mezclarlas confunde al modelo.
    features["crisis_count_today"] = float(
        sum(1 for o in today_dysregulations if str(o.get("severity", "")).lower() in CRISIS_SEVERITIES)
    )
    features["max_intensity_today"] = max(intensities) if intensities else 0.0
    features["dysregulation_unresolved_today"] = float(
        sum(1 for o in today_dysregulations if o.get("strategy_outcome") == UNRESOLVED_OUTCOME)
    )
    recent_start = cutoff - timedelta(hours=HORIZON_HOURS)
    features["dysregulation_count_8h"] = float(
        sum(1 for o in dysregulations if o["source_timestamp"] > recent_start)
    )
    last = max((o["source_timestamp"] for o in dysregulations), default=None)
    hours_since = (cutoff - last).total_seconds() / 3600 if last is not None else HOURS_SINCE_CAP
    features["hours_since_dysregulation"] = min(hours_since, HOURS_SINCE_CAP)

    # 3. Momento del día: el riesgo de las próximas 8 horas no es el mismo a las 8 que a las 20.
    hour = cutoff.astimezone(tz).hour
    for name, (start, end) in DAY_PERIODS.items():
        features[name] = 1.0 if start <= hour < end else 0.0

    return features, imputed

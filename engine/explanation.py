import re
from typing import Any

from engine.features import TODAY_BASAL_FIELDS

FEATURE_DISPLAY_NAMES = {
    "sleep_quality_mean_1d": "calidad del sueño en el último día",
    "sleep_quality_mean_3d": "calidad del sueño en los últimos tres días",
    "sleep_quality_mean_7d": "calidad del sueño en los últimos siete días",
    "sleep_quality_mean_14d": "calidad del sueño en los últimos catorce días",
    "wake_state_mean_1d": "estado al despertar en el último día",
    "wake_state_mean_3d": "estado al despertar en los últimos tres días",
    "wake_state_mean_7d": "estado al despertar en los últimos siete días",
    "wake_state_mean_14d": "estado al despertar en los últimos catorce días",
    "event_count_mean_1d": "conteo de eventos en el último día",
    "event_count_mean_3d": "conteo de eventos en los últimos tres días",
    "event_count_mean_7d": "conteo de eventos en los últimos siete días",
    "event_count_mean_14d": "conteo de eventos en los últimos catorce días",
    "record_count_1d": "conteo de registros en el último día",
    "record_count_2d": "conteo de registros en los últimos dos días",
    "record_count_3d": "conteo de registros en los últimos tres días",
    "record_count_7d": "conteo de registros en los últimos siete días",
    "record_count_14d": "conteo de registros en los últimos catorce días",
    "sleep_quality_delta_baseline": "desviación de calidad del sueño frente a la línea base",
    "wake_state_delta_baseline": "desviación del estado al despertar frente a la línea base",
    "event_count_delta_baseline": "desviación del conteo de eventos frente a la línea base",
    "start_autonomy_level_mean_1d": "autonomía al inicio del día en el último día",
    "start_autonomy_level_mean_3d": "autonomía al inicio del día en los últimos tres días",
    "start_autonomy_level_mean_7d": "autonomía al inicio del día en los últimos siete días",
    "start_autonomy_level_mean_14d": "autonomía al inicio del día en los últimos catorce días",
    "start_autonomy_level_delta_baseline": "desviación de la autonomía al inicio del día frente a la línea base",
    "medication_taken_mean_1d": "toma de medicación en el último día",
    "medication_taken_mean_3d": "toma de medicación en los últimos tres días",
    "medication_taken_mean_7d": "toma de medicación en los últimos siete días",
    "medication_taken_mean_14d": "toma de medicación en los últimos catorce días",
    "medication_taken_delta_baseline": "desviación de la toma de medicación frente a la línea base",
    "gi_level_mean_1d": "nivel de digestión en el último día",
    "gi_level_mean_3d": "nivel de digestión en los últimos tres días",
    "gi_level_mean_7d": "nivel de digestión en los últimos siete días",
    "gi_level_mean_14d": "nivel de digestión en los últimos catorce días",
    "gi_level_delta_baseline": "desviación del nivel de digestión frente a la línea base",
    "day_regulation_level_num_mean_1d": "nivel de regulación del día en el último día",
    "day_regulation_level_num_mean_3d": "nivel de regulación del día en los últimos tres días",
    "day_regulation_level_num_mean_7d": "nivel de regulación del día en los últimos siete días",
    "day_regulation_level_num_mean_14d": "nivel de regulación del día en los últimos catorce días",
    "day_regulation_level_num_delta_baseline": "desviación del nivel de regulación del día frente a la línea base",
    "dysregulation_count_mean_1d": "conteo de desregulaciones en el último día",
    "dysregulation_count_mean_3d": "conteo de desregulaciones en los últimos tres días",
    "dysregulation_count_mean_7d": "conteo de desregulaciones en los últimos siete días",
    "dysregulation_count_mean_14d": "conteo de desregulaciones en los últimos catorce días",
    "dysregulation_count_delta_baseline": "desviación del conteo de desregulaciones frente a la línea base",
    "max_intensity_mean_1d": "intensidad máxima de eventos en el último día",
    "max_intensity_mean_3d": "intensidad máxima de eventos en los últimos tres días",
    "max_intensity_mean_7d": "intensidad máxima de eventos en los últimos siete días",
    "max_intensity_mean_14d": "intensidad máxima de eventos en los últimos catorce días",
    "max_intensity_delta_baseline": "desviación de la intensidad máxima de eventos frente a la línea base",
}

FEATURE_VARIABLE_NAMES = {
    "sleep_quality_mean_1d": "calidad_sueno_promedio_un_dia",
    "sleep_quality_mean_3d": "calidad_sueno_promedio_tres_dias",
    "sleep_quality_mean_7d": "calidad_sueno_promedio_siete_dias",
    "sleep_quality_mean_14d": "calidad_sueno_promedio_catorce_dias",
    "wake_state_mean_1d": "estado_despertar_promedio_un_dia",
    "wake_state_mean_3d": "estado_despertar_promedio_tres_dias",
    "wake_state_mean_7d": "estado_despertar_promedio_siete_dias",
    "wake_state_mean_14d": "estado_despertar_promedio_catorce_dias",
    "event_count_mean_1d": "conteo_eventos_promedio_un_dia",
    "event_count_mean_3d": "conteo_eventos_promedio_tres_dias",
    "event_count_mean_7d": "conteo_eventos_promedio_siete_dias",
    "event_count_mean_14d": "conteo_eventos_promedio_catorce_dias",
    "record_count_1d": "conteo_registros_un_dia",
    "record_count_2d": "conteo_registros_dos_dias",
    "record_count_3d": "conteo_registros_tres_dias",
    "record_count_7d": "conteo_registros_siete_dias",
    "record_count_14d": "conteo_registros_catorce_dias",
    "sleep_quality_delta_baseline": "desviacion_calidad_sueno_linea_base",
    "wake_state_delta_baseline": "desviacion_estado_despertar_linea_base",
    "event_count_delta_baseline": "desviacion_conteo_eventos_linea_base",
    "start_autonomy_level_mean_1d": "autonomia_inicio_dia_promedio_un_dia",
    "start_autonomy_level_mean_3d": "autonomia_inicio_dia_promedio_tres_dias",
    "start_autonomy_level_mean_7d": "autonomia_inicio_dia_promedio_siete_dias",
    "start_autonomy_level_mean_14d": "autonomia_inicio_dia_promedio_catorce_dias",
    "start_autonomy_level_delta_baseline": "desviacion_autonomia_inicio_dia_linea_base",
    "medication_taken_mean_1d": "medicacion_promedio_un_dia",
    "medication_taken_mean_3d": "medicacion_promedio_tres_dias",
    "medication_taken_mean_7d": "medicacion_promedio_siete_dias",
    "medication_taken_mean_14d": "medicacion_promedio_catorce_dias",
    "medication_taken_delta_baseline": "desviacion_medicacion_linea_base",
    "gi_level_mean_1d": "digestion_promedio_un_dia",
    "gi_level_mean_3d": "digestion_promedio_tres_dias",
    "gi_level_mean_7d": "digestion_promedio_siete_dias",
    "gi_level_mean_14d": "digestion_promedio_catorce_dias",
    "gi_level_delta_baseline": "desviacion_digestion_linea_base",
    "day_regulation_level_num_mean_1d": "regulacion_dia_promedio_un_dia",
    "day_regulation_level_num_mean_3d": "regulacion_dia_promedio_tres_dias",
    "day_regulation_level_num_mean_7d": "regulacion_dia_promedio_siete_dias",
    "day_regulation_level_num_mean_14d": "regulacion_dia_promedio_catorce_dias",
    "day_regulation_level_num_delta_baseline": "desviacion_regulacion_dia_linea_base",
    "dysregulation_count_mean_1d": "desregulaciones_promedio_un_dia",
    "dysregulation_count_mean_3d": "desregulaciones_promedio_tres_dias",
    "dysregulation_count_mean_7d": "desregulaciones_promedio_siete_dias",
    "dysregulation_count_mean_14d": "desregulaciones_promedio_catorce_dias",
    "dysregulation_count_delta_baseline": "desviacion_desregulaciones_linea_base",
    "max_intensity_mean_1d": "intensidad_maxima_promedio_un_dia",
    "max_intensity_mean_3d": "intensidad_maxima_promedio_tres_dias",
    "max_intensity_mean_7d": "intensidad_maxima_promedio_siete_dias",
    "max_intensity_mean_14d": "intensidad_maxima_promedio_catorce_dias",
    "max_intensity_delta_baseline": "desviacion_intensidad_maxima_linea_base",
}

# Contexto del día (plan de datos, Fase 3) y escalas de los eventos (Fase 2):
# mismas ventanas y desviación que el resto.
_CONTEXT_FAMILIES = {
    "sleep_hours": ("horas de sueño", "horas_sueno"),
    "early_signs_count": ("señales tempranas observadas", "senales_tempranas"),
    "physical_discomfort": ("malestar físico", "malestar_fisico"),
    "routine_change": ("cambios de rutina", "cambio_rutina"),
    "school_attendance": ("asistencia al colegio", "asistencia_colegio"),
    # Escalas de las hojas de registro (plan de datos, Fase 2.2).
    "transition_difficulty": ("dificultad en las transiciones", "dificultad_transiciones"),
    "feeding_difficulty": ("dificultad para alimentarse", "dificultad_alimentacion"),
    "sensory_diet_done": ("dieta sensorial realizada", "dieta_sensorial"),
    # Detalle de las hojas (disparadores, estrategias, resultado), agregado por día.
    "trigger_count": ("disparadores registrados", "disparadores"),
    "strategy_count": ("estrategias aplicadas", "estrategias"),
    "dysregulation_unresolved": ("desregulaciones sin regular", "desregulaciones_sin_regular"),
}
_WINDOW_WORDS = {
    1: ("en el último día", "un_dia"),
    3: ("en los últimos tres días", "tres_dias"),
    7: ("en los últimos siete días", "siete_dias"),
    14: ("en los últimos catorce días", "catorce_dias"),
}
for _field, (_name, _code) in _CONTEXT_FAMILIES.items():
    for _window, (_phrase, _suffix) in _WINDOW_WORDS.items():
        FEATURE_DISPLAY_NAMES[f"{_field}_mean_{_window}d"] = f"{_name} {_phrase}"
        FEATURE_VARIABLE_NAMES[f"{_field}_mean_{_window}d"] = f"{_code}_promedio_{_suffix}"
    FEATURE_DISPLAY_NAMES[f"{_field}_delta_baseline"] = f"desviación de {_name} frente a la línea base"
    FEATURE_VARIABLE_NAMES[f"{_field}_delta_baseline"] = f"desviacion_{_code}_linea_base"

# Feature de contexto al corte (no agregada por ventanas).
FEATURE_DISPLAY_NAMES["planned_stressful_event_8h"] = "evento planificado estresante en el horizonte"
FEATURE_VARIABLE_NAMES["planned_stressful_event_8h"] = "evento_planificado_estresante"

# Día en curso (`engine/features.py › _today_features`): estado de la mañana…
_TODAY_BASAL_NAMES = {
    "sleep_quality": ("calidad del sueño", "calidad_sueno"),
    "wake_state": ("estado al despertar", "estado_despertar"),
    "start_autonomy_level": ("autonomía al inicio del día", "autonomia_inicio_dia"),
    "medication_taken": ("toma de medicación", "medicacion"),
    "gi_level": ("nivel de digestión", "digestion"),
    **{field: _CONTEXT_FAMILIES[field] for field in ("sleep_hours", "early_signs_count", "physical_discomfort", "routine_change", "school_attendance")},
}
for _field in TODAY_BASAL_FIELDS:
    _name, _code = _TODAY_BASAL_NAMES[_field]
    FEATURE_DISPLAY_NAMES[f"{_field}_today"] = f"{_name} hoy"
    FEATURE_VARIABLE_NAMES[f"{_field}_today"] = f"{_code}_hoy"
# …lo que pasó hasta la hora de la estimación y el momento del día.
for _feature, (_name, _code) in {
    "today_record_missing": ("sin registro de Mi Día hoy", "sin_registro_hoy"),
    "event_count_today": ("eventos registrados hoy", "eventos_hoy"),
    "dysregulation_count_today": ("desregulaciones registradas hoy", "desregulaciones_hoy"),
    "crisis_count_today": ("crisis moderadas o intensas hoy", "crisis_hoy"),
    "max_intensity_today": ("intensidad máxima de eventos hoy", "intensidad_maxima_hoy"),
    "dysregulation_unresolved_today": ("desregulaciones sin regular hoy", "desregulaciones_sin_regular_hoy"),
    "dysregulation_count_8h": ("desregulaciones en las últimas ocho horas", "desregulaciones_ultimas_ocho_horas"),
    "hours_since_dysregulation": ("horas desde la última desregulación", "horas_desde_ultima_desregulacion"),
    "period_morning": ("estimación hecha en la mañana", "momento_manana"),
    "period_afternoon": ("estimación hecha en la tarde", "momento_tarde"),
    "period_evening": ("estimación hecha en la noche", "momento_noche"),
}.items():
    FEATURE_DISPLAY_NAMES[_feature] = _name
    FEATURE_VARIABLE_NAMES[_feature] = _code


# Comparación con el propio infante (P19). Para cada variable: cuánto tiene que
# alejarse de su línea base (la mediana de su historial) para contar como
# distinta, y cómo se dice en cada caso. Lo «más» de cada variable no siempre es
# peor: más calidad de sueño es mejor; más estado al despertar es más irritable.
BASELINE_PHRASES: dict[str, tuple[float, str, str, str]] = {
    # campo: (umbral, sobre la línea base, bajo la línea base, parecido)
    "sleep_quality": (1.0, "Durmió mejor que de costumbre", "Durmió peor que de costumbre", "Sueño como de costumbre"),
    "wake_state": (1.0, "Despertó más irritable que de costumbre", "Despertó más tranquilo que de costumbre", "Despertar como de costumbre"),
    "event_count": (1.0, "Más eventos que de costumbre", "Menos eventos que de costumbre", "Eventos como de costumbre"),
    "dysregulation_count": (0.5, "Más desregulaciones que de costumbre", "Menos desregulaciones que de costumbre", "Desregulaciones como de costumbre"),
    "max_intensity": (1.0, "Eventos más intensos que de costumbre", "Eventos menos intensos que de costumbre", "Intensidad como de costumbre"),
    "start_autonomy_level": (0.3, "Necesitó más ayuda para iniciar el día", "Inició el día con más autonomía", "Inicio del día como de costumbre"),
    "medication_taken": (0.2, "Tomó la medicación con más regularidad", "Tomó la medicación menos días que de costumbre", "Medicación como de costumbre"),
    "gi_level": (0.3, "Más molestias digestivas que de costumbre", "Menos molestias digestivas que de costumbre", "Digestión como de costumbre"),
    "day_regulation_level_num": (0.3, "Días menos regulados que de costumbre", "Días más regulados que de costumbre", "Regulación del día como de costumbre"),
    "sleep_hours": (0.5, "Durmió más horas que de costumbre", "Durmió menos horas que de costumbre", "Horas de sueño como de costumbre"),
    "early_signs_count": (0.5, "Más señales tempranas que de costumbre", "Menos señales tempranas que de costumbre", "Señales tempranas como de costumbre"),
    "physical_discomfort": (0.2, "Más malestar físico que de costumbre", "Menos malestar físico que de costumbre", "Malestar físico como de costumbre"),
    "routine_change": (0.2, "Más cambios de rutina que de costumbre", "Menos cambios de rutina que de costumbre", "Rutina como de costumbre"),
    "school_attendance": (0.2, "Asistió más al colegio que de costumbre", "Asistió menos al colegio que de costumbre", "Asistencia al colegio como de costumbre"),
    "transition_difficulty": (0.3, "Transiciones más difíciles que de costumbre", "Transiciones más fáciles que de costumbre", "Transiciones como de costumbre"),
    "feeding_difficulty": (0.3, "Comió con más dificultad que de costumbre", "Comió con menos dificultad que de costumbre", "Alimentación como de costumbre"),
    "sensory_diet_done": (0.2, "Hizo más dieta sensorial que de costumbre", "Hizo menos dieta sensorial que de costumbre", "Dieta sensorial como de costumbre"),
    "trigger_count": (0.5, "Más disparadores que de costumbre", "Menos disparadores que de costumbre", "Disparadores como de costumbre"),
    "strategy_count": (0.5, "Más estrategias aplicadas que de costumbre", "Menos estrategias aplicadas que de costumbre", "Estrategias como de costumbre"),
    "dysregulation_unresolved": (0.2, "Más desregulaciones sin regular que de costumbre", "Menos desregulaciones sin regular que de costumbre", "Desregulaciones sin regular como de costumbre"),
}
_LATEST_RECORD = "en su último registro"
_TODAY = "hoy"
# Variables donde «más» es mejor para el infante; en el resto, más es peor.
HIGHER_IS_BETTER = {"sleep_quality", "medication_taken", "sleep_hours", "school_attendance", "sensory_diet_done"}


def compare_with_baseline(
    feature: str,
    value: float | None,
    baselines: dict[str, float] | None,
) -> tuple[str | None, str | None, str | None]:
    """(comparación, tendencia, frase) frente a la línea base del infante.

    - comparación: «above» | «below» | «similar» (el número sube, baja o se mantiene);
    - tendencia: «worse» | «better» | «same» (qué significa eso para el infante:
      más irritable es peor, mejor sueño es mejor);
    - frase: «Despertó más irritable que de costumbre en los últimos tres días».

    `(None, None, None)` si la variable no tiene línea base (arranque en frío), si
    no hubo dato (no se compara un valor imputado) o si no es una variable del
    tutor (p. ej. `record_count_3d`).
    """
    none = (None, None, None)
    if value is None:
        return none
    if feature.endswith("_delta_baseline"):
        field, diff, when = feature[: -len("_delta_baseline")], value, _LATEST_RECORD
    elif feature.endswith("_today"):
        # Solo el estado de la mañana: un conteo de hoy está incompleto hasta que
        # termina el día y no se compara con días completos.
        field = feature[: -len("_today")]
        base = (baselines or {}).get(field)
        if field not in TODAY_BASAL_FIELDS or base is None:
            return none
        diff, when = value - base, _TODAY
    else:
        match = re.fullmatch(r"(.+)_mean_(\d+)d", feature)
        if not match or not baselines:
            return none
        field, window = match.group(1), int(match.group(2))
        base = baselines.get(field)
        if base is None or window not in _WINDOW_WORDS:
            return none
        diff, when = value - base, _WINDOW_WORDS[window][0]
    phrases = BASELINE_PHRASES.get(field)
    if phrases is None:
        return none
    step, above, below, similar = phrases
    better_when_higher = field in HIGHER_IS_BETTER
    if diff >= step:
        return "above", "better" if better_when_higher else "worse", f"{above} {when}"
    if diff <= -step:
        return "below", "worse" if better_when_higher else "better", f"{below} {when}"
    return "similar", "same", f"{similar} {when}"


NUMBER_WORDS = {
    "1": "un",
    "2": "dos",
    "3": "tres",
    "4": "cuatro",
    "5": "cinco",
    "6": "seis",
    "7": "siete",
    "8": "ocho",
    "9": "nueve",
    "10": "diez",
    "11": "once",
    "12": "doce",
    "13": "trece",
    "14": "catorce",
}


def _normalize_unknown_feature(feature: str) -> str:
    translated = (
        feature.replace("sleep", "sueño")
        .replace("quality", "calidad")
        .replace("wake", "despertar")
        .replace("state", "estado")
        .replace("mean", "promedio")
        .replace("delta", "desviacion")
        .replace("baseline", "linea_base")
        .replace("record", "registro")
        .replace("event", "evento")
        .replace("count", "conteo")
    )

    for number, word in NUMBER_WORDS.items():
        translated = translated.replace(f"_{number}d", f"_{word}_dias")

    return translated


def _sentence_case(text: str) -> str:
    """Mayúscula solo al inicio, como se escribe en español («Calidad del sueño…»)."""
    return text[:1].upper() + text[1:]

def generate_non_causal_factors(
    explanations: list[dict[str, Any]],
    baselines: dict[str, float] | None = None,
    observed: dict[str, float | None] | None = None,
) -> list[dict[str, Any]]:
    """
    Traduce contribuciones de variables crudas a explicaciones no causales en español.
    Evita lenguaje causal o diagnóstico.

    Con `baselines` (mediana por campo) y `observed` (las variables antes de
    imputar), cada factor dice además cómo está frente a lo habitual del propio
    infante (`comparison`, `summary`). Sin ellas, esos campos van en `None`.
    """
    factors = []
    for exp in explanations:
        feature = exp["feature"]
        contribution = exp.get("contribution", 0.0)
        value = exp.get("value", 0.0)
        
        display_name = FEATURE_DISPLAY_NAMES.get(feature, _normalize_unknown_feature(feature).replace("_", " "))
        variable_name = FEATURE_VARIABLE_NAMES.get(feature, _normalize_unknown_feature(feature))
        
        if contribution > 0:
            description = f"La variable reciente {display_name} ({value:.1f}) se asocia con un aumento en los patrones observados."
        elif contribution < 0:
            description = f"La variable reciente {display_name} ({value:.1f}) se asocia con una disminución en los patrones observados."
        else:
            description = f"La variable reciente {display_name} ({value:.1f}) no muestra una asociación activa con los patrones observados."
             
        actual = observed.get(feature) if observed is not None else value
        comparison, trend, summary = compare_with_baseline(feature, actual, baselines)

        factors.append({
            "factor_name": _sentence_case(display_name),
            "feature": variable_name,
            "contribution": float(contribution),
            "description": description,
            "comparison": comparison,
            "trend": trend,
            "summary": summary,
        })
        
    return factors

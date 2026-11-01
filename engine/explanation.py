from typing import Any

FEATURE_DISPLAY_NAMES = {
    "sleep_quality_mean_1d": "calidad del sueno en el ultimo dia",
    "sleep_quality_mean_3d": "calidad del sueno en los ultimos tres dias",
    "sleep_quality_mean_7d": "calidad del sueno en los ultimos siete dias",
    "sleep_quality_mean_14d": "calidad del sueno en los ultimos catorce dias",
    "wake_state_mean_1d": "estado al despertar en el ultimo dia",
    "wake_state_mean_3d": "estado al despertar en los ultimos tres dias",
    "wake_state_mean_7d": "estado al despertar en los ultimos siete dias",
    "wake_state_mean_14d": "estado al despertar en los ultimos catorce dias",
    "event_count_mean_1d": "conteo de eventos en el ultimo dia",
    "event_count_mean_3d": "conteo de eventos en los ultimos tres dias",
    "event_count_mean_7d": "conteo de eventos en los ultimos siete dias",
    "event_count_mean_14d": "conteo de eventos en los ultimos catorce dias",
    "record_count_1d": "conteo de registros en el ultimo dia",
    "record_count_2d": "conteo de registros en los ultimos dos dias",
    "record_count_3d": "conteo de registros en los ultimos tres dias",
    "record_count_7d": "conteo de registros en los ultimos siete dias",
    "record_count_14d": "conteo de registros en los ultimos catorce dias",
    "sleep_quality_delta_baseline": "desviacion de calidad del sueno frente a la linea base",
    "wake_state_delta_baseline": "desviacion del estado al despertar frente a la linea base",
    "event_count_delta_baseline": "desviacion del conteo de eventos frente a la linea base",
    "start_autonomy_level_mean_1d": "autonomia al inicio del dia en el ultimo dia",
    "start_autonomy_level_mean_3d": "autonomia al inicio del dia en los ultimos tres dias",
    "start_autonomy_level_mean_7d": "autonomia al inicio del dia en los ultimos siete dias",
    "start_autonomy_level_mean_14d": "autonomia al inicio del dia en los ultimos catorce dias",
    "start_autonomy_level_delta_baseline": "desviacion de la autonomia al inicio del dia frente a la linea base",
    "medication_taken_mean_1d": "toma de medicacion en el ultimo dia",
    "medication_taken_mean_3d": "toma de medicacion en los ultimos tres dias",
    "medication_taken_mean_7d": "toma de medicacion en los ultimos siete dias",
    "medication_taken_mean_14d": "toma de medicacion en los ultimos catorce dias",
    "medication_taken_delta_baseline": "desviacion de la toma de medicacion frente a la linea base",
    "gi_level_mean_1d": "nivel de digestion en el ultimo dia",
    "gi_level_mean_3d": "nivel de digestion en los ultimos tres dias",
    "gi_level_mean_7d": "nivel de digestion en los ultimos siete dias",
    "gi_level_mean_14d": "nivel de digestion en los ultimos catorce dias",
    "gi_level_delta_baseline": "desviacion del nivel de digestion frente a la linea base",
    "day_regulation_level_num_mean_1d": "nivel de regulacion del dia en el ultimo dia",
    "day_regulation_level_num_mean_3d": "nivel de regulacion del dia en los ultimos tres dias",
    "day_regulation_level_num_mean_7d": "nivel de regulacion del dia en los ultimos siete dias",
    "day_regulation_level_num_mean_14d": "nivel de regulacion del dia en los ultimos catorce dias",
    "day_regulation_level_num_delta_baseline": "desviacion del nivel de regulacion del dia frente a la linea base",
    "dysregulation_count_mean_1d": "conteo de desregulaciones en el ultimo dia",
    "dysregulation_count_mean_3d": "conteo de desregulaciones en los ultimos tres dias",
    "dysregulation_count_mean_7d": "conteo de desregulaciones en los ultimos siete dias",
    "dysregulation_count_mean_14d": "conteo de desregulaciones en los ultimos catorce dias",
    "dysregulation_count_delta_baseline": "desviacion del conteo de desregulaciones frente a la linea base",
    "max_intensity_mean_1d": "intensidad maxima de eventos en el ultimo dia",
    "max_intensity_mean_3d": "intensidad maxima de eventos en los ultimos tres dias",
    "max_intensity_mean_7d": "intensidad maxima de eventos en los ultimos siete dias",
    "max_intensity_mean_14d": "intensidad maxima de eventos en los ultimos catorce dias",
    "max_intensity_delta_baseline": "desviacion de la intensidad maxima de eventos frente a la linea base",
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


def _title_spanish(text: str) -> str:
    return " ".join(word.capitalize() for word in text.split())

def generate_non_causal_factors(
    explanations: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    Traduce contribuciones de variables crudas a explicaciones no causales en espanol.
    Evita lenguaje causal o diagnostico.
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
            description = f"La variable reciente {display_name} ({value:.1f}) se asocia con una disminucion en los patrones observados."
        else:
            description = f"La variable reciente {display_name} ({value:.1f}) no muestra una asociacion activa con los patrones observados."
             
        factors.append({
            "factor_name": _title_spanish(display_name),
            "feature": variable_name,
            "contribution": float(contribution),
            "description": description
        })
        
    return factors

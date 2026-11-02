from typing import Any

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
    explanations: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    Traduce contribuciones de variables crudas a explicaciones no causales en español.
    Evita lenguaje causal o diagnóstico.
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
             
        factors.append({
            "factor_name": _sentence_case(display_name),
            "feature": variable_name,
            "contribution": float(contribution),
            "description": description
        })
        
    return factors

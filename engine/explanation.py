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

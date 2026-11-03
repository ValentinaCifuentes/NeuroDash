from datetime import date, datetime, timezone as dt_timezone, timedelta
import json
import math
from pathlib import Path
import random
import zoneinfo
from typing import Any

from engine.temporal import AvailabilityPolicy, filter_records
from engine.baseline import build_baseline, BaselineSnapshot
from engine.features import build_features
from engine.schemas import HORIZON_HOURS


def build_training_example(
    records: list[dict[str, Any]],
    occurrences: list[dict[str, Any]],
    baseline: BaselineSnapshot,
    cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC",
    horizon_hours: int = HORIZON_HOURS
) -> tuple[dict[str, float | None], bool]:
    """
    Builds a training example (X, y) for a given timezone-aware cutoff T.
    X represents the rolling features as of cutoff T.
    y is True if there is a moderate or severe occurrence in the horizon (T, T + horizon_hours].
    """
    # 1. Build features as of cutoff T
    feat_set = build_features(
        records=records,
        baseline=baseline,
        cutoff=cutoff,
        policy=policy,
        timezone=timezone
    )
    
    # 2. Determine label y
    # Horizon is (cutoff, cutoff + horizon_hours]
    horizon_start = cutoff
    horizon_end = cutoff + timedelta(hours=horizon_hours)
    
    label = False
    if occurrences:
        for occ in occurrences:
            src_ts = occ.get("source_timestamp")
            if not isinstance(src_ts, datetime):
                continue
            
            # Occurrence must be strictly after cutoff and within the horizon
            if horizon_start < src_ts <= horizon_end:
                severity = str(occ.get("severity", "")).lower()
                if severity in ("moderate", "severe"):
                    label = True
                    break
                    
    return feat_set.rolling_features, label


def build_dataset(
    records: list[dict[str, Any]],
    occurrences: list[dict[str, Any]],
    cutoffs: list[datetime],
    split_cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC",
    subject_id: str = "unknown",
    horizon_hours: int = HORIZON_HOURS
) -> tuple[
    list[dict[str, float | None]],
    list[bool],
    list[dict[str, float | None]],
    list[bool],
    dict[str, Any]
]:
    """
    Builds and temporally splits training and validation examples.
    No lookahead: training examples only access records before split_cutoff.
    """
    pol = policy or AvailabilityPolicy()
    
    X_train: list[dict[str, float | None]] = []
    y_train: list[bool] = []
    X_test: list[dict[str, float | None]] = []
    y_test: list[bool] = []
    
    for cutoff in cutoffs:
        # Build baseline as of this cutoff
        baseline = build_baseline(records, cutoff, pol, timezone=timezone)
        
        # Build example
        X, y = build_training_example(
            records=records,
            occurrences=occurrences,
            baseline=baseline,
            cutoff=cutoff,
            policy=pol,
            timezone=timezone,
            horizon_hours=horizon_hours
        )
        
        if cutoff < split_cutoff:
            X_train.append(X)
            y_train.append(y)
        else:
            X_test.append(X)
            y_test.append(y)
            
    lineage = {
        "split_cutoff": split_cutoff.isoformat(),
        "subject_id": subject_id,
        "data_generation_timestamp": datetime.now(dt_timezone.utc).isoformat(),
        "horizon_hours": horizon_hours,
        "policy": {
            "daily_regulation": pol.daily_regulation,
            "exclusion_policy": pol.exclusion_policy
        }
    }
    
    return X_train, y_train, X_test, y_test, lineage


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _synthetic_raw(
    sleep_quality: float,
    wake_state: float,
    start_autonomy_level: int,
    medication_taken: int,
    gi_level: int,
    day_regulation_level_num: int,
) -> dict[str, str]:
    """Traduce los números sintéticos a la opción de la Bitácora más cercana.

    Los cortes están a medio camino entre los valores que codifica el backend
    (`routes/subjects.py`): sueño 8/5/2, despertar 2/5/8, el resto 0/1/2.
    """
    return {
        "sleep_quality": "Reparador" if sleep_quality >= 6.5
        else "Interrumpido" if sleep_quality >= 3.5
        else "Dificultad de Conciliación",
        "wake_mode": "Tranquilo/Alegre" if wake_state <= 3.5
        else "Cansado/Con Sueño" if wake_state <= 6.5
        else "Irritable/Llorando",
        "start_autonomy": ["Por sí solo", "Con alarma", "Con insistencia"][start_autonomy_level],
        "medication_adherence": "Sí" if medication_taken else "No",
        "gi_status": ["Normal", "Estreñimiento", "Diarrea"][gi_level],
        "day_regulation_level": ["Excelente", "Estable con Apoyo", "Desregulación Frecuente"][day_regulation_level_num],
    }


def generate_synthetic_history(
    subject_id: str,
    days: int,
    seed: int,
    timezone: str = "UTC",
    end_date: date | None = None,
) -> dict[str, Any]:
    """
    Generates a deterministic synthetic history of daily records and occurrence events.

    The data is driven by a hidden "dysregulation load" (an autocorrelated process in
    [0, 1]): every numeric feature is a noisy function of that load, and the probability
    of a moderate/severe crisis later that day is a logistic function of the same load.
    Because the load is persistent across days, *past* records are genuinely predictive
    of *today's* crisis, so the model has real signal to learn (it beats a naive baseline).

    `end_date` fija el día del último registro (las demos usan «ayer», para que el
    historial sea reciente cuando se muestran). Sin ella, el historial empieza el
    2026-08-01. La secuencia de valores depende solo de `seed` y `days`, no de las fechas.
    """
    rng = random.Random(seed)

    tz = zoneinfo.ZoneInfo(timezone)
    if end_date is None:
        start_date = datetime(2026, 8, 1, 12, 0, 0, tzinfo=tz)
    else:
        first_day = end_date - timedelta(days=days - 1)
        start_date = datetime(first_day.year, first_day.month, first_day.day, 12, 0, 0, tzinfo=tz)

    records: list[dict[str, Any]] = []
    occurrences: list[dict[str, Any]] = []

    load = 0.5  # latent dysregulation load in [0, 1]

    for d in range(days):
        current_time = start_date + timedelta(days=d)

        # 1. Evolve latent load: strongly autocorrelated (persistent) around 0.5.
        #    A high load today makes a high load tomorrow likely, which is what lets
        #    past features anticipate a future crisis.
        load = _clip(0.5 + 0.85 * (load - 0.5) + 0.20 * rng.gauss(0.0, 1.0), 0.0, 1.0)

        # 2. Numeric features as noisy functions of load (higher load -> worse state).
        #    Noise is deliberately small so the load signal dominates.
        sleep_quality = round(_clip(10.0 - 5.5 * load + 0.35 * rng.gauss(0.0, 1.0), 4.0, 10.0), 2)
        wake_state = round(_clip(2.0 + 6.5 * load + 0.35 * rng.gauss(0.0, 1.0), 2.0, 9.0), 2)
        event_count = max(0, int(round(6.0 * load + 0.5 * rng.gauss(0.0, 1.0))))
        dysregulation_count = min(
            event_count,
            max(0, int(round(3.0 * load + 0.3 * rng.gauss(0.0, 1.0))))
        )
        max_intensity = int(_clip(round(1.0 + 9.0 * load + 0.5 * rng.gauss(0.0, 1.0)), 1, 10))
        start_autonomy_level = int(_clip(round(2.0 * load + 0.3 * rng.gauss(0.0, 1.0)), 0, 2))
        medication_taken = 1 if rng.random() > 0.30 * load else 0
        gi_level = int(_clip(round(2.0 * load + 0.3 * rng.gauss(0.0, 1.0)), 0, 2))
        day_regulation_level_num = int(_clip(round(2.0 * load + 0.3 * rng.gauss(0.0, 1.0)), 0, 2))

        record = {
            "id": f"rec_{subject_id}_{d}",
            "subject_id": subject_id,
            "source_timestamp": current_time,
            "availability_timestamp": current_time,
            "sleep_quality": sleep_quality,
            "wake_state": wake_state,
            "event_count": event_count,
            "dysregulation_count": dysregulation_count,
            "max_intensity": max_intensity,
            "start_autonomy_level": start_autonomy_level,
            "medication_taken": medication_taken,
            "gi_level": gi_level,
            "day_regulation_level_num": day_regulation_level_num,
            # Textos de la Bitácora, como los guarda la app (`raw`): la interfaz
            # los muestra en el historial y el calendario. El motor no los usa.
            "raw": _synthetic_raw(
                sleep_quality, wake_state, start_autonomy_level, medication_taken, gi_level, day_regulation_level_num
            ),
        }
        records.append(record)

        # 3. Crisis occurrence (moderate/severe) later that day, driven by the load.
        #    Occurrences fall within the 8h horizon after the noon cutoff (13:00–20:00).
        #    Steep logistic keeps the base rate realistic (~15–20%) while remaining
        #    strongly dependent on the load.
        p_crisis = 1.0 / (1.0 + math.exp(-8.0 * (load - 0.7)))
        if rng.random() < p_crisis:
            occ_hour = rng.randint(1, 8)
            occ_time = current_time + timedelta(hours=occ_hour)
            avail_time = occ_time + timedelta(hours=2)  # 2 hours notification delay
            severity = "severe" if load > 0.72 else "moderate"
            intensity_value = int(_clip(round(1.0 + 9.0 * load + rng.gauss(0.0, 0.8)), 1, 10))

            occurrence = {
                "id": f"occ_{subject_id}_{d}",
                "subject_id": subject_id,
                "source_timestamp": occ_time,
                "availability_timestamp": avail_time,
                "severity": severity,
                "event_type": "Desregulación Emocional",
                "intensity_value": intensity_value,
            }
            occurrences.append(occurrence)

    lineage = {
        "seed": seed,
        "generator_name": "synthetic_history_generator",
        "generator_version": "2.0-load-driven",
        "data_generation_timestamp": datetime.now(dt_timezone.utc).isoformat()
    }

    return {
        "records": records,
        "occurrences": occurrences,
        "lineage": lineage
    }


# Actor fijo del frontend (`VITE_ACTOR_ID` por defecto). Va en `authorized_tutor_ids`
# de los perfiles demo para que la demo pueda confirmar resultados.
DEMO_TUTOR_ID = "tutor-demo"


# Perfiles de las demos (P16, P20, P26). Única fuente: la usa
# `scripts/generate_mock_histories.py`. Mismo formato que el perfil inicial en
# 3 pasos del front (plan de datos §6.1), en español y en la zona de Chile.
# El perfil no cambia la estimación (el motor no lo lee como variable); sí
# cambia los apoyos de «Qué puedo hacer ahora» y lo que muestra la Ficha.
DEMO_TIMEZONE = "America/Santiago"

DEMO_PROFILES: dict[str, dict[str, Any]] = {
    # Riesgo elevado: hipersensible a sonidos, luces y tacto.
    "PAC-A": {
        "habitual_context": {
            "age_range": "6 a 8 años",
            "neurodivergence": "TEA",
            "support_level": "Nivel 2",
            "communication": ["Frases cortas", "Usa pictogramas o tablet"],
            "dysregulation_frequency": "Varias veces por semana",
            "early_signs": ["Se tapa los oídos", "Se aísla", "Más irritable"],
            "triggers": ["Ruido", "Lugares con mucha gente", "Transiciones"],
            "risk_times": ["Salida del colegio", "Tarde"],
        },
        "sensory_context": {
            "sensory_profile": "Hipersensible",
            "auditory": 1,
            "visual": 1,
            "tactile": 1,
            "gustatory": 0,
            "vestibular": 0,
        },
        "historical_supports": [
            {"id": "sup_a_1", "description": "Manta con peso en la tarde", "type": "historical", "effective": True},
            {"id": "sup_a_2", "description": "Audífonos con cancelación de ruido", "type": "historical", "effective": True},
        ],
    },
    # Riesgo bajo: hiposensible, busca movimiento y presión.
    "PAC-B": {
        "habitual_context": {
            "age_range": "9 a 12 años",
            "neurodivergence": "TDAH",
            "support_level": "Nivel 1",
            "communication": ["Habla con frases"],
            "dysregulation_frequency": "Menos seguido",
            "early_signs": ["Más movimientos repetitivos", "Cambia el tono de voz"],
            "triggers": ["Esperas", "Tareas o exigencias"],
            "risk_times": ["Al cambiar de actividad"],
        },
        "sensory_context": {
            "sensory_profile": "Hiposensible",
            "auditory": 0,
            "visual": 0,
            "tactile": -1,
            "gustatory": 0,
            "vestibular": -1,
        },
        "historical_supports": [
            {"id": "sup_b_1", "description": "Pausas programadas con reducción de ruido", "type": "historical", "effective": True},
            {"id": "sup_b_2", "description": "Movimiento o columpio antes de las tareas", "type": "historical", "effective": True},
        ],
    },
    # Sin estimación (2 días de historial): perfil recién creado.
    "PAC-C": {
        "habitual_context": {
            "age_range": "2 a 5 años",
            "neurodivergence": "TEA y TDAH",
            "support_level": "No lo sé",
            "communication": ["Pocas palabras"],
            "dysregulation_frequency": "Casi a diario",
            "early_signs": ["Llora sin motivo claro", "Rechaza el contacto"],
            "triggers": ["Cambios de rutina", "Hambre o sueño"],
            "risk_times": ["Mañana", "Noche"],
        },
        "sensory_context": {
            "sensory_profile": "Buscador sensorial",
            "gustatory": -1,
            "vestibular": -1,
        },
        "historical_supports": [
            {"id": "sup_c_1", "description": "Masticables", "type": "historical", "effective": True},
        ],
    },
}


def demo_profile(subject_id: str) -> dict[str, Any]:
    """`profile.json` de una demo, marcado como sintético."""
    meta = DEMO_PROFILES.get(subject_id, {})
    return {
        "subject_id": subject_id,
        "display_name": subject_id,
        "timezone": DEMO_TIMEZONE,
        "habitual_context": meta.get("habitual_context", {}),
        "sensory_context": meta.get("sensory_context", {}),
        "historical_supports": meta.get("historical_supports", []),
        "provenance": {"source": "synthetic_demo", "synthetic": True},
        # Actor fijo del frontend (VITE_ACTOR_ID); permite confirmar resultados en la demo.
        "authorized_tutor_ids": [DEMO_TUTOR_ID],
    }

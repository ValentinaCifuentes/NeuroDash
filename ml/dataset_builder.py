from datetime import date, datetime, timezone as dt_timezone, timedelta
import json
import math
from pathlib import Path
import random
import zoneinfo
from typing import Any

from engine.temporal import AvailabilityPolicy, filter_records, resolve_timezone
from engine.baseline import build_baseline, BaselineSnapshot
from engine.features import CRISIS_SEVERITIES, FeatureSet, build_features
from engine.schemas import DYSREGULATION_EVENT_TYPE, HORIZON_HOURS


# Horas locales de las estimaciones con que se entrena y evalúa: varias por día, porque
# el riesgo de las próximas 8 horas cambia durante el día y en la app se puede pedir
# a cualquier hora. La de las 04:00 hace que el modelo también vea la madrugada.
CUTOFF_HOURS = (4, 8, 12, 16, 20)


def training_cutoffs(
    records: list[dict[str, Any]],
    timezone: str = "UTC",
    start_offset_days: int = 3,
    hours: tuple[int, ...] = CUTOFF_HOURS,
) -> list[datetime]:
    """Cortes de entrenamiento: las `hours` locales de cada día con historial.

    Empieza `start_offset_days` días después del primer registro, para que la línea
    base tenga algo de madurez, y termina el último día con registros.
    """
    if not records:
        return []
    tz = resolve_timezone(timezone)
    days = sorted({record["source_timestamp"].astimezone(tz).date() for record in records})
    first, last = days[0], days[-1]
    cutoffs = []
    for offset in range(start_offset_days, (last - first).days + 1):
        day = first + timedelta(days=offset)
        cutoffs.extend(datetime(day.year, day.month, day.day, hour, tzinfo=tz) for hour in hours)
    return cutoffs


def label_for_cutoff(
    occurrences: list[dict[str, Any]],
    cutoff: datetime,
    horizon_hours: int = HORIZON_HOURS
) -> bool:
    """
    Returns True if a moderate/severe occurrence falls in the horizon
    (cutoff, cutoff + horizon_hours].
    """
    horizon_end = cutoff + timedelta(hours=horizon_hours)

    for occ in occurrences:
        src_ts = occ.get("source_timestamp")
        if not isinstance(src_ts, datetime):
            continue

        # Occurrence must be strictly after cutoff and within the horizon
        if cutoff < src_ts <= horizon_end:
            severity = str(occ.get("severity", "")).lower()
            if severity in CRISIS_SEVERITIES:
                return True

    return False


def build_feature_example(
    records: list[dict[str, Any]],
    occurrences: list[dict[str, Any]],
    baseline: BaselineSnapshot,
    cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC",
    horizon_hours: int = HORIZON_HOURS,
    planned_events: list[dict[str, Any]] | None = None
) -> tuple[FeatureSet, bool]:
    """
    Builds the full FeatureSet and label (X, y) for a timezone-aware cutoff T.

    The FeatureSet keeps the missingness and baseline maturity metadata that the
    evaluation needs to reproduce the confidence/abstention layer; training keeps
    using `build_training_example`, which only returns the rolling features.
    """
    # Las ocurrencias sirven para la etiqueta (las posteriores al corte) y para las
    # variables del día (solo las disponibles al corte; lo filtra `build_features`).
    feat_set = build_features(
        records=records,
        baseline=baseline,
        cutoff=cutoff,
        policy=policy,
        timezone=timezone,
        planned_events=planned_events,
        occurrences=occurrences
    )
    return feat_set, label_for_cutoff(occurrences, cutoff, horizon_hours)


def build_training_example(
    records: list[dict[str, Any]],
    occurrences: list[dict[str, Any]],
    baseline: BaselineSnapshot,
    cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC",
    horizon_hours: int = HORIZON_HOURS,
    planned_events: list[dict[str, Any]] | None = None
) -> tuple[dict[str, float | None], bool]:
    """
    Builds a training example (X, y) for a given timezone-aware cutoff T.
    X represents the rolling features as of cutoff T.
    y is True if there is a moderate or severe occurrence in the horizon (T, T + horizon_hours].
    """
    feat_set, label = build_feature_example(
        records=records,
        occurrences=occurrences,
        baseline=baseline,
        cutoff=cutoff,
        policy=policy,
        timezone=timezone,
        horizon_hours=horizon_hours,
        planned_events=planned_events
    )
    return feat_set.rolling_features, label


def build_dataset(
    records: list[dict[str, Any]],
    occurrences: list[dict[str, Any]],
    cutoffs: list[datetime],
    split_cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC",
    subject_id: str = "unknown",
    horizon_hours: int = HORIZON_HOURS,
    planned_events: list[dict[str, Any]] | None = None
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
            horizon_hours=horizon_hours,
            planned_events=planned_events
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
        "cutoffs_count": len(cutoffs),
        "cutoff_hours": sorted({c.astimezone(resolve_timezone(timezone)).hour for c in cutoffs}),
        "policy": {
            "daily_regulation": pol.daily_regulation,
            "exclusion_policy": pol.exclusion_policy
        }
    }
    
    return X_train, y_train, X_test, y_test, lineage


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


# Disparadores y estrategias (catálogo cerrado del front, D5). Se sortean al azar
# por evento para que la demo muestre detalle y el conteo diario tenga señal.
SYNTHETIC_TRIGGERS = [
    "Ruidos", "Frustración", "Cambio de actividad", "Espera",
    "Hambre o cansancio", "Contacto físico", "Lugar con mucha gente", "Le dijeron que no",
]
SYNTHETIC_STRATEGIES = [
    "Espacio seguro", "Presión profunda", "Pictogramas", "Anticipación verbal",
    "Pausa sensorial", "Objeto de calma", "Audífonos", "Acompañamiento",
]
# Eventos de rutina de las hojas de registro (no son desregulaciones).
SYNTHETIC_ROUTINE_EVENTS = ["Transición de Actividad", "Alimentación", "Dieta Sensorial"]


def _waking_time(day: datetime, rng: random.Random) -> datetime:
    """Una hora al azar entre las 08:00 y las 21:00 de ese día."""
    return day + timedelta(hours=8, minutes=rng.randint(0, 13 * 60))


def _mild_event(event_id: str, when: datetime, event_type: str, intensity_value: int) -> dict[str, Any]:
    """Evento leve registrado al momento (disponible a su hora)."""
    event: dict[str, Any] = {
        "id": event_id,
        "source_timestamp": when,
        "availability_timestamp": when,
        "event_type": event_type,
        "intensity_value": intensity_value,
    }
    if event_type == DYSREGULATION_EVENT_TYPE:
        event["severity"] = "mild"
    return event


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

    Cada día tiene horas, como lo que registra la app: Mi Día entre las 07:00 y las
    08:30 (con los conteos del día, como los deja `_refresh_daily_event_counts`), el
    cierre del día en la noche (disponible desde la medianoche), los eventos sueltos
    a lo largo del día y la crisis entre las 09:30 y las 21:00. Muchas crisis vienen
    precedidas por desregulaciones leves (el día escala) y a veces se repiten unas
    horas después: lo de la mañana también anticipa la tarde.

    `end_date` fija el día del último registro (las demos usan «ayer», para que el
    historial sea reciente cuando se muestran). Sin ella, el historial empieza el
    2026-08-01. La secuencia de valores depende solo de `seed` y `days`, no de las fechas.
    """
    rng = random.Random(seed)

    tz = zoneinfo.ZoneInfo(timezone)
    if end_date is None:
        first_day = date(2026, 8, 1)
    else:
        first_day = end_date - timedelta(days=days - 1)
    start_date = datetime(first_day.year, first_day.month, first_day.day, tzinfo=tz)

    records: list[dict[str, Any]] = []
    occurrences: list[dict[str, Any]] = []
    planned_events: list[dict[str, Any]] = []

    load = 0.5  # latent dysregulation load in [0, 1]
    # Escalas de los eventos (P22) con su propio generador: así la secuencia de
    # los valores anteriores, y con ella el estado de cada demo, no cambia.
    event_rng = random.Random(seed * 7919 + 17)
    # Detalle de las hojas (disparadores/estrategias/resultado) también aparte, por
    # la misma razón: no perturba la secuencia principal de la demo.
    detail_rng = random.Random(seed * 104729 + 23)
    # Horas del día y eventos sueltos (Mi Día, cierre, eventos previos a la crisis),
    # también aparte por la misma razón.
    time_rng = random.Random(seed * 15485863 + 31)

    for d in range(days):
        day = start_date + timedelta(days=d)

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
        # Detalle de las hojas de registro, agregado por día (como lo hace el backend
        # en `_refresh_daily_event_counts`). Dependen de la carga: más desregulación
        # implica más disparadores, más estrategias y más episodios sin regular.
        trigger_count = max(0, int(round(3.0 * load + 0.4 * detail_rng.gauss(0.0, 1.0))))
        strategy_count = max(0, int(round(2.0 * load + 0.4 * detail_rng.gauss(0.0, 1.0))))
        dysregulation_unresolved = 1 if (load > 0.8 and detail_rng.random() < 0.7) else 0

        # Dos registros por día, como en la app: Mi Día en la mañana (disponible al
        # guardarse) y el cierre en la noche (disponible desde la medianoche).
        morning = day + timedelta(hours=7, minutes=time_rng.randint(0, 90))
        evening = day + timedelta(hours=20, minutes=time_rng.randint(30, 90))
        raw = _synthetic_raw(
            sleep_quality, wake_state, start_autonomy_level, medication_taken, gi_level, day_regulation_level_num
        )
        record = {
            "id": f"rec_{subject_id}_{d}",
            "subject_id": subject_id,
            "source_timestamp": morning,
            "availability_timestamp": morning,
            "date": day.date().isoformat(),
            "prediction_availability": "immediate",
            "sleep_quality": sleep_quality,
            "wake_state": wake_state,
            "start_autonomy_level": start_autonomy_level,
            "medication_taken": medication_taken,
            "gi_level": gi_level,
            "trigger_count": trigger_count,
            "strategy_count": strategy_count,
            "dysregulation_unresolved": dysregulation_unresolved,
            # Textos de la Bitácora, como los guarda la app (`raw`): la interfaz
            # los muestra en el historial y el calendario. El motor no los usa.
            "raw": {key: value for key, value in raw.items() if key != "day_regulation_level"},
        }
        # Escalas de las hojas de registro, traducidas como lo hace el backend
        # (`EVENT_SCALE_ENCODINGS`). No todos los días hay una transición, una comida
        # o dieta sensorial registradas: el campo falta esos días, no vale 0.
        if event_rng.random() < 0.7:
            record["transition_difficulty"] = int(_clip(round(2.0 * load + 0.4 * event_rng.gauss(0.0, 1.0)), 0, 2))
        if event_rng.random() < 0.8:
            record["feeding_difficulty"] = int(_clip(round(1.6 * load + 0.4 * event_rng.gauss(0.0, 1.0)), 0, 2))
        if event_rng.random() < 0.6:
            done = 1.0 - load + 0.2 * event_rng.gauss(0.0, 1.0)
            record["sensory_diet_done"] = 1.0 if done > 0.6 else 0.5 if done > 0.35 else 0.0
        records.append(record)
        records.append({
            "id": f"eod_{subject_id}_{d}",
            "subject_id": subject_id,
            "source_timestamp": evening,
            "availability_timestamp": day + timedelta(days=1),
            "date": day.date().isoformat(),
            "prediction_availability": "prior_day_only",
            "day_regulation_level_num": day_regulation_level_num,
            "raw": {"day_regulation_level": raw["day_regulation_level"]},
        })

        # 2.5 Evento planificado (conocido de antemano, sin fuga de información).
        #    La probabilidad de que sea «Estresante» sigue a la carga: en días de más
        #    carga es más probable un plan estresante. Así `planned_stressful_event_8h`
        #    correlaciona con la crisis SIN alterar la secuencia de crisis (las
        #    semillas de la demo siguen dando el mismo estado PAC-A alto / PAC-B bajo).
        if detail_rng.random() < 0.30:
            stressful = detail_rng.random() < (0.15 + 0.70 * load)
            expectation = "Estresante" if stressful else detail_rng.choice(["Agradable", "Neutro"])
            planned_events.append({
                "id": f"plan_{subject_id}_{d}",
                "subject_id": subject_id,
                "starts_at": day + timedelta(hours=8 + detail_rng.randint(1, 12)),
                "title": "Cita médica" if stressful else detail_rng.choice(["Visita familiar", "Salida al parque"]),
                "category": "Salud" if stressful else detail_rng.choice(["Social", "Rutina"]),
                "expectation": expectation,
            })

        # 3. Crisis occurrence (moderate/severe) during the day, driven by the load.
        #    Falls between 09:30 and 21:00, so the 8h horizon of a morning, noon or
        #    afternoon estimate can contain it.
        #    Steep logistic keeps the base rate realistic (~15–20%) while remaining
        #    strongly dependent on the load.
        day_events: list[dict[str, Any]] = []
        p_crisis = 1.0 / (1.0 + math.exp(-8.0 * (load - 0.7)))
        if rng.random() < p_crisis:
            occ_hour = rng.randint(1, 8)
            occ_time = day + timedelta(hours=8 + 1.5 * occ_hour, minutes=time_rng.randint(0, 59))
            avail_time = occ_time + timedelta(hours=2)  # 2 hours notification delay
            severity = "severe" if load > 0.72 else "moderate"
            intensity_value = int(_clip(round(1.0 + 9.0 * load + rng.gauss(0.0, 0.8)), 4, 10))

            # Detalle de la hoja (disparadores, estrategias, resultado): igual que
            # lo que manda el front. Usa `detail_rng` para no alterar la secuencia principal.
            n_triggers = max(1, int(round(1.0 + 2.0 * load + 0.5 * detail_rng.gauss(0.0, 1.0))))
            n_strategies = max(1, int(round(1.0 + 1.5 * load + 0.5 * detail_rng.gauss(0.0, 1.0))))
            trigger = detail_rng.sample(SYNTHETIC_TRIGGERS, k=min(n_triggers, len(SYNTHETIC_TRIGGERS)))
            strategy_applied = detail_rng.sample(SYNTHETIC_STRATEGIES, k=min(n_strategies, len(SYNTHETIC_STRATEGIES)))
            strategy_outcome = (
                "Sin Regulación" if load > 0.82
                else "Regulación Parcial" if load > 0.65
                else "Regulación Exitosa"
            )

            day_events.append({
                "id": f"occ_{subject_id}_{d}",
                "source_timestamp": occ_time,
                "availability_timestamp": avail_time,
                "severity": severity,
                "event_type": DYSREGULATION_EVENT_TYPE,
                "intensity_value": intensity_value,
                "trigger": trigger,
                "strategy_applied": strategy_applied,
                "strategy_outcome": strategy_outcome,
            })
            # Señal temprana: la mayoría de las crisis vienen precedidas, en las 3 horas
            # anteriores, por una o dos desregulaciones leves. Es lo que deja anticipar
            # dentro del mismo día.
            if time_rng.random() < 0.8:
                for warn_index in range(time_rng.randint(1, 2)):
                    warning = max(morning, occ_time - timedelta(minutes=time_rng.randint(30, 180)))
                    day_events.append(_mild_event(
                        f"occ_{subject_id}_{d}_warn{warn_index}", warning, DYSREGULATION_EVENT_TYPE, time_rng.randint(2, 3)
                    ))
            # Después de una crisis el infante queda más vulnerable: puede venir otra
            # 2 a 5 horas más tarde, más probable con más carga. Sin esto, el modelo
            # aprendería que tras una crisis viene la calma (en los datos nunca habría otra).
            if time_rng.random() < 0.25 + 0.5 * load:
                rebound = occ_time + timedelta(minutes=time_rng.randint(120, 300))
                if rebound <= day + timedelta(hours=22):
                    day_events.append({
                        **day_events[0],
                        "id": f"occ_{subject_id}_{d}_b",
                        "source_timestamp": rebound,
                        "availability_timestamp": rebound + timedelta(hours=2),
                        "intensity_value": max(4, intensity_value - time_rng.randint(0, 2)),
                    })

        # 4. El resto de los eventos del día, hasta los conteos sorteados: desregulaciones
        #    leves (una moderada o severa sería otra crisis) y eventos de rutina. Los
        #    conteos del registro de Mi Día se calculan desde estos eventos, como en
        #    `_refresh_daily_event_counts`; la intensidad leve nunca pasa de 3.
        #    En un día con crisis, las leves van antes de ella: el día escala. En un día
        #    sin crisis hay menos (una leve suelta no siempre escala, pero si fueran tantas
        #    como en los días con crisis no avisarían nada).
        mild_cap = max(1, min(3, max_intensity))
        first_crisis = day_events[0]["source_timestamp"] if day_events else None
        dysregulations_so_far = sum(1 for e in day_events if e["event_type"] == DYSREGULATION_EVENT_TYPE)
        for index in range(max(0, dysregulation_count - dysregulations_so_far)):
            if first_crisis is None and time_rng.random() < 0.6:
                continue
            when = (
                morning + (first_crisis - morning) * time_rng.random()
                if first_crisis is not None
                else _waking_time(day, time_rng)
            )
            day_events.append(_mild_event(
                f"evt_{subject_id}_{d}_d{index}", when,
                DYSREGULATION_EVENT_TYPE, time_rng.randint(1, mild_cap),
            ))
        for index in range(max(0, event_count - len(day_events))):
            day_events.append(_mild_event(
                f"evt_{subject_id}_{d}_r{index}", _waking_time(day, time_rng),
                time_rng.choice(SYNTHETIC_ROUTINE_EVENTS), time_rng.randint(1, mild_cap),
            ))

        day_events.sort(key=lambda e: e["source_timestamp"])
        dysregulations = [e for e in day_events if e["event_type"] == DYSREGULATION_EVENT_TYPE]
        record["event_count"] = len(day_events)
        record["dysregulation_count"] = len(dysregulations)
        record["max_intensity"] = max((e["intensity_value"] for e in day_events), default=0)
        for event in day_events:
            occurrences.append({"subject_id": subject_id, **event})

    lineage = {
        "seed": seed,
        "generator_name": "synthetic_history_generator",
        "generator_version": "2.0-load-driven",
        "data_generation_timestamp": datetime.now(dt_timezone.utc).isoformat()
    }

    return {
        "records": records,
        "occurrences": occurrences,
        "planned_events": planned_events,
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

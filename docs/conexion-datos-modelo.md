# NeuraDash · Cómo funciona la conexión datos ↔ modelo

> Estado: implementado sobre el branch `feature/model-data-connection`.
> Alcance: Fase 0 (traducción de lo que se captura) y Fase 1 (confianza con variables núcleo y manejo de faltantes) del plan `docs/plan-conexion-datos-modelo.md`.

Este documento describe **cómo llega ahora** lo que registra el tutor desde la interfaz hasta el modelo predictivo, sin entrar en la implementación del modelo (que sigue desacoplada detrás del contrato `/api/v1`).

> **Horizonte de predicción: 8 horas.** El modelo aprende a anticipar una crisis `moderate`/`severe` dentro de las 8 h siguientes al corte (`engine/schemas.py: HORIZON_HOURS = 8`), no 24 h.

---

## 1. Resumen del flujo

```
Interfaz (Bitácora / Eventos)
        │  POST /api/v1/subjects/{id}/daily-records
        │  POST /api/v1/subjects/{id}/end-of-day
        │  POST /api/v1/subjects/{id}/events
        ▼
backend/app/routes/subjects.py  ── codificación (texto → número + raw)
        │  escribe JSON atómico
        ▼
data/subjects/{id}/records.json   (registros diarios con variables numéricas)
data/subjects/{id}/occurrences.json (eventos, con severity si es desregulación)
        │
        ▼
engine/features.py  ── ventanas 1/3/7/14 días, delta vs línea base, relleno de faltantes
        │
        ▼
engine/confidence.py ── cobertura solo sobre core_fields (sueño, despertar, eventos)
        │
        ▼
ml/  ── entrenamiento / inferencia por infante (regresión logística)
        │
        ▼
Prediction Contract v2  (factores, missingness, apoyos) → frontend
```

**Propiedad clave del diseño:** el motor (`engine/features.py`) toma automáticamente *cualquier* campo numérico que exista en la raíz de un registro diario. Por eso, conectar la interfaz al modelo consiste únicamente en **dejar valores numéricos en la raíz** de los registros; el resto (ventanas, línea base, confianza) funciona sin tocar el motor.

---

## 2. Dónde se guarda cada dato

| Dato | Archivo | Colección lógica |
|---|---|---|
| Perfil (timezone, contexto, apoyos, tutores) | `data/subjects/{id}/profile.json` | `SubjectRepository` |
| Registro diario (Bitácora + cierre de día + conteos de eventos) | `data/subjects/{id}/records.json` | `records` |
| Eventos de las 4 categorías | `data/subjects/{id}/occurrences.json` | `occurrences` |
| Snapshots de predicción | `data/subjects/{id}/predictions/{prediction_id}.json` | — |

---

## 3. Fase 0 · Codificación de la Bitácora

En `backend/app/routes/subjects.py`, las funciones `save_daily_record` y `save_end_of_day` llaman a `_encode_care_record(...)`. Para cada campo de texto:

1. El **texto original se mueve** a un subobjeto `raw: { ... }` (se conserva para auditoría).
2. La **contraparte numérica se escribe en la raíz** con un nombre estable.

### 3.1 Tabla de codificación

| Campo del request (texto) | Campo numérico (raíz) | Valores texto → número | Sentido |
|---|---|---|---|
| `sleep_quality` | `sleep_quality` | `Reparador` 8 · `Interrumpido` 5 · `Dificultad de Conciliación` 2 | más alto = mejor |
| `wake_mode` | `wake_state` | `Tranquilo/Alegre` 2 · `Cansado/Con Sueño` 5 · `Irritable/Llorando` 8 | más alto = peor |
| `start_autonomy` | `start_autonomy_level` | `Por sí solo` 0 · `Con alarma` 1 · `Con insistencia` 2 | — |
| `medication_adherence` | `medication_taken` | `Sí` 1 · `No` 0 · `No Aplica` → **sin campo numérico** | evita contar "no aplica" como faltante |
| `gi_status` | `gi_level` | `Normal` 0 · `Estreñimiento` 1 · `Diarrea` 2 | — |
| `day_regulation_level` | `day_regulation_level_num` | `Excelente` 0 · `Estable con Apoyo` 1 · `Desregulación Frecuente` 2 | — |

> **Normalización:** el matching es insensible a mayúsculas/minúsculas, tildes y espacios (`_normalize_label`). Por eso `"Estable con Apoyo"`, `"estable con apoyo"`, `"Por sí solo"` y `"Por si solo"` se reconocen igual. Se acepta además `"Cansado"` como alias de `"Cansado/Con Sueño"`.

> **Regla de `No Aplica`:** si `medication_adherence` es `"No Aplica"`, el texto queda en `raw.medication_adherence` pero **no** se escribe `medication_taken`, para no afectar la cobertura.

### 3.2 Ejemplo de registro diario codificado

Entrada (`POST /daily-records`):

```json
{
  "occurred_at": "2026-08-26T07:30:00-04:00",
  "idempotency_key": "daily-1",
  "provenance": {"source": "caregiver", "synthetic": false},
  "sleep_quality": "Reparador",
  "wake_mode": "Tranquilo/Alegre",
  "start_autonomy": "Por sí solo",
  "medication_adherence": "Sí",
  "gi_status": "Normal"
}
```

Almacenado en `records.json`:

```json
{
  "record_id": "…",
  "contract_version": "2.0",
  "subject_id": "alex-rivera",
  "author_id": "tutor-1",
  "source_timestamp": "2026-08-26T07:30:00-04:00",
  "availability_timestamp": "2026-08-26T07:30:00-04:00",
  "date": "2026-08-26",
  "prediction_availability": "immediate",
  "sleep_quality": 8,
  "wake_state": 2,
  "start_autonomy_level": 0,
  "medication_taken": 1,
  "gi_level": 0,
  "raw": {
    "sleep_quality": "Reparador",
    "wake_mode": "Tranquilo/Alegre",
    "start_autonomy": "Por sí solo",
    "medication_adherence": "Sí",
    "gi_status": "Normal"
  }
}
```

---

## 4. Fase 0 · Severidad de los eventos

En `save_event` (`POST /events`), si `event_type == "Desregulación Emocional"`, se añade el campo `severity` según la intensidad:

| Intensidad | `severity` |
|---|---|
| 1 – 3 | `mild` |
| 4 – 7 | `moderate` |
| 8 – 10 | `severe` |

- **Solo** `Desregulación Emocional` genera etiqueta (es la única crisis que aprende a predecir el modelo).
- `Alimentación`, `Transición de Actividad` y `Dieta Sensorial` **no** generan `severity`.

Ejemplo de `occurrences.json`:

```json
{
  "event_id": "…",
  "contract_version": "2.0",
  "subject_id": "alex-rivera",
  "source_timestamp": "2026-08-26T10:00:00-04:00",
  "availability_timestamp": "2026-08-26T10:00:00-04:00",
  "event_type": "Desregulación Emocional",
  "intensity_value": 8,
  "severity": "severe"
}
```

---

## 5. Fase 0 · Conteo diario de eventos

Al guardar un evento, `_refresh_daily_event_counts(...)` recalcula sobre el **registro diario del día local del evento** (según el `timezone` del infante):

| Campo | Definición |
|---|---|
| `event_count` | total de eventos de ese día local |
| `dysregulation_count` | eventos de ese día con `event_type == "Desregulación Emocional"` |
| `max_intensity` | máxima `intensity_value` de ese día (0 si no hay) |

- Si ya existe un registro diario para ese día, se actualizan esos tres campos.
- Si **no existe**, se crea un registro mínimo con `prediction_availability: "immediate"` y esos conteos, para que el motor pueda consumirlos.
- El recálculo es idempotente: se deriva de la lista completa de `occurrences` de ese día, por lo que repetir un evento (mismo `idempotency_key`) no duplica conteos.

---

## 6. Fase 1 · Variables que genera el motor

`engine/features.py` (`build_features`) toma todos los campos numéricos de la raíz de cada registro y, para cada uno, produce:

- `{campo}_mean_{1,3,7,14}d` — promedio en ventanas de 1, 3, 7 y 14 días.
- `{campo}_delta_baseline` — valor más reciente menos la mediana del infante (línea base).
- `record_count_{1,2,3,7,14}d` — número de registros en cada ventana.

Los campos numéricos que ahora fluyen al modelo son:

```
sleep_quality, wake_state, event_count,
start_autonomy_level, medication_taken, gi_level,
day_regulation_level_num, dysregulation_count, max_intensity
```

Cualquier campo numérico nuevo que se guarde en la raíz de un registro entra **automáticamente** a las ventanas, a la línea base y a la confianza, sin tocar el código del motor.

---

## 7. Fase 1 · Relleno de datos faltantes

`engine/features.py` ya **no** deja un agregado faltante en `None` (que el entrenador imputaba a `0`, confundiéndose con un valor real como "0 eventos"). En su lugar:

- Si una ventana no tiene valores para una modalidad, se usa **la mediana de la línea base del infante** (`baseline.modality_baselines`).
- Solo cae a `None` en arranque en frío, cuando todavía no existe línea base.
- La metadato de `missingness` se conserva intacto (el dato sigue marcado como faltante para efectos de cobertura).

---

## 8. Fase 1 · Confianza medida solo sobre variables núcleo

`config/confidence.yaml` define:

```yaml
core_fields:
  - sleep_quality
  - wake_state
  - event_count
```

`engine/confidence.py` (`calculate_confidence`) mide la **cobertura solo sobre esa lista**. Así, los campos opcionales de la Bitácora (autonomía, medicación, digestión, regulación) **no diluyen** la confianza cuando están ausentes.

Umbrales de cobertura (en `config/confidence.yaml`):

| Cobertura | Nivel |
|---|---|
| ≥ 0.8 | `HIGH` |
| ≥ 0.6 | `MEDIUM` |
| ≥ 0.4 | `LOW` |
| < 0.4 | `INSUFFICIENT` |

---

## 9. Nombres legibles ("Por qué aparece así")

`engine/explanation.py` mapea cada variable a un nombre en lenguaje simple (`FEATURE_DISPLAY_NAMES`) y a un código estable (`FEATURE_VARIABLE_NAMES`). Se añadieron entradas para las seis familias nuevas:

| Variable (feature) | Nombre legible (ejemplo 1d) |
|---|---|
| `start_autonomy_level_*` | "autonomía al inicio del día en el último día" |
| `medication_taken_*` | "toma de medicación en el último día" |
| `gi_level_*` | "nivel de digestión en el último día" |
| `day_regulation_level_num_*` | "nivel de regulación del día en el último día" |
| `dysregulation_count_*` | "conteo de desregulaciones en el último día" |
| `max_intensity_*` | "intensidad máxima de eventos en el último día" |

> Nota: los strings internos omiten tildes (p. ej. `"autonomia al inicio del dia en el ultimo dia"`) para coincidir con el estilo existente de `FEATURE_DISPLAY_NAMES`; la tabla anterior los muestra acentuados solo por legibilidad.

---

## 10. Endpoints relevantes

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/v1/subjects/{id}/daily-records` | Guarda el estado basal; codifica texto → número + `raw` |
| `POST` | `/api/v1/subjects/{id}/end-of-day` | Guarda el cierre de jornada (`day_regulation_level`); disponibilidad `prior_day_only` (cuenta desde el día siguiente) |
| `POST` | `/api/v1/subjects/{id}/events` | Guarda un evento; añade `severity` (solo desregulación) y recalcula `event_count`/`dysregulation_count`/`max_intensity` |
| `POST` | `/api/v1/predictions` | Predicción; consume `records.json` + `occurrences.json` vía el motor |

---

## 11. Consideraciones y pendientes

- **Política temporal `prior_day_only`:** lo registrado hoy recién cuenta mañana (`availability_timestamp` del cierre de día es la medianoche siguiente). El campo `prediction_availability` (`immediate` vs `prior_day_only`) describe la intención, aunque hoy el motor usa `prior_day_only` de forma fija.
- **Datos demo:** `ml/dataset_builder.py:generate_synthetic_history` genera los mismos campos numéricos y con **señal aprendible** (una "carga de desregulación" oculta, autocorrelacionada, que hace que los registros pasados predigan la crisis de hoy). Los perfiles PAC-A/PAC-B usan 90 días; PAC-C usa 2 días para demostrar la abstención.
- **Ocurrencias de "Confirmar que ocurrió"** (`ml/promotion.py:record_prediction_outcome`) no llevan `event_type` ni `intensity_value`; cuentan en `event_count` pero no en `dysregulation_count`.
- **Fuera de alcance por ahora (Fases 2–4 del plan):** detalle de eventos, contexto del día, perfil inicial completo y planificación.

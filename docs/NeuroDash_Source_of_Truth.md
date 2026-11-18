# NeuroDash — Fuente de verdad del producto (as-built)

**Solución:** NeuroDash CORE
**Estado del documento:** descripción del sistema **tal como está implementado hoy** (no una promesa de lo que se hará).
**Propósito:** servir de referencia única y fidedigna de qué es NeuroDash, qué hace, cómo está construido y cuáles son sus límites.
**Regla de uso:** si un documento, una idea o un claim contradice este archivo, gana este archivo y lo demás debe corregirse.

> **Fecha de consolidación:** 18 de noviembre de 2026. Refleja el código en `backend/`, `engine/`, `ml/`, `front/` y `config/`.

---

## 1. Qué es NeuroDash

NeuroDash es una **aplicación de apoyo —no diagnóstica—** para la persona que cuida a un
infante neurodivergente (el **tutor**). El tutor registra cómo va el día (bitácora y
eventos) y la app devuelve una **estimación del riesgo de desregulación en las próximas
8 horas**, separada de la **confianza** en esa estimación, junto con una **explicación**
de las señales que la sostienen y **apoyos** concretos a considerar.

El objetivo de producto es **anticipar con al menos 8 horas** una crisis
`moderate`/`severe`. El horizonte está fijado en `engine/schemas.py` (`HORIZON_HOURS = 8`)
y viaja en el contrato como `horizon_hours`; el frontend **nunca escribe el número a
mano**, lo lee del contrato. Un horizonte de 24 h no es viable con la señal disponible.

> **Límite de seguridad (invariable):** NeuroDash comunica incertidumbre, asociaciones
> observadas y opciones de apoyo. **No** es una herramienta de diagnóstico, causal,
> clínica ni de toma de decisiones de emergencia. No utilice datos de demostración ni
> sintéticos para tomar decisiones clínicas.

### NeuroDash ES

- una aplicación independiente;
- un sistema de apoyo a decisiones, no una IA clínica validada;
- un motor de estimación de riesgo **por infante** (un modelo propio por persona);
- un sistema que separa **riesgo** de **confianza**;
- un sistema que puede **abstenerse** cuando la información no alcanza;
- un sistema **explicable y no causal**;
- un sistema que funciona **solo con el registro manual del tutor**, sin hardware.

### NeuroDash NO ES

- una herramienta diagnóstica ni un dispositivo médico;
- una garantía de que una crisis ocurrirá;
- un reemplazo del criterio clínico;
- un sistema que prescribe tratamientos;
- un wearable o un producto IoT cuyo valor dependa de sensores.

---

## 2. Estado actual

**Demostración funcional** con tres perfiles sintéticos:

- **PAC-A** — riesgo moderado que sube a **elevado** al registrar desregulaciones leves (historial con señal aprendible).
- **PAC-B** — riesgo bajo (historial con patrón más estable).
- **PAC-C** — sin estimación: solo 2 días de historial, se abstiene en frío.

Los tres perfiles son **sintéticos** (`provenance.synthetic: true`) y existen para
demostrar el pipeline real: sus historiales se generan con semillas deterministas, se
entrenan modelos de verdad para PAC-A y PAC-B, y PAC-C demuestra la abstención segura.

Las pantallas del tutor son: **Selección** (lista + alta), **Evolución** (estimación de
8 h), **Seguimiento** (calendario del mes y comparación de 14 días), **Bitácora** (Mi
Día y registro de eventos), **Historial de Hoy**, **Planificación** (agenda de eventos
futuros, conectada al backend), **Ficha** (perfil) y **Mis Tickets** (fuera de alcance).

---

## 3. El modelo predictivo

- **Un modelo por infante.** Cada persona tiene su propio historial y su propia versión
  de modelo. No hay un único predictor global.
- **Algoritmo:** regresión logística regularizada (scikit-learn: `penalty="l2"`,
  `C=1.0`, `solver="liblinear"`, `random_state=42`), determinista.
- **Arranque en frío:** sin suficientes ejemplos (por defecto menos de 5 muestras o sin
  etiquetas positivas) no se entrena; el sistema se **abstiene**.
- **Versiones y promoción:** el modelo se entrena por lotes y queda versionado
  (`model_v1.joblib` + metadatos). Una versión candidata solo se **promueve** si supera
  a la activa según validación temporal (métrica `f1`, mejora mínima en
  `config/promotion.yaml`).
- **Sin XGBoost ni SHAP:** la explicación usa los coeficientes lineales del modelo
  (`coeficiente × valor`), no SHAP.
- **Varias estimaciones por día:** el entrenamiento y la evaluación usan cinco cortes
  diarios (a las 04, 08, 12, 16 y 20 h locales, `ml/dataset_builder.py › CUTOFF_HOURS`).

---

## 4. Cómo fluyen los datos

```text
Bitácora / Eventos / Cierre de día / Planificación
        │  POST /api/v1/subjects/{id}/daily-records
        │  POST /api/v1/subjects/{id}/events
        │  POST /api/v1/subjects/{id}/end-of-day
        │  POST /api/v1/subjects/{id}/planned-events
        ▼
Codificación texto → número (el texto se conserva en `raw`)
        │
        ▼
data/subjects/{id}/records.json      (registros diarios con variables numéricas)
data/subjects/{id}/occurrences.json  (eventos, con `severity` si es desregulación)
        │
        ▼
engine/features.py   ── ventanas 1/3/7/14 días, delta vs línea base, indicadores de faltantes
engine/baseline.py  ── mediana por modalidad (línea base individual)
engine/confidence.py── cobertura solo sobre los campos núcleo
engine/abstention.py ── reglas de seguridad (madurez + confianza)
        │
        ▼
ml/ (regresión logística) → riesgo (LOW/MEDIUM/HIGH)
engine/explanation.py → factores no causales (comparados con la línea base)
engine/support.py     → apoyos (históricos primero, luego catálogo)
        │
        ▼
Prediction Contract v2 → frontend
```

### Codificación de la bitácora (texto → número)

El tutor elige texto; el backend guarda el texto original en `raw` y una contraparte
numérica en la raíz del registro (p. ej. `sleep_quality: "Reparador"` → `sleep_quality: 8`).
El motor agrega automáticamente **cualquier** campo numérico que esté en la raíz de un
registro diario.

### Variables que el motor agrega

Para cada campo numérico produce `{campo}_mean_{1,3,7,14}d`, `{campo}_delta_baseline`,
`record_count_{1,2,3,7,14}d` y, para los campos opcionales, el indicador
`{campo}_missing_*`. Además hay una variable de contexto al corte:
`planned_stressful_event_8h` (vale 1 si hay un evento planificado «Estresante» o
«Desagradable» en las 8 h siguientes).

### Regla temporal (intraday)

`config/availability.yaml` fija `daily_regulation: intraday`: una estimación usa todo
lo disponible **hasta su hora de corte**, incluido lo de hoy. La excepción es el
cierre del día (`prediction_availability: prior_day_only`), que resume la jornada
completa y recién cuenta desde el día siguiente. El historial (ventanas de 1–14 días)
y la línea base se arman solo con **días completos**; lo de hoy entra como variables
aparte. La regla anterior (`prior_day_only`) se conserva para comparar.

### Variables del día en curso

Además de las ventanas, el motor suma lo que se sabe de hoy al momento de la
estimación (`engine/features.py › _today_features`):

- `{campo}_today` — último valor de hoy de cada campo de Mi Día (sueño, despertar,
  autonomía, medicación, digestión, horas de sueño, señales, malestar, rutina, colegio);
- `today_record_missing` — si todavía no hay registro de Mi Día;
- `mild_dysregulation_count_3h` — desregulaciones **leves** en las últimas 3 h (avisan
  que el día escala);
- `crisis_count_today`, `max_intensity_today`, `dysregulation_unresolved_today`,
  `hours_since_dysregulation` — crisis y desregulaciones del día, cada una con su hora;
- `period_morning` / `period_afternoon` / `period_evening` — momento del día.

La estimación es el riesgo de una crisis **nueva**: justo después de una crisis ya
registrada, el riesgo suele bajar. Estas variables no entran a `missingness`, así que
no bajan la confianza temprano en el día.

---

## 5. Riesgo ≠ Confianza

Dos ejes independientes, invariables.

- **Riesgo** responde: *¿qué tan preocupante es el patrón observado?* Se deriva del
  score del modelo y se mapea a `LOW` / `MEDIUM` / `HIGH` (umbrales 0.3 y 0.6 en
  `config/risk_mapping.yaml`).
- **Confianza** responde: *¿qué tan suficiente, reciente y consistente es la información?*
  Se calcula por cobertura **solo sobre los campos núcleo** (`sleep_quality`,
  `wake_state`, `event_count`), con niveles `HIGH` / `MEDIUM` / `LOW` / `INSUFFICIENT`
  (umbrales 0.8 / 0.6 / 0.4 en `config/confidence.yaml`).

Un riesgo `HIGH` con confianza `LOW` **no es una contradicción**: el patrón parece
preocupante, pero faltan datos para sostenerlo con seguridad.

---

## 6. Abstención (seguridad)

El sistema **prefiere no estimar antes que inventar un número**. Se abstiene cuando:

- no hay modelo activo entrenado para el infante, o
- la madurez de la línea base es insuficiente (menos de 3 días, `config/abstention.yaml`), o
- la confianza cae por debajo del umbral requerido (`LOW`).

La abstención es una **respuesta válida de negocio** (HTTP 200), no un error: el
contrato llega con `abstained: true`, `risk: null` y `confidence: INSUFFICIENT`.

---

## 7. Explicación (no causal)

`engine/explanation.py` traduce las contribuciones del modelo a lenguaje humano. Cada
factor dice, en español:

- qué variable aportó y en qué dirección (empuja el riesgo hacia arriba o abajo);
- cómo está **respecto de lo habitual del propio infante** (`above`/`below`/`similar`
  frente a la mediana de su línea base) y qué significa para él (`worse`/`better`/`same`);
- una frase corta, p. ej. *«Despertó más irritable que de costumbre en los últimos tres
  días»*.

**Prohibido** el lenguaje causal: nunca se dice «el sueño causará una crisis» ni «el
ruido provocó la desregulación». Se habla de **asociaciones observadas**.

---

## 8. Apoyos

`engine/support.py` selecciona apoyos sin prescribir tratamiento, en este orden:

1. apoyos que **ya funcionaron** para esa persona (`historical_supports` con
   `effective: true`);
2. apoyos previamente registrados para la persona;
3. recomendaciones del **catálogo validado** (`config/support_catalog.yaml`);
4. un mensaje de «información insuficiente» cuando no hay base para contextualizar.

Sin estimación (abstención), igual se muestran los apoyos que el tutor registró como
efectivos («Lo que le ayuda»), porque son del tutor, no una inferencia del modelo.

---

## 9. Onboarding (perfil en 3 pasos)

El alta de un infante es un **perfil en 3 pasos** (`POST /api/v1/subjects`) que recoge:
edad, neurodivergencia, nivel de apoyo, comunicación, señales tempranas, gatillantes y
momentos de riesgo (`habitual_context`); perfil sensorial por canal (`sensory_context`,
−1/0/1); y estrategias que funcionan (`historical_supports`). No es un «cuestionario de
onboarding» que entrene un modelo: simplemente construye el perfil inicial y alimenta
la Ficha, las señales de la Bitácora y «Qué puedo hacer ahora».

---

## 10. Seguimiento, Planificación y Tickets

- **Seguimiento:** calendario del mes y comparación de 14 días, leído de la línea de
  tiempo (`GET /subjects/{id}/timeline`). La ventana de la línea de tiempo puede pedir
  24 h para incluir la tarde del día anterior; eso **no** cambia el horizonte de
  predicción, que es 8 h.
- **Planificación:** agenda de eventos futuros guardada en el backend
  (`POST/GET /subjects/{id}/planned-events`). Los eventos «Estresantes» o «Desagradables»
  entran al modelo como `planned_stressful_event_8h`.
- **Mis Tickets:** fuera de alcance (no conectado).

---

## 11. Invariantes del proyecto

1. **Riesgo ≠ Confianza.**
2. **Sin dato ≠ normal** (missingness explícito, nunca imputado como «0 normal»).
3. **Perfil sensorial ≠ riesgo basal** (contextualiza, no suma puntos de riesgo).
4. **Dato posterior al corte ≠ predictor válido** (sin leakage; solo lo disponible
   hasta `prediction_cutoff`).
5. **Score del modelo ≠ probabilidad clínica validada.**
6. **Dato sintético ≠ evidencia clínica** (siempre marcado en `provenance`).
7. **Asociación ≠ causalidad.**
8. **Hardware ≠ requisito** (el producto funciona sin sensores).
9. **Apoyo recomendado ≠ prescripción médica.**

---

## 12. Contrato con el frontend

El frontend **jamás depende del algoritmo**. Solo conoce las rutas `/api/v1` y el
`Prediction Contract v2`, que entrega:

```json
{
  "contract_version": "2",
  "prediction_id": "…",
  "subject_id": "PAC-A",
  "prediction_cutoff": "2026-11-18T14:00:00-03:00",
  "horizon_hours": 8,
  "risk": "HIGH",
  "confidence": "HIGH",
  "abstained": false,
  "factors": [],
  "missingness": [],
  "supports": [],
  "provenance": { "synthetic": true },
  "versions": { "model_version": "1", "policy_hash": "default", "code_version": "0.1.0" }
}
```

`INSUFFICIENT` no es un error HTTP: es un resultado válido (`abstained: true`,
`risk: null`).

---

## 13. Extensibilidad (hacia dónde puede crecer)

La arquitectura está pensada para **escalar sin reescribirse**:

- El desacoplamiento motor ↔ frontend (`/api/v1` + contrato v2) permite cambiar el
  algoritmo o añadir fuentes de datos **sin tocar la UI**.
- El `Feature Engine` agrega automáticamente cualquier campo numérico que aparezca en
  la raíz de un registro diario: una señal nueva (p. ej. una métrica pasiva de sueño o
  de actividad proveniente de un wearable, o una señal ambiental) entraría por el mismo
  camino, sin rehacer el motor.
- La persistencia (JSON por infante) puede sustituirse por SQLite o PostgreSQL mediante
  el `DataProvider`/repositorios sin cambiar el resto.

Hoy **no hay** integración de wearables ni sensores ambientales (nada de «CONNECT» ni
«SENSE» está implementado); son una **dirección de escalado futura y opcional**, nunca
un requisito para que NeuroDash funcione. El valor actual de la solución no depende de
hardware.

---

## 14. Estructura del repositorio

```text
backend/app/   API FastAPI: rutas (/api/v1), esquemas y servicio de estimación
engine/        Motor: temporal, features, línea base, confianza, abstención, explicación, apoyos, provenance
ml/            Datos sintéticos, dataset builder, entrenamiento, inferencia, explicación, registro y promoción de modelos
front/         App del tutor (Vite + React + TypeScript); ver front/README.md
scripts/       Generar demos, entrenar, verificar, exportar fixtures, check.sh, prepare_demo.sh
tests/         Pruebas unitarias y de integración del backend
docs/          Documentación del producto y arquitectura
openspec/      Registro del desarrollo guiado por especificaciones
config/        Configuración del motor (confianza, apoyos, riesgo, abstención, entrenamiento, promoción)
data/          Perfiles e historiales de las demos
models/        Modelos entrenados de las demos
```

---

## 15. Límites y claims prohibidos

No decir:

- «Predecimos crisis con X% de accuracy clínica.»
- «El sueño / el ruido causa la crisis.»
- «NeuroDash aprende de forma autónoma sin evaluación.»
- «Los sensores eliminan el problema de datos faltantes.»
- «La IA determina la causa.»

Sí decir (con matiz de incertidumbre):

- «NeuroDash estima un riesgo y su confianza, y puede abstenerse si faltan datos.»
- «Compara el patrón reciente con lo habitual del propio infante.»
- «Los datos de la demo son sintéticos y no constituyen evidencia clínica.»

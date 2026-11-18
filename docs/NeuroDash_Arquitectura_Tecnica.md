# Arquitectura técnica — NeuroDash CORE (as-built)

Este documento describe la arquitectura **que está implementada** en el repositorio.
No es una propuesta de arquitectura futura: es el reflejo del código actual.

---

## 1. Veredicto de arquitectura

> **Monolito modular en Python/FastAPI + frontend React/TypeScript/Vite + un motor
> temporal + un modelo predictivo individual por infante (regresión logística) +
> perfiles demo preentrenados con historiales sintéticos + inferencia síncrona +
> persistencia en archivos JSON + reentrenamiento versionado.**

No hay microservicios, Kafka, Redis, Kubernetes ni infraestructura IoT. La separación
importante es **lógica**, no física:

```text
Frontend (React)
      ↓  /api/v1 + Prediction Contract v2
API FastAPI
      ↓
Prediction Service
      ↓
Temporal Context (cutoff) + Baseline individual
      ↓
Feature Engine (ventanas 1/3/7/14 + delta + faltantes + variables del día en curso)
      ↓
Modelo individual vN ──── Confianza (cobertura de campos núcleo)
      ↓                    ↓
Explicación no causal + Abstención
      ↓
Support Selector
      ↓
Prediction Contract v2
```

El punto central: **el frontend jamás depende del algoritmo**. Cada infante tiene un
`PersonalRiskModel` versionado detrás de una interfaz estable; el algoritmo puede
evolucionar sin cambiar el contrato de producto.

---

## 2. Stack tecnológico

| Tecnología | Función |
|---|---|
| **Python 3.12+** | Dominio, motor y ML |
| **FastAPI + Uvicorn** | API `/api/v1` con OpenAPI automático |
| **Pydantic v2** | Contratos y validación (schemas de request/response) |
| **pandas** | Ingesta y construcción de datasets |
| **scikit-learn** | Regresión logística regularizada (`LogisticRegression`) |
| **joblib** | Persistencia de modelos (`model_v1.joblib`) |
| **PyYAML** | Configuración del motor (confianza, riesgo, abstención, promoción…) |
| **pytest + httpx** | Pruebas del backend |
| **React 18 + TypeScript + Vite** | Frontend |
| **Vitest + React Testing Library** | Pruebas del frontend |
| **Docker + Compose** | Demo reproducible (nginx sirve el front y reenvía `/api`) |

Lo que **no** se usa: XGBoost, SHAP, MLflow, LLM, bases vectoriales, feature store,
microservicios, colas de mensajes. La explicación se obtiene de los coeficientes del
modelo lineal (`coeficiente × valor`), no de SHAP.

---

## 3. Componentes (lógicos)

| Componente | Responsabilidad | No debe hacer |
|---|---|---|
| `Data Adapter` / repositorios | Traducir datos fuente/registros al esquema interno | Calcular riesgo |
| `Temporal Context` (`engine/temporal.py`) | Aplicar `prediction_cutoff` y filtrar datos futuros | Usar datos posteriores al corte |
| `Feature Engine` (`engine/features.py`) | Ventanas 1/3/7/14, delta vs línea base, faltantes, variables del día en curso y contexto al corte | Decidir el riesgo final |
| `Personal Baseline` (`engine/baseline.py`) | Mediana por modalidad (patrón habitual) | Comparar contra estándares clínicos |
| `PersonalRiskModel` (`ml/`) | Inferir riesgo con parámetros aprendidos | Inferir confianza o modificar datos |
| `Confidence Engine` (`engine/confidence.py`) | Cobertura sobre campos núcleo | Cambiar el score de riesgo |
| `Abstention` (`engine/abstention.py`) | Decidir si se puede emitir estimación | Inventar datos faltantes |
| `Explanation` (`engine/explanation.py`) | Traducir contribuciones a lenguaje no causal | Afirmar causalidad |
| `Support Selector` (`engine/support.py`) | Recuperar apoyos históricos + catálogo | Inventar tratamiento |
| `Prediction Contract` (`backend/app/schemas.py`) | Estabilizar backend/frontend | Exponer el algoritmo |

`Risk` y `Confidence` son objetos independientes y **nunca** se combinan en un solo
número.

---

## 4. Flujo de inferencia

```text
POST /api/v1/predictions { subject_id, prediction_cutoff }
      ↓
1. Cargar datos del infante (perfil + records + occurrences + planned_events)
2. Filtrar por cutoff (regla `intraday`: lo de hoy cuenta hasta el corte; el cierre del día desde el día siguiente)
3. Línea base (mediana) + features (ventanas + delta + faltantes + variables del día en curso)
4. Cargar modelo activo del infante (ModelRegistry)
5. predict_proba → score → riesgo (LOW/MEDIUM/HIGH)
6. Confianza (cobertura de campos núcleo)
7. Abstención (madurez < 3 días o confianza insuficiente o sin modelo)
8. Explicación (coef × valor → factores comparados con la línea base)
9. Apoyos (históricos primero, luego catálogo)
10. Prediction Contract v2 (se guarda snapshot para «Confirmar que ocurrió»)
```

### Flujo de aprendizaje

```text
predicción en T
→ transcurre el horizonte
→ «Confirmar que ocurrió» (POST /predictions/{id}/outcome)
→ se registra el outcome
→ con suficientes ejemplos: se entrena un candidato versionado
→ se compara contra el modelo activo (validación temporal, f1)
→ se promueve solo si mejora (config/promotion.yaml)
```

El reentrenamiento demo se expone en `POST /api/v1/demo/profiles/{id}/retrain`.

---

## 5. Modelo de datos (archivos por infante)

```text
data/subjects/{id}/profile.json        perfil, sensory_context, habitual_context, historical_supports
data/subjects/{id}/records.json        registros diarios (texto en raw + número en raíz)
data/subjects/{id}/occurrences.json    eventos (severity si es desregulación)
data/subjects/{id}/planned_events.json eventos planificados
data/subjects/{id}/predictions/{prediction_id}.json  snapshots de predicción
data/demo_profiles/{id}/…              perfiles demo (mismo esquema)
data/legacy_history/{id}_history.json  historial sintético de las demos
models/{id}/model_v1.joblib + registry.json   modelos entrenados y versionados
```

Cada dato temporal puede reconstruir `source_timestamp`, `availability_timestamp` y
`prediction_cutoff`. No basta con guardar una fecha.

---

## 6. Endpoints de la API

```http
GET  /health
GET  /api/v1/subjects
POST /api/v1/subjects
GET  /api/v1/subjects/{id}
GET  /api/v1/subjects/{id}/timeline?as_of=…&days=…
POST /api/v1/subjects/{id}/daily-records
POST /api/v1/subjects/{id}/end-of-day
POST /api/v1/subjects/{id}/events
POST /api/v1/subjects/{id}/planned-events
GET  /api/v1/subjects/{id}/planned-events
POST /api/v1/predictions
GET  /api/v1/predictions/{prediction_id}
POST /api/v1/predictions/{prediction_id}/outcome
POST /api/v1/demo/profiles/{id}/predict
POST /api/v1/demo/profiles/{id}/retrain
```

- Las escrituras de cuidado llevan cabeceras `X-Actor-Id` / `X-Actor-Role` (roles
  `tutor` y `system`). Son un **adapter de desarrollo**, no un proveedor de identidad
  de producción.
- Cada escritura lleva `idempotency_key` y `provenance`; los timestamps deben ser
  timezone-aware.
- El frontend **nunca envía variables calculadas**: solo texto elegido por el tutor,
  el momento y la clave de reintento. El backend codifica y calcula.

---

## 7. Configuración

```text
config/confidence.yaml      umbrales de confianza y campos núcleo
config/risk_mapping.yaml    umbrales LOW/MEDIUM/HIGH (0.3 / 0.6)
config/abstention.yaml      madurez mínima de línea base (3) y confianza mínima (LOW)
config/availability.yaml    política temporal (intraday; cierre de día desde el día siguiente)
config/training.yaml        hiperparámetros (min_samples, seed, C, solver) y horizon_hours
config/promotion.yaml       métrica de promoción (f1) y mejora mínima (0.01)
config/support_catalog.yaml catálogo validado de apoyos
```

---

## 8. Persistencia

La demo usa **archivos JSON por infante** (cero infraestructura, transparentes y
reproducibles). No hay base de datos productiva: los modelos se entrenan previamente y
se empaquetan con la app. La interfaz de repositorios (`CareRecordRepository`,
`SubjectRepository`) permite sustituir el almacenamiento (p. ej. SQLite o PostgreSQL)
sin tocar el motor ni el frontend.

---

## 9. Pruebas y verificación

- **Backend:** `uv run --extra dev pytest -q` (unitarias e integradas: temporal,
  features, baseline, confianza, abstención, training, promoción, contrato, API,
  reproducibilidad, estados de la demo).
- **Frontend:** `cd front && npm run typecheck && npm test -- --run`.
- **Todo junto:** `bash scripts/check.sh`.
- **Pipeline reproducible:** `generate_mock_histories.py` → `validate_source_data.py` →
  `train_demo_models.py` → `smoke_demo.py`. Ver
  [`NeuroDash_Reproducibility_and_Verification_Guide.md`](NeuroDash_Reproducibility_and_Verification_Guide.md).

---

## 10. Despliegue

```bash
docker compose up --build
```

- Frontend en `http://localhost:8090` (nginx sirve el build y reenvía `/api` al backend).
- Backend en `http://localhost:8000/docs`.
- `data/` y `models/` viven en los volúmenes `neuradash-data` y `neuradash-models`.
- Sin `VITE_API_BASE`, el front usa el mock en memoria (`front/src/mocks/mockBackend.ts`);
  la demo se graba contra el backend real. Ver `README.md` y
  [`guia-grabacion-demo.md`](guia-grabacion-demo.md).

---

## 11. Escalabilidad

La arquitectura actual cubre la demo y un piloto pequeño (FastAPI + JSON/SQLite). Para
más volumen, el camino natural es: persistencia en PostgreSQL, API sin estado, índices
por `subject_id` + timestamp y, más adelante, un worker para recalcular forecasts
masivos. El desacoplamiento motor ↔ frontend y el `Feature Engine` genérico permiten
añadir señales o cambiar el modelo **sin reescribir el producto**.

---

## 12. Seguridad y privacidad

- Datos demo **sintéticos y anonimizados**; sin PII real, sin nombres, sin audio, sin
  GPS, sin cámara.
- `provenance` identifica el origen (sintético o del tutor) en cada predicción.
- Antes de producción se requiere: identidad real (reemplazar `X-Actor-*`), separación
  de PII, TLS, cifrado at-rest, autorización por sujeto y políticas de retención.

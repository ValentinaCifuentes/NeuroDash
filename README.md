# NeuraDash CORE

Monolito modular: **FastAPI + engine ML** en un solo deploy, con el frontend
React/TypeScript/Vite como cliente de una API estable.

Ver `NeuraDash_Arquitectura_Tecnica_Completa` (ADR) para el detalle. Nota: el ADR
nombra la carpeta `frontend/`; en este repo es **`front/`**.

## Estructura

```text
front/          frontend React + Vite (ver front/README.md)
backend/        FastAPI: rutas, schemas, prediction_service, data_provider
engine/         temporal, features, baseline, confidence, abstention, support
ml/             dataset_builder, trainer, evaluator, model_registry, inference, explain
config/         *.yaml versionados (features, training, confidence, abstention)
data/           CSV BLUBA + perfiles demo con historial sintético
models/         artefactos entrenados por perfil (model_vN.joblib + metadata)
scripts/        generación de mocks, entrenamiento demo, smoke test
tests/          unit / demo_profiles / integration
```

Hoy solo existe `front/`; el resto se va agregando siguiendo el ADR.

## Desarrollo

Backend (terminal 1):

```bash
uv run uvicorn backend.app.main:app --reload --port 8000
```

Frontend (terminal 2):

```bash
cd front && npm install && npm run dev
```

Vite proxea `/api` a `http://localhost:8000`, así que no hay CORS en dev.

## Demo congelada

```bash
cd front && npm ci && npm run build
```

FastAPI sirve `front/dist/` como estáticos: **1 proceso, 1 URL, 0 servicios
externos**.

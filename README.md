# NeuraDash

NeuraDash is a non-diagnostic support application for caregiver records, safe
trend-oriented predictions, telemetry demonstrations, and collaboration with
professionals. It combines a FastAPI backend and a React/TypeScript frontend.

> **Safety boundary:** NeuraDash communicates uncertainty, observed
> associations, and support options. It is not a diagnostic, causal, clinical,
> or emergency decision-making tool. Do not use demo or synthetic data for
> clinical decisions.

## Current status

The repository contains a working demo and validation pipeline. The frontend
currently provides:

- Caregiver subject onboarding, daily records, event logging, and Evolution
  prediction states.
- Telemetry UI backed by a synthetic burst simulator with stable,
  accumulated-risk, and insufficient-data profiles.
- Planning and follow-up views, including **Planificación**, **Seguimiento**,
  and **Sesiones**.
- A professional view through the role switch, including the professional
  dashboard and reporting surfaces.
- Explicit mock and real-backend adapters using the same frontend contract.

Some navigation entries remain intentionally non-functional placeholders (for
example, professional search and support tickets). The ML and telemetry data
used by the demo are synthetic or local development data; this is not a
production deployment.

## Quick start

### Prerequisites

- Python 3.12 or newer
- Node.js and npm

### Install backend dependencies

From the repository root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install --upgrade pip
py -m pip install -e ".[dev]"
```

On macOS/Linux, use `python3.12 -m venv .venv`,
`source .venv/bin/activate`, and `python -m pip install -e ".[dev]"`.

### Run the backend

```powershell
uvicorn backend.app.main:app --reload --port 8000
```

Useful links while it is running:

- Health: <http://localhost:8000/health>
- OpenAPI documentation: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>

The API entry point is `backend.app.main:app`. Routes are grouped under
`/api/v1`, including subjects, daily records and events, predictions,
professional sessions, demo profiles, and telemetry.

### Run the frontend

In a second terminal:

```powershell
cd front
npm install
npm run dev
```

Open the Vite URL, normally <http://localhost:5173>.

By default, the frontend uses the in-memory fixture at
`front/src/mocks/mockApi.ts`; it does not run the ML engine and its data is
cleared on reload. To use the FastAPI backend instead:

```powershell
Copy-Item .env.example .env
# Set VITE_API_BASE=http://localhost:8000 in front/.env
npm run dev
```

The development actor headers used for protected professional operations are
not a production identity provider.

## Testing and validation

Run the backend unit and integration suite from the root:

```powershell
py -m pytest
```

Run the frontend checks from `front/`:

```powershell
npm test -- --run
npm run typecheck
npm run build
```

## Reproducibility pipeline

The deterministic pipeline generates synthetic histories, validates their
schemas, trains demo models, and runs an end-to-end smoke check. From the
repository root:

```powershell
python scripts/generate_mock_histories.py
python scripts/validate_source_data.py data/bluba/PAC-A_history.json
python scripts/validate_source_data.py data/bluba/PAC-B_history.json
python scripts/validate_source_data.py data/bluba/PAC-C_history.json
python scripts/train_demo_models.py
python scripts/smoke_demo.py
```

PAC-A and PAC-B have sufficient synthetic history for training. PAC-C is a
cold-start case and should safely abstain rather than produce a prediction.
For the full explanation of generated artifacts, lineage, and expected
outputs, see the [Reproducibility and Verification Guide](docs/NeuraDash_Reproducibility_and_Verification_Guide.md).

## Repository layout

```text
backend/app/   FastAPI application, routes, schemas, and services
engine/        Temporal features, confidence, safety, and telemetry logic
ml/            Dataset building, training, evaluation, and model registry
front/         Vite/React/TypeScript caregiver and professional UI
scripts/       Synthetic-data, training, and verification commands
tests/         Backend unit/integration tests
docs/          Product, architecture, telemetry, and verification guides
openspec/      Spec-driven development artifacts
config/        Runtime and model configuration
data/          Local demo and generated data
models/        Local generated model artifacts
```

## Privacy and production identity caveat

Use only synthetic or appropriately authorized data in development. Local
JSON telemetry, demo histories, and model artifacts are not a production data
store. Before deployment, add verified authentication, authorization and
subject-consent controls, replace the development `X-Actor-Id` and
`X-Actor-Role` headers, secure storage and transport, and complete an
appropriate privacy and clinical-safety review. Predictions must remain
non-diagnostic and uncertainty-aware.

## Further documentation

- [Product source of truth](docs/NeuraDash_Source_of_Truth_Contexto_Maestro_NeuroHack_2026_CONSISTENTE.md)
- [Technical architecture](docs/NeuraDash_Arquitectura_Tecnica_Completa_CONSISTENTE.md)
- [Telemetry guide](docs/Telemetría.md)
- [Professional dashboard](docs/NeuraDash_Dashboard_Terapeuta.md)
- [Cases and recommendations](docs/NeuraDash_Casos_y_Recomendaciones.md)
- [OpenSpec workflow](openspec/README.md)

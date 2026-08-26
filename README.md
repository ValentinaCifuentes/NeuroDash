# NeuraDash

NeuraDash is a caregiver-facing, non-diagnostic support application. The current repository state establishes the reproducible project foundation: Contract v2 types, persistence ports, Python tooling, and frontend tooling.

> **Current scope:** the FastAPI HTTP application and caregiver interface are not implemented yet. You can run the test suite and start the Vite development server, but the browser page is intentionally empty at this stage.

## Quick start

### Prerequisites

- Python 3.12 or newer
- Node.js and npm

### 1. Set up Python dependencies

From the repository root, use one of the following shells.

**PowerShell**

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install --upgrade pip
py -m pip install -e ".[dev]"
```

**macOS/Linux**

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

### 2. Run the current Python checks

```powershell
py -m pytest tests/unit/test_contract.py
```

Expected result: the Contract v2 and persistence-port tests pass.

### 3. Start the frontend development server

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The server runs successfully, but the application screen is not implemented yet.

## Validate the frontend

From `frontend/`:

```powershell
npm run build
npm test -- --run
```

`npm install` may create a local `package-lock.json`; it is not committed in the current repository state.

## What is available now

| Area | Status |
| --- | --- |
| Python dependencies and test configuration | Ready |
| Contract v2 transport schemas | Ready |
| CSV, JSON, and joblib persistence ports | Ready |
| FastAPI routes and ASGI entry point | Ready |
| Temporal feature pipeline and baseline | Ready |
| ML lifecycle and demo data | Ready |
| Caregiver UI | Ready |
| Reproducibility & Validation scripts | Ready |

## Reproducibility Pipeline

NeuraDash CORE includes a complete verification and reproducibility pipeline to validate data schema, generate synthetic histories, train models, and test predictions.

Run the following commands from the repository root:
```powershell
# 1. Generate mock histories and profiles
python scripts/generate_mock_histories.py

# 2. Validate history data schemas
python scripts/validate_source_data.py data/bluba/PAC-A_history.json

# 3. Train models for the demo profiles
python scripts/train_demo_models.py

# 4. Run the end-to-end smoke verification
python scripts/smoke_demo.py
```

## Repository layout

```text
backend/app/     Backend schemas, routes, and services
engine/          Temporal feature pipeline, confidence, and safety rules
ml/              ML dataset builder, training, evaluation, and registry
frontend/        Vite/React/TypeScript caregiver interface
scripts/         Reproducibility and verification scripts
tests/           Python unit and integration tests
docs/            Product and technical architecture guides
openspec/        Spec-driven development artifacts
```

## Safety boundary

NeuraDash is designed to communicate uncertainty and support options. It must not be used as a diagnostic, causal, or clinical decision-making tool. No clinical accuracy claims are made, and no IoT or school inputs are utilized in the CORE logic.

## Further context

- [Product source of truth](docs/NeuraDash_Source_of_Truth_Contexto_Maestro_NeuroHack_2026_CONSISTENTE.md)
- [Technical architecture](docs/NeuraDash_Arquitectura_Tecnica_Completa_CONSISTENTE.md)
- [Reproducibility & Verification Guide](docs/NeuraDash_Reproducibility_and_Verification_Guide.md)
- [Implementation plan](openspec/changes/implement-neuradash-core/tasks.md)

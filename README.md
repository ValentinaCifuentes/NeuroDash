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
| FastAPI routes and ASGI entry point | Not implemented |
| Temporal feature pipeline and baseline | Not implemented |
| ML lifecycle and demo data | Not implemented |
| Caregiver UI | Not implemented |

## Repository layout

```text
backend/app/     Backend schemas and persistence adapters
engine/          Shared Contract v2 types
frontend/        Vite/React/TypeScript frontend tooling
tests/           Python unit tests
docs/            Product source of truth and technical architecture
openspec/        Spec-driven development artifacts
```

## Safety boundary

NeuraDash is designed to communicate uncertainty and support options. It must not be used as a diagnostic, causal, or clinical decision-making tool.

## Further context

- [Product source of truth](docs/NeuraDash_Source_of_Truth_Contexto_Maestro_NeuroHack_2026_CONSISTENTE.md)
- [Technical architecture](docs/NeuraDash_Arquitectura_Tecnica_Completa_CONSISTENTE.md)
- [Implementation plan](openspec/changes/implement-neuradash-core/tasks.md)

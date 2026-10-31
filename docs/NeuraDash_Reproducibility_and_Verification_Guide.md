# NeuraDash: Reproducibility & Verification Guide

This guide details the procedures to run, validate, and verify the NeuraDash CORE end-to-end reproducibility pipeline and the test suite.

## 1. End-to-End Reproducibility Pipeline

NeuraDash CORE features a deterministic pipeline designed to generate synthetic subject histories, validate their schema, train per-subject personalized machine learning models, and produce predictions or safe abstentions.

### Overview of Scripts

All scripts are located in the `scripts/` directory:

1. **`scripts/validate_source_data.py`**:
   - Validates subject history JSON structures and schema types.
   - Ensures required fields (`records`, `occurrences`, `lineage`) are present.
   - Validates that timestamps follow ISO 8601 formatting and check modality data types.

2. **`scripts/generate_mock_histories.py`**:
   - Deterministically generates synthetic history datasets for three demo subjects (PAC-A, PAC-B, and PAC-C).
   - Saves history data under `data/bluba/{subject_id}_history.json` and profiles under `data/demo_profiles/{subject_id}/profile.json`.
   - **PAC-A**: Generates 30 days of data using seed 1001 (sufficient for training).
   - **PAC-B**: Generates 30 days of data using seed 1002 (sufficient for training).
   - **PAC-C**: Generates 2 days of data using seed 1003 (insufficient for training, triggers cold-start/abstention).

3. **`scripts/train_demo_models.py`**:
   - Trains Logistic Regression models for each subject using a temporal train/validation split.
   - Saves trained model artifacts (`model_v1.joblib` and `registry.json` metadata) in `models/{subject_id}/`.
   - PAC-A and PAC-B train successfully.
   - PAC-C triggers an `InsufficientDataError` and training is cleanly skipped, maintaining its cold-start status.

4. **`scripts/smoke_demo.py`**:
   - Simulates the caregiver onboarding and prediction workflow using the saved models.
   - Performs predictions or triggers safety abstentions.
   - **PAC-A & PAC-B**: Return active risk predictions (`LOW`, `MEDIUM`, or `HIGH`) and model scores.
   - **PAC-C**: Abstained correctly (`abstained: true`, `risk: null`, `model_score: null`) with `INSUFFICIENT` confidence.

---

## 2. Running the Pipeline

From the project root directory, run the scripts in sequence:

```powershell
# Step 1: Generate mock histories and profiles
python scripts/generate_mock_histories.py

# Step 2: Validate the generated history schemas
python scripts/validate_source_data.py data/bluba/PAC-A_history.json
python scripts/validate_source_data.py data/bluba/PAC-B_history.json
python scripts/validate_source_data.py data/bluba/PAC-C_history.json

# Step 3: Train and register demo models
python scripts/train_demo_models.py

# Step 4: Run the end-to-end smoke test
python scripts/smoke_demo.py
```

### Expected Output Summary

- **History Generation**: Files are created successfully under `data/bluba/` and `data/demo_profiles/`.
- **Validation**: Each check reports `Success: File 'PAC-X_history.json' is valid under the NeuraDash CORE schemas.`
- **Training**:
  - `Successfully trained and registered model for 'PAC-A' (version 1).`
  - `Successfully trained and registered model for 'PAC-B' (version 1).`
  - `Skipped training for 'PAC-C': Insufficient history span for subject 'PAC-C': need at least 5 days, got 2 days. (Expected cold-start behavior)`
- **Smoke Demo**: Runs and displays:
  - `PAC-A smoke verification passed.`
  - `PAC-B smoke verification passed.`
  - `PAC-C smoke verification passed (successfully abstained).`
  - `All smoke test assertions passed successfully!`

---

## 3. Configuration & Artifact Lineage Verification

To ensure reproducibility, NeuraDash tracks hashes and metadata:
- **Registry Versioning**: Every save in the `ModelRegistry` increments the version (e.g. `v1`, `v2`) and writes metadata to `registry.json` including features list, hyperparameters (`C=1.0`, `penalty=l2`), samples count, class balances, and generator seeds.
- **Reproducibility Guarantee**: The synthetic generator (`generate_synthetic_history`) uses explicit random seeds. Generating data twice with the same seed yields identical values down to the float decimal.
- **Lineage Metadata**: All prediction outputs embed `provenance` metadata. For active predictions, the model version, training metrics, and exclusion states are captured in the contract.

---

## 4. Synthetic-Data and CORE Logic Limitations

> [!IMPORTANT]
> **No Clinical Claims & Diagnostic Safety**
> NeuraDash CORE is a support utility designed to enhance family routine awareness.
> - **No Clinical Accuracy Claims**: The predictions represent technical statistical correlations and must not be interpreted as medical diagnoses, clinical trials, or statements of absolute certainty.
> - **No IoT Sensors Dependency**: The CORE engine relies purely on daily subjective caregiver records (sleep quality, wake state, etc.) and does not depend on wearable or external IoT telemetry.
> - **Exclusion of School Records**: School data adapters are isolated from the CORE predictor. If school records are supplied, they are marked as excluded (`excluded_from_core: true` in the contract provenance) to prevent biasing personal model features.

---

## 5. Testing Evidence

### Backend Pytest Suite
The full suite of unit and integration tests is run via:
```powershell
py -m pytest
```
All tests pass successfully. The suite verifies:
- `tests/unit/test_contract.py`: Pydantic model validations.
- `tests/unit/test_temporal.py`: Timezone handling and prior-day restrictions.
- `tests/unit/test_features.py`: Aggregations and baseline calculations.
- `tests/unit/test_ml.py`: Trainer reproducibility, dataset building, andRegistry versioning.
- `tests/unit/test_safety.py`: Confidence thresholds, non-causal explanation formatting, and support ranking.
- `tests/unit/test_promotion.py`: Model evaluation, accuracy thresholds, and promotion logs.
- `tests/integration/test_api.py`: FastAPI endpoints, validation failures (HTTP 422), and retrain routing.
- `tests/integration/test_reproducibility.py`: Full reproducibility E2E flow.

### Frontend Vitest Suite
The frontend components are verified via:
```powershell
npm test -- --run
```
All component test cases pass, confirming:
- Mobile-responsive caregiver layout (390px viewport).
- Absence of clinical jargon or causal statements.
- Dynamic support rendering and proper warning states for abstained subjects.

---

## Integration API and Privacy Runbook

Start the backend from the repository root with `uvicorn backend.app.main:app --reload --port 8000`.
The development transport identifies a caregiver actor with `X-Actor-Id` and
`X-Actor-Role` headers. These headers are a development adapter, not a production
identity provider; production deployment must replace them with a verified
identity-to-subject permission source.

Care writes require a timezone-aware `occurred_at`, `idempotency_key`, and
provenance. Use the same idempotency key when retrying a write or an outcome
confirmation. Prediction reload and outcome endpoints require actor headers and
enforce the subject authorization lists on the server. The supported actor roles
are `tutor` (the caregiver) and `system`.

Predictions are created with a timezone-aware `prediction_cutoff`. Every
prediction cutoff includes only records whose availability timestamp is at or
before that cutoff. End-of-day records become available at the following local
midnight, so they cannot influence an earlier snapshot. Snapshot reload and
outcome retries preserve the original prediction identity and provenance.

For the current integration checks, run:

```powershell
uv run --no-sync pytest -q
npm --prefix front test -- --run
npm --prefix front run typecheck
npm --prefix front run build
git diff --check
git status --short -- frontend
```

`front/node_modules/`, `front/dist/`, and prediction JSON generated during local
runs are ignored. The legacy `frontend/` directory is excluded from this change
and must remain untouched.

## Caregiver UI demo state

The Vite application uses the in-memory mock adapter when `VITE_API_BASE` is
not configured. The demo starts with subject `PAC-002` and a deterministic
29-day history for the **Seguimiento** view. That history is intentionally
separate from today's prediction input.

To see a prediction in **Evolución**:

1. Select `PAC-002`.
2. Open **Bitácora diaria** and save today's basal state.
3. Open **Evolución** and select **Próximas 24 horas**.

Without today's basal record, the safe expected result is an abstention
(`INSUFFICIENT`), not a fabricated risk estimate. Mock records and outcomes
are held in browser memory and are cleared on reload. The mock prediction
adapter compares the cutoff with the caregiver's local calendar date, while
the API contract continues to transport timezone-aware instants.

To use the FastAPI integration instead, create `front/.env` from
`front/.env.example` and set `VITE_API_BASE=http://localhost:8000`.

## SDD Integration Traceability

| Tasks | Delivered behavior and evidence | Rollback boundary |
| --- | --- | --- |
| 1.1–1.3 | Care replay, timezone validation, timeline cutoff, and local end-of-day eligibility; FastAPI TestClient care and prediction-cutoff suites. | Care repository, subject routes, and their focused integration tests. |
| 2.1–2.3 | Caregiver-only actor model (`tutor`/`system`) with subject authorization; server-side role validation and privacy checks. | Subject routes, schemas, and their focused integration tests. |
| 3.1–3.3 | Immutable cutoff-bound snapshots and actor-bound idempotent outcomes; prediction/outcome TestClient suite. | Prediction service/routes/schema/promotion files and prediction integration tests. |
| 4.1–4.3 | Real/mock Contract v2 parity, safe retry/error states, and safe Evolucion rendering; Vitest/RTL plus typecheck/build. | `front/src` adapter, mocks, affected pages, and their tests. |
| 5.1–5.3 | Bounded suite verification, runbook/hygiene checks, and final task-to-evidence review. | This runbook, release-hygiene test, SDD task/progress artifacts, and ignore rules only. |

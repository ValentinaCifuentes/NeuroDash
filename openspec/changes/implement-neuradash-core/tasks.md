# Tasks: Implement NeuraDash CORE

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,800–2,600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | No-merge tracker branch/PR for this change; PR 1 targets tracker; PR 2→PR 7 each target the immediate prior PR branch; only tracker merges to main |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Tooling, policy, schemas, storage ports | PR 1 (base: tracker branch/PR) | `pytest tests/unit/test_contract.py` | N/A—foundation only | manifests/config/types |
| 2 | Temporal pipeline, baseline, features | PR 2 (base: PR 1 branch) | `pytest tests/unit/test_temporal.py tests/unit/test_features.py` | `python scripts/validate_source_data.py` | `engine/temporal.py`, `baseline.py`, `features.py` |
| 3 | Personal ML lifecycle and demo data | PR 3 (base: PR 2 branch) | `pytest tests/unit/test_ml.py tests/integration/test_reproducibility.py` | `python scripts/generate_mock_histories.py && python scripts/train_demo_models.py` | `ml/`, `data/demo_profiles/`, `models/` |
| 4 | Safety contract, supports, outcomes, promotion | PR 4 (base: PR 3 branch) | `pytest tests/unit/test_safety.py tests/integration/test_promotion.py` | `python scripts/smoke_demo.py` (API not yet required) | safety modules and lifecycle routes |
| 5 | FastAPI wiring and errors | PR 5 (base: PR 4 branch) | `pytest tests/integration/test_api.py` | `uvicorn backend.app.main:app` + httpx scenario | `backend/app/` |
| 6 | Caregiver UI and contract-only rendering | PR 6 (base: PR 5 branch) | `npm test -- --run` | `npm run dev`, 390px profile/onboarding flow | `frontend/` |
| 7 | Deterministic docs and end-to-end smoke | PR 7 (base: PR 6 branch; tracker-only merge to main) | `pytest && npm test -- --run` | validate→generate→train→API/UI smoke | `scripts/`, docs, smoke tests |

## Phase 1: Foundation and Dependencies

- [x] 1.1 RED: add runner/tooling checks and failing contract/port tests; GREEN: create `pyproject.toml`, frontend manifests, pytest/httpx/Vitest/RTL configuration; REFACTOR: pin reproducible dependencies and commands.
- [x] 1.2 RED: test Pydantic/TypeScript Contract v2 parity, including top-level nullable non-clinical `model_score`; GREEN: create `engine/schemas.py`, `backend/app/schemas.py`, and typed frontend models; REFACTOR: centralize versioned enums/metadata.
- [x] 1.3 RED: test CSV/JSON/joblib and atomic audit boundaries; GREEN: create provider protocols and adapters in `backend/app/data_provider.py`; REFACTOR: isolate filesystem concerns.

## Phase 2: Temporal, Baseline, and Features

- [x] 2.1 RED: test aware timestamps, cutoff equality/future exclusion, naive rejection, provenance, and conservative exclusion; GREEN: implement `engine/temporal.py` and `config/availability.yaml`; REFACTOR: make policy injectable.
- [x] 2.2 RED: test prior-day-only regulation, 1/3/7/14-day windows, missingness, and sensory-never-baseline-risk; GREEN: implement `engine/baseline.py`, `engine/features.py`, schemas, and feature policy; REFACTOR: remove duplicated window logic.

## Phase 3: Personal ML Lifecycle

- [x] 3.1 RED: test X(T)→y(T) `(T,T+24h]`, temporal split, labels, lineage, seeded synthetic limits; GREEN: implement `ml/dataset_builder.py`, deterministic generators, and `data/bluba/`; REFACTOR: make lineage metadata explicit.
- [x] 3.2 RED: test repeated training equality, subject-local artifacts, no profile-risk branch, cold-start abstention, and registry versioning; GREEN: implement `ml/{trainer,evaluator,model_registry,inference,explain}.py`, configs, and PAC fixtures; REFACTOR: share one inference path.

## Phase 4: Safety, Outcomes, and API

- [x] 4.1 RED: test confidence separation/monotonic coverage, abstention HTTP semantics, non-causal factors, provenance, support ordering/prohibitions, and school `excluded_from_core`; GREEN: implement `engine/{confidence,abstention,explanation,support,provenance}.py` and `engine/schemas.py` adapter boundary; REFACTOR: enforce no hardcoded profile risk.
- [x] 4.2 RED: test manual outcome lineage, configured temporal promotion, audit/non-promotion, and active-model preservation; GREEN: implement `ml` lifecycle persistence and `backend/app/routes/outcomes.py`; REFACTOR: make audit writes atomic.
- [x] 4.3 RED: test onboarding cold start, cutoff-safe timeline/prediction, 404/422/500 sanitization, and Contract v2 transport; GREEN: implement `backend/app/{main,prediction_service}.py` and routes for subjects, predictions, demos; REFACTOR: centralize error mapping.

## Phase 5: Caregiver Experience

- [x] 5.1 RED: add RTL tests for profile-first onboarding, safe result, empty/abstained state, accessibility, and absence of `model_score`, algorithm, diagnosis, causal language; GREEN: create typed API client and `frontend/src/**` components/styles; REFACTOR: enforce 44px targets, focus, contrast, reduced motion.

## Phase 6: Reproducibility and Delivery Proof

- [x] 6.1 RED: add deterministic script/e2e assertions for validate→generate→train→load→predict/abstain across PAC-A/B/C; GREEN: create `scripts/{validate_source_data,generate_mock_histories,train_demo_models,smoke_demo}.py`, fixtures, and integration smoke; REFACTOR: document synthetic-data limitations and no IoT/school inputs.
- [x] 6.2 RED: add docs/checks for configuration hashes, artifact lineage, and reproducible commands; GREEN: document setup and evidence; REFACTOR: run full unit, integration, reproducibility, and UI suites and record outputs.

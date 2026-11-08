# Design: Implement NeuraDash CORE

## Technical Approach

Build a Python 3.12 FastAPI + React/TypeScript/Vite modular monolith. File-backed adapters provide CSV/JSON/joblib persistence behind ports; one deterministic regularized `LogisticRegression` artifact is trained and loaded per anonymous subject. The same cutoff-safe service path serves PAC-A/B/C and real onboarding; profile selection never selects risk. Prediction Contract v2 is the only frontend dependency.

## Architecture Decisions

| Decision | Choice | Alternatives / rationale |
|---|---|---|
| Runtime boundary | `engine/` owns baseline, temporal, features, confidence, abstention, explanation, support, provenance; `ml/` owns dataset/training/evaluation/registry/inference; `backend/app/` composes them. | No microservices or UI risk logic: preserves independently testable safety responsibilities. |
| Persistence | `CsvJsonDataProvider`, JSON audit stores, and joblib artifacts, all behind Protocol interfaces. | No SQLite: transparent deterministic demo now; replace adapters later. Atomic replace writes protect local audit files, not concurrency. |
| Model | One fixed-seed, regularized `LogisticRegression` per subject, coefficient-contribution explainer. | No boosting/XGBoost or SHAP: deliberately constrained initial model and dependency surface. |
| Policy | Versioned YAML policy bundle, copied/hashes recorded in artifacts and predictions. | No embedded thresholds: target severity, availability, features, risk mapping, confidence/abstention, seed, training/promotion, catalog are explicit configuration. |

## Data Flow

```text
CSV/JSON + demo history -> DataProvider -> TemporalContext(cutoff)
 -> Baseline + FeatureSet(1/3/7/14d, provenance) -> active joblib model
 -> Risk | Confidence -> Abstention -> Explanation + SupportSelector
 -> Prediction Contract v2 -> FastAPI -> typed React state
                         -> prediction snapshot -> manual outcome -> dataset
                         -> temporal candidate evaluation -> audit/promotion
```

Every source record has aware `source_timestamp` and `availability_timestamp`; only `availability_timestamp <= prediction_cutoff` is eligible. Daily regulation is prior-day-only. `X(T)` is cutoff-safe and `y(T)` is moderate/severe occurrence in `(T,T+24h]`. Sensory context is captured for contextual features but can never set or select baseline risk. Synthetic records carry origin/seed/schema lineage; resulting metrics demonstrate QA and reproducibility only, never clinical accuracy.

## File Changes

| File area | Action | Description |
|---|---|---|
| `pyproject.toml`, `backend/app/{main,schemas,data_provider,prediction_service}.py`, `backend/app/routes/{subjects,predictions,demo_profiles,outcomes}.py` | Create | FastAPI composition, Pydantic v2 API models, ports/adapters, safe routes/errors. |
| `engine/{schemas,temporal,baseline,features,confidence,abstention,explanation,support,provenance}.py` | Create | Explicit, separate domain modules and policy evaluation. |
| `ml/{dataset_builder,trainer,evaluator,model_registry,inference,explain}.py` | Create | Deterministic subject-local lifecycle and versioned artifact operations. |
| `config/{target,availability,features,risk_mapping,confidence,abstention,training,promotion,support_catalog}.yaml` | Create | Versioned open policy values. |
| `data/legacy_history/`, `data/demo_profiles/PAC-{A,B,C}/`, `models/PAC-{A,B,C}/` | Create | Source anchor, provenance-labelled onboarding/history/outcomes, generated datasets/artifacts/metadata/registry/audits. |
| `scripts/{validate_source_data,generate_mock_histories,train_demo_models,smoke_demo}.py` | Create | Deterministic validate → generate → train → API/contract smoke sequence. |
| `frontend/{package.json,vite.config.ts,src/**}` | Create | Typed client, `PredictionContractV2`, profile-first/onboarding and result components; CSS tokens derived from the design system. |
| `tests/{unit,demo_profiles,integration}/`, `frontend/src/**/*.test.tsx` | Create | Pytest/httpx and Vitest/RTL coverage. |

## Interfaces / Contracts

Routes: `POST /api/v1/subjects`, `GET /api/v1/subjects/{id}`, `GET /api/v1/subjects/{id}/timeline?as_of&days`, `POST /api/v1/predictions`, `POST /api/v1/predictions/{id}/outcome`, `POST /api/v1/demo/profiles/{id}/predict`, and `POST /api/v1/demo/profiles/{id}/retrain`. Subject creation requires anonymous ID, validated IANA timezone, sensory/habitual context, and historical supports; it returns subject ID, provisional baseline, and `cold_start`, never personal-model/risk claims before labels. Prediction requests accept subject ID and aware cutoff, never client features. Unknown IDs return 404; invalid/naive input 422; corruption sanitized 500. Abstention is HTTP 200 with null risk, INSUFFICIENT confidence, reason, missing data, and priority request.

Pydantic and TypeScript mirror Contract v2: identity/cutoff/horizon, nullable risk, top-level `model_score` (non-clinical technical value), independent confidence/abstention, factors, missingness, supports, provenance, and versioned technical metadata. Caregiver components never render `model_score`, algorithm, diagnosis, causal language, or diagnostic claims. Factors and all caregiver copy are non-causal and non-diagnostic. Supports are selected in order: subject historical, versioned local validated catalog, then explicit no-evidence; never invented, LLM-generated, or clinically prescriptive. `SchoolRecordAdapter` accepts structured records but emits observable `excluded_from_core` provenance and no feature input.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit | aware timestamps, cutoff equality/future exclusion, prior-day regulation, sensory-never-baseline-risk, windows, baseline, monotonic confidence, abstention, support order/no-evidence | RED pytest invariants before modules. |
| ML/repro | labels/horizons, deterministic generation/training, PAC artifact separation, temporal split, candidate non-promotion/promotion audit | fixed seed and fixture lineage; never random-row validation. |
| API/UI | Contract parity including top-level non-clinical `model_score`, onboarding cold start, 404/422/200 abstention, cutoff-safe timeline, profile path, non-causal/non-diagnostic factors and copy, no algorithm/score rendering | httpx; Vitest/RTL. UI uses 390px mobile-first layout, 44px targets, text+color states, 4.5:1 text contrast, visible focus, semantic controls, reduced motion. |
| Smoke | validate, generate, train, load each artifact, predict/abstain | deterministic script; optional Playwright only after contract stability. |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is designed. HTTP API routes are ordinary in-process FastAPI handlers.

## Migration / Rollout

No migration required. Generated artifacts are reproducible and may be regenerated from versioned inputs; preserve registry/audit history. Do not choose a chain strategy here; tasks must estimate work and the orchestrator applies the workload guard.

## Open Questions

- [ ] Confirm eventual availability timestamps and target severity policy before any real-data claim.
- [ ] Confirm future school-record schema and source guarantees; it remains excluded from CORE.

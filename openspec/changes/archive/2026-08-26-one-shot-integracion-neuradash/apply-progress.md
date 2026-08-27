# Apply Progress: One-shot NeuraDash Integration

## PR1 Care Carry-forward

- [x] 1.1 Reconciled Contract v2 prediction DTO expectations and added a prediction-path temporal-isolation regression: later events and end-of-day writes cannot alter an existing cutoff-bound snapshot.
- [x] 1.2 Adopted daily record, event, timeline, replay, aware timestamp, and local end-of-day behavior.
- [x] 1.3 Centralized cutoff eligibility and retained compatibility with onboarding JSON persistence.

### TDD Cycle Evidence
| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| 1.1 | `test_later_event_and_end_of_day_cannot_rewrite_an_existing_prediction_snapshot` failed first: snapshot reload returned 404 because lookup bypassed the configured subject store | `uv run --no-sync pytest tests/integration/test_prediction_outcomes.py -q` — 3 passed | Reused the configured subject root for snapshot lookup; Contract v2 version/no-score and cutoff-bound snapshot assertions remain explicit |
| 1.2 | Existing partial revalidated by task 1.1 contract test | 3 passed | N/A |
| 1.3 | Helper test: 1 failed, 3 passed | 4 passed | `is_cutoff_eligible` extracted; 4 passed |

### Work Unit Evidence
| Focused test | Runtime harness | Rollback boundary |
|---|---|---|
| `uv run --no-sync pytest tests/integration/test_prediction_outcomes.py tests/integration/test_care_records_cutoff.py -q` — 7 passed | FastAPI TestClient: write eligible daily record → create cutoff snapshot → write later event/end-of-day → reload identical snapshot — 3 prediction tests passed | Revert the task 1.1 changes in `routes/predictions.py` and `test_prediction_outcomes.py` together; care storage and prior prediction behavior remain intact. |

Safety net: `uv run --no-sync pytest tests/unit/test_v2_contract.py tests/integration/test_subject_onboarding.py tests/integration/test_care_records_cutoff.py -q` — 11 passed.

Delivery: feature-branch-chain PR1 targeting the feature/tracker branch; 312 source/test additions+deletions before SDD artifacts. No generated files adopted.

## PR2 Sessions and Privacy

- [x] 2.1 Added FastAPI TestClient RED coverage for authorized tutor/professional reads, denied access, persisted provenance, reload-boundary redaction, and private-note write denial.
- [x] 2.2 Completed the `front/` session transport and page integration. Safe read projections redact `internal_notes`; professional writes retain notes only in the server request, include contract provenance/idempotency, and attach configured professional actor headers.
- [x] 2.3 Added explicit out-of-scope messaging and RTL coverage for professional network and support tickets; both render without buttons or text inputs, and legacy `frontend/` remains untouched.

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 | `tests/integration/test_session_privacy.py` | FastAPI integration | N/A (new) | 2 failed (routes absent, HTTP 404) | `uv run --no-sync pytest tests/integration/test_session_privacy.py -q` — 2 passed | Authorized tutor/professional reads plus unpermitted/tutor-write denial | Authorization/projection helpers extracted; 2 passed |
| 2.2 | `front/src/sessionsApi.test.ts` | Vitest unit/transport | `src/api.test.ts` — 3 passed; `src/subjectApi.test.ts` — 2 passed | 2 failed (projection/write absent); then 1 failed (actor headers absent); then 1 failed (private write note omitted) | `npm --prefix front test -- --run src/sessionsApi.test.ts` — 3 passed | Read redaction, private professional write, and configured actor boundary | Split read projection, private draft, and write DTOs; focused suite remained 3 passed |
| 2.3 | `front/src/pages/Placeholders.test.tsx` | RTL component | N/A (new test file; existing placeholder text had no focused suite) | `npm --prefix front test -- --run src/pages/Placeholders.test.tsx` — 2 failed because explicit out-of-scope copy was absent | `npm --prefix front test -- --run src/pages/Placeholders.test.tsx` — 2 passed | Professional network and support-ticket renders independently assert title, explicit scope notice, no button, and no textbox | Extracted the shared deferred-feature notice constant; 2 passed after refactor |

### Work Unit Evidence
| Focused test | Runtime harness | Rollback boundary |
|---|---|---|
| `npm --prefix front test -- --run src/sessionsApi.test.ts` — 1 file, 3 passed; frontend safety net `npm --prefix front test -- --run src/api.test.ts src/subjectApi.test.ts src/components/SubjectGate.test.tsx src/sessionsApi.test.ts` — 4 files, 10 passed | `npm --prefix front run typecheck` — exit 0; `npm --prefix front run build` — exit 0, Vite built 46 modules | Revert `front/src/api.ts`, `front/src/types.ts`, `front/src/mocks/mockApi.ts`, `front/src/pages/Sesiones.tsx`, and `front/src/sessionsApi.test.ts` together; backend privacy persistence and prior care/onboarding work remain intact. |
| `npm --prefix front test -- --run src/pages/Placeholders.test.tsx` — exit 0, 1 file and 2 tests passed | `npm --prefix front run typecheck` — exit 0; `npm --prefix front run build` — exit 0, Vite built 46 modules | Revert `front/src/pages/Placeholders.tsx` and `front/src/pages/Placeholders.test.tsx` together; sessions/privacy and other UI work remain intact. |

Backend safety net retained: `uv run --no-sync pytest tests/integration/test_session_privacy.py -q` — 2 passed. `front/node_modules/` and build output remain untracked and excluded from the work unit. `git diff --name-only -- frontend` and `git status --short -- frontend` produced no output: `frontend/` was not modified.

Delivery: feature-branch-chain PR2 targeting the PR1 branch. Task 2.3 is an autonomous 43-line source/test slice; no predictions/outcomes work was started.

Settlement context: this passing frontend evidence remediates failed evidence revision `sha256:d699a155527c6655711544773c46c7abd4b0766e87a75ca56ad04d9e9230af3b` under native token `sha256:f1ca04050839b00b13bced2ee4b71faba617ee9c453c9a8f467e77c4f6fba55a`. No native settlement receipt was generated by this executor.

## PR3 Backend Prediction and Outcomes

- [x] 3.1 Added RED integration coverage for cutoff isolation, immutable snapshot identity/provenance, risk/confidence separation, explicit abstention/missingness, no caregiver `model_score`, and unauthenticated outcome denial.
- [x] 3.2 Added cutoff-filtered immutable snapshots, canonical create/reload routes, and actor-authorized idempotent outcome confirmation with persisted lineage.
- [x] 3.3 Centralized caregiver-safe serialization through `PredictionContractV2`; reloading a snapshot is independent from later outcome writes and excludes technical model scores.

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 3.1 | `tests/integration/test_prediction_outcomes.py` | FastAPI integration | `tests/integration/test_api.py tests/unit/test_ml.py` — 13 passed | 2 failed: missing `prediction_id` prevented safe snapshot/outcome assertions | `uv run --no-sync pytest tests/integration/test_prediction_outcomes.py -q` — 2 passed | Future event exclusion plus cold-start abstention; unauthorized outcome plus replayed authorized confirmation | N/A |
| 3.2 | `tests/integration/test_prediction_outcomes.py` | FastAPI integration | Same 13-test baseline | Existing RED assertions drove cutoff-filtered snapshot and idempotent actor-bound outcome | Focused suite — 2 passed | Positive outcome/replay and persisted actor/provenance lineage | N/A |
| 3.3 | `tests/integration/test_prediction_outcomes.py` | FastAPI integration | Focused suite — 2 passed | Reload assertion failed with HTTP 404 before canonical read route | Focused suite — 2 passed | Reload preserves prediction ID and omits `model_score` after outcome confirmation | Snapshot uses `PredictionContractV2` JSON serialization; focused suite remained 2 passed |

### Work Unit Evidence
| Focused test | Runtime harness | Rollback boundary |
|---|---|---|
| `uv run --no-sync pytest tests/integration/test_prediction_outcomes.py -q` — exit 0, 2 passed | FastAPI TestClient: onboard → future event → cutoff prediction → unauthorized outcome → authorized confirm/replay → reload — exit 0, 2 passed | Revert `backend/app/prediction_service.py`, `backend/app/routes/predictions.py`, `backend/app/schemas.py`, `ml/promotion.py`, and `tests/integration/test_prediction_outcomes.py` together; care/session behavior and persisted prior records remain intact. |

Safety net: `uv run --no-sync pytest tests/integration/test_api.py tests/unit/test_promotion.py tests/integration/test_care_records_cutoff.py -q` — 12 passed, 24 external dependency warnings. Delivery: feature-branch-chain PR3 targeting the PR2 branch; backend source/test changes are approximately 230 authored lines and exclude `front/`, legacy `frontend/`, dependencies, builds, and generated data. Native token: `sha256:0f6f3cec4f0b0221491120f82b044aeff1df8d8093c064b502de39e5a727a47a`.

## PR4 Evolucion Prediction and Outcomes Slice

- [x] 4.1a Added RTL/Vitest RED coverage for safe risk/confidence display, cutoff/provenance, abstention/missingness, outcome confirmation, and no `model_score`.
- [x] 4.2a Aligned `front/` prediction/outcome types, API, mock parity, and `Evolucion.tsx` with the canonical safe Contract v2 snapshot.
- [x] 4.3a Removed the score-based Evolucion mapping; outcome confirmation sends a stable idempotency key and errors remain announced without false success.

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.1a–4.3a | `front/src/pages/Evolucion.test.tsx` | RTL/Vitest | `src/api.test.ts src/sessionsApi.test.ts` — 6 passed | 2 tests failed against legacy shape (`missing` undefined) | `npm --prefix front test -- --run src/pages/Evolucion.test.tsx src/api.test.ts` — 4 passed | Canonical risk path and abstention path | Removed legacy score adapter; focused tests remained green |

### Work Unit Evidence
| Focused test | Runtime harness | Rollback boundary |
|---|---|---|
| `npm --prefix front test -- --run src/pages/Evolucion.test.tsx src/api.test.ts` — exit 0, 2 files/4 tests passed | `npm --prefix front run typecheck` — exit 0; `npm --prefix front run build` — exit 0, 46 modules | Revert `front/src/{api.ts,api.test.ts,types.ts,mocks/mockApi.ts,pages/Evolucion.tsx,pages/Evolucion.test.tsx}` together; prior care/session/placeholder slices remain intact. |

Safety net: `npm --prefix front test -- --run` — exit 0, 6 files/13 tests passed. `front/dist/`, `front/node_modules/`, generated data, and legacy `frontend/` were excluded. Delivery: feature-branch-chain PR4 child targeting PR3; this Evolucion-only unit is 315 authored additions+deletions across its source/tests and SDD artifacts. Native token: `sha256:e61d04aeb1855a4f54b52d9677cd684196fcfed8f539cdfcdbb0de8852562866`.

## PR4 Frontend Retries, Parity, and Hygiene Slice

- [x] 4.1 Added RTL/Vitest coverage for care timeline, session, and prediction retry flows; safe live errors, prediction retry focus, and private session/model-score non-rendering are asserted.
- [x] 4.2 Added recoverable retry UI to care history, sessions, and predictions while retaining the prior canonical Contract v2 adapters and idempotent outcome confirmation.
- [x] 4.3 Extracted shared subject identity mapping for real/mock parity and kept generated dependencies/build output plus legacy `frontend/` outside the slice.

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 4.1–4.3 | `front/src/pages/FrontendRetries.test.tsx`, `front/src/pages/Evolucion.test.tsx` | RTL/Vitest | `src/api.test.ts src/sessionsApi.test.ts src/pages/Evolucion.test.tsx` — 7 passed | 3 new cases failed: retry controls/errors absent; care/session failures were silently rendered as empty state | Focused `npm --prefix front test -- --run src/subjectApi.test.ts src/pages/FrontendRetries.test.tsx src/pages/Evolucion.test.tsx` — 7 passed | Care retry preserves history tab; session retry never renders injected private note; prediction retry focuses keyboard action then renders safe canonical risk | Shared `domain/subjectIdentity.ts` removes duplicate mock/API slug and initials mapping; approval tests stayed green |

### Work Unit Evidence
| Focused test | Runtime harness | Rollback boundary |
|---|---|---|
| `npm --prefix front test -- --run src/pages/FrontendRetries.test.tsx src/pages/Evolucion.test.tsx src/api.test.ts src/sessionsApi.test.ts` — exit 0, 4 files/10 tests passed | `npm --prefix front run typecheck` — exit 0; `npm --prefix front run build` — exit 0, 47 modules | Revert `front/src/pages/{BitacoraDiaria,Evolucion,Sesiones}.tsx`, `front/src/pages/{FrontendRetries,Evolucion}.test.tsx`, and `front/src/domain/subjectIdentity.ts`; previous Contract v2 adapters and other slices remain intact. |

Safety net: `npm --prefix front test -- --run` — exit 0, 7 files/16 tests passed. `git diff --check` passed. `git status --short -- frontend` was empty; `front/dist/` and `front/node_modules/` remain untracked/excluded. Delivery: feature-branch-chain PR4 child targeting the PR3 branch. This bounded slice adds 3 production retry paths and 3 RTL behaviors; no backend, legacy frontend, generated files, commit, or push. Native token: `sha256:c1c297de8d5d43bba0d581d2e5c54d45b6c2c40105270bef03b84236ebcd78c3`.

## PR5 Verification, Docs, and Handoff

- [x] 5.1 Ran the complete Python and frontend verification set. The initial full pytest run exposed stale pre-Contract-v2 smoke/contract expectations; the bounded compatibility fix assigns an ID to legacy direct contract construction while keeping `model_score` out of caregiver-safe contracts and snapshots. The rerun passed.
- [x] 5.2 Added an integration API/privacy/cutoff runbook, documented the production identity open question, and ignored canonical `front/` dependencies/build output plus generated prediction snapshots.
- [x] 5.3 Revalidated PR3 snapshot/outcome claims against Contract v2, updated the reproducibility smoke path to the no-score safe projection, reviewed all chain rollback boundaries, and added final task-to-evidence traceability.

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5.1 | `tests/unit/test_release_hygiene.py` | Unit/repository hygiene | N/A (new file) | 3 failed: canonical `front/` ignores and integration runbook/traceability were absent | `uv run --no-sync pytest tests/unit/test_release_hygiene.py -q` — 3 passed | Separate dependency/build ignore and runbook/traceability assertions | Ignore rules and runbook use explicit canonical `front/` paths; 3 passed |
| 5.2 | `tests/unit/test_release_hygiene.py` | Unit/documentation contract | N/A (new file) | Runbook-required API, privacy, cutoff, and traceability assertions failed | Focused hygiene suite — 3 passed | Four required runbook fields plus all five task groups | Consolidated API/privacy/cutoff and hygiene guidance in one operational section; 3 passed |
| 5.3 | `tests/unit/test_contract.py`, `tests/integration/test_reproducibility.py` | Unit + integration | Initial full pytest — 52 passed, 3 failed due to stale required `prediction_id` and score expectations | Focused contract/reproducibility run — 2 failed because direct Contract v2 construction lacked an ID; then reproducibility RED failed on removed `model_score` access | `uv run --no-sync pytest tests/unit/test_contract.py tests/integration/test_reproducibility.py tests/unit/test_release_hygiene.py -q` — 11 passed | Explicit legacy-ID generation and explicit ID preservation; trained, abstained, and no-score smoke paths | `PredictionContractV2` supplies a safe generated ID only for legacy direct construction; smoke snapshot/output remains no-score; 11 passed |

### Work Unit Evidence
| Focused test | Runtime harness | Rollback boundary |
|---|---|---|
| `uv run --no-sync pytest tests/unit/test_release_hygiene.py -q` — exit 0, 3 passed; final `uv run --no-sync pytest -q` — exit 0, 55 passed (60 external dependency warnings) | FastAPI TestClient coverage is included in the 55-test backend run; it exercises care/session/prediction/outcome flows. | Revert `.gitignore`, `docs/NeuraDash_Reproducibility_and_Verification_Guide.md`, `tests/unit/test_release_hygiene.py`, and PR5 task/progress artifacts together; prior feature behavior remains intact. |
| `uv run --no-sync pytest tests/unit/test_contract.py tests/integration/test_reproducibility.py tests/unit/test_release_hygiene.py -q` — exit 0, 11 passed | Reproducibility integration generates histories, trains PAC-A/PAC-B, verifies PAC-C abstention, and returns safe no-score contracts — exit 0, 1 integration test in the focused set. | Revert `backend/app/schemas.py`, `scripts/smoke_demo.py`, `tests/unit/test_contract.py`, and `tests/integration/test_reproducibility.py` together; canonical API snapshot/outcome behavior remains intact. |
| `npm --prefix front test -- --run` — exit 0, 7 files/16 tests passed (RTL includes keyboard/focus/retry accessibility coverage) | `npm --prefix front run typecheck` — exit 0; `npm --prefix front run build` — exit 0, 47 modules transformed | No frontend source changes in PR5; generated `front/dist/` and `front/node_modules/` are ignored and can be removed locally without behavior rollback. |

Clean staging/hygiene: `git diff --check` — exit 0; `git status --short -- frontend` — no output; `git check-ignore -v` confirmed `front/node_modules/`, `front/dist/`, and generated subject/demo prediction JSON are ignored. Legacy `frontend/` was not modified. Delivery: feature-branch-chain PR5 child targeting PR4; no commit or push. Native token continued exactly: `sha256:99b75461b4f71cca0383f81b9634ca8ff2cb1255d7f47d4cf90bca4f23b4406a`.

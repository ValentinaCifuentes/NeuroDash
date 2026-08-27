# Apply Progress: Integrate Frontend CORE Phases

## Delivery

- Delivery strategy: `ask-on-risk`, resolved as `feature-branch-chain`.
- Current work unit: PR 3 daily records, events, and end-of-day cutoff.
- Native attempt token: `sha256:2ef19f58d30ce99b133484505643dade9c02279739f9ccdb912ba23d2e7c39bd` (authenticated from the orchestrator-provided active attempt).

## Completed Tasks

- [x] 1.1 RED: Added v2 care-write contract tests for aware timestamps, provenance, stable error envelopes, actor context, and rejection before persistence can occur.
- [x] 1.2 GREEN: Added the canonical prediction adapter types and safe error/prediction mappings in `front/src/types.ts` and `front/src/api.ts`.
- [x] 1.3 RED→GREEN: Added mock-to-adapter parity coverage that proves synthetic provenance is preserved and `model_score` is not exposed by the adapter view.
- [x] 2.1 RED: Added isolated FastAPI onboarding tests for creation/selection, idempotent replay, stable IDs, and legacy-profile selection safety.
- [x] 2.2 GREEN: Added subject repository/list API plus explicit `front/` selection/onboarding gate with mock/real API parity and synthetic provenance.
- [x] 2.3 RED: Added FastAPI integration coverage for retry-safe daily/event writes, canonical provenance and author persistence, local timezone end-of-day closure, and cutoff-safe timeline projection.

## Work Unit Evidence

| Work unit | Focused test command and exact result | Runtime harness command/scenario and exact result | Rollback boundary |
|---|---|---|---|
| PR 1 contract foundation | `& ".\\.venv\\Scripts\\python.exe" -m pytest tests/integration/test_api.py -k invalid_input_validation; if ($?) { & ".\\.venv\\Scripts\\python.exe" -m pytest tests/unit/test_v2_contract.py tests/unit/test_contract.py }` → 1 passed (5 deselected), then 10 passed, exit 0 | FastAPI `TestClient` invalid-request scenario → 1 passed; frontend `npm run typecheck` → exit 0 | Revert `backend/app/schemas.py`, `backend/app/main.py`, `tests/unit/test_v2_contract.py`, and error-envelope expectations in `tests/integration/test_api.py`. |
| PR 1 frontend adapter continuation | `cd front; npm test -- src/api.test.ts` → 1 file, 3 passed, exit 0 | `cd front; npm run typecheck` → exit 0; `npm run build` → built successfully (45 modules) | Revert `front/package.json`, `front/package-lock.json`, `front/vite.config.ts`, `front/src/test/setup.ts`, `front/src/api.test.ts`, `front/src/types.ts`, and `front/src/api.ts`; this removes only the test harness and safe adapter view. |
| PR 2 onboarding and subject selection | `& ".\.venv\Scripts\python.exe" -m pytest tests/integration/test_subject_onboarding.py` → 4 passed, exit 0; `cd front; npm test -- src/subjectApi.test.ts src/components/SubjectGate.test.tsx` → 2 files, 4 passed, exit 0 | FastAPI `GET /api/v1/subjects` with persisted legacy profiles → 200, 3 selectable subjects; `cd front; npm run build` → built successfully (46 modules), exit 0 | Revert `backend/app/care_repository.py`, onboarding/list changes in `backend/app/routes/subjects.py`, and `front/src/{App,api,types}.ts`, `front/src/mocks/mockApi.ts`, `front/src/components/SubjectGate.tsx` plus their tests. |
| PR 3 care records and cutoff (partial) | `& ".\.venv\Scripts\python.exe" -m pytest tests/integration/test_subject_onboarding.py tests/integration/test_care_records_cutoff.py` → 6 passed, exit 0 | FastAPI TestClient daily/event write → replay → timeline and end-of-day local closure scenarios → 2 passed, exit 0 | Revert `CareRecordRepository` additions in `backend/app/care_repository.py`, care routes/timeline projection in `backend/app/routes/subjects.py`, and `tests/integration/test_care_records_cutoff.py`. |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `tests/unit/test_v2_contract.py` | Unit + integration | `tests/unit/test_contract.py tests/integration/test_api.py` → 13 passed | Import failed because `ActorContext`, `ApiErrorEnvelope`, and `CareWriteV2` did not exist | 16 passed after minimal schema and error-boundary implementation; final focused run: 1 integration + 10 unit tests passed | Aware timestamp/provenance and naive timestamp/error/actor paths; validation details are field-only and omit submitted input | None needed; small Pydantic models remain direct. |
| 1.2 | `front/src/api.test.ts` | Frontend unit | `npm run typecheck` → exit 0 before adapter changes | `mapPredictionResponse` and `mapApiError` were missing; 3 tests failed | `npm test -- src/api.test.ts` → 3 passed | Safe prediction view with real and synthetic provenance; stable error maps without details | None needed; mappings remain pure and direct. |
| 1.3 | `front/src/api.test.ts` | Frontend unit | `npm run typecheck` → exit 0 before adapter changes | The same RED run failed because the safe mapping exports did not exist | `npm test -- src/api.test.ts` → 3 passed | Mock prediction is mapped through the adapter, retaining `synthetic: true` and fixture provenance | None needed; mock behavior was already contract-compatible. |
| 2.1 | `tests/integration/test_subject_onboarding.py` | FastAPI integration | `tests/integration/test_api.py -k "anonymous_subject_onboarding or subject_not_found_404"` → 2 passed | `SUBJECTS_ROOT`, `GET /subjects`, and selection fields did not exist; 2 onboarding tests failed | 4 focused tests passed after the repository and routes were added | Creation, replay, legacy normalization, and legacy list projections exercise distinct persistence and compatibility paths | Extracted the JSON repository and selection projection so atomic storage and legacy compatibility remain isolated. |
| 2.2 | `front/src/subjectApi.test.ts`, `front/src/components/SubjectGate.test.tsx` | Frontend unit/component | `npm test -- src/api.test.ts` → 3 passed | Subject ID/initial exports were missing; `SubjectGate` module did not resolve | 4 onboarding adapter/component tests passed | Valid identity, blank identity, explicit existing-subject selection, and recoverable onboarding error | Added test cleanup; UI gate remains a small, focused component. |
| 2.3 | `tests/integration/test_care_records_cutoff.py` | FastAPI integration | `tests/integration/test_subject_onboarding.py` → 4 passed | Care endpoints returned 404 because no routes existed | 2 passed; final safety net 6 passed | Daily/event replay and end-of-day closure exercise distinct availability paths | Extracted subject-scoped replay persistence; timeline projection is contract-shaped. |

## Deferred Tasks

- [x] 2.1 RED: Subject onboarding/selection, replay, stable IDs, and legacy-safe selection.
- [x] 2.2 GREEN: Subject repository/routes and explicit UI subject gate.
- [x] 2.3 RED: Daily records, events, end-of-day availability, local timezone closure, and prediction temporal isolation.
- [ ] 2.4 GREEN: Subject-scoped care endpoints and retry-safe mock parity.

## Notes

- The stable FastAPI failure envelope now uses `code`, `message`, and optional `details`.
- Vitest + React Testing Library and jsdom are now configured under `front/`; the focused adapter test runs in jsdom.
- The adapter creates a caregiver-safe prediction view with risk and confidence separate, provenance visible, and no `model_score` field.
- No care-record persistence endpoint, privacy route, temporal cutoff implementation, prediction UI, placeholder, or legacy `frontend/` code was changed.
- This slice replaces the `PAC-002` bootstrap with explicit selection; care writes and predictions remain deferred until later slices.
- Backend care endpoints now persist actor, provenance, source timestamp, availability timestamp, and stable replay IDs. End-of-day availability is the next local midnight and is `prior_day_only`.
- **Blocked for task 2.4 frontend completion:** `front/node_modules/.bin/vitest.cmd` is absent. The focused frontend command exits non-zero (`vitest` not recognized), and `npm ci` cannot replace the locked `@esbuild/win32-x64/esbuild.exe` while the existing Vite dev server owns it. No frontend production or test code was changed without a runnable strict-TDD harness.

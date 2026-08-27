# Tasks: Integrate Frontend CORE Phases

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–1,000 authored lines across backend, frontend, and tests |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 contract → PR 2 onboarding → PR 3 care/cutoffs → PR 4 sessions/privacy → PR 5 prediction/outcomes |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | v2 contract and adapter parity | PR 1 | `.venv/Scripts/pytest tests -k contract` | `cd front; npm run typecheck` | schemas, fixtures, adapter only |
| 2 | onboarding and explicit subject gate | PR 2 | `.venv/Scripts/pytest tests -k subject` | `cd front; npm run build` | subject routes and onboarding UI |
| 3 | records, events, end-of-day cutoff | PR 3 | `.venv/Scripts/pytest tests -k cutoff` | FastAPI TestClient care-write/reload scenario | care repository and care pages |
| 4 | sessions and server-enforced privacy | PR 4 | `.venv/Scripts/pytest tests -k authorization` | TestClient tutor/professional/unauthorized reads | session routes and UI |
| 5 | prediction snapshots and outcomes | PR 5 | `.venv/Scripts/pytest tests -k prediction` | TestClient prediction→retry outcome scenario | prediction service/routes and follow-up UI |

## Phase 1: Contract and Foundation

- [x] 1.1 RED: add pytest/JSON fixtures for v2 DTOs, aware timestamps, stable errors, provenance, and actor context; include invalid-write non-persistence.
- [x] 1.2 GREEN: implement DTOs/error handling/actor dependency in `backend/app/schemas.py`, `engine/schemas.py`, `backend/app/main.py`; add `front/src/types.ts` and adapter mapping in `front/src/api.ts`.
- [x] 1.3 RED→GREEN: add contract-equivalence tests for `front/src/mocks/mockApi.ts`; preserve synthetic provenance and stable errors.

## Phase 2: Onboarding and Care Records

- [x] 2.1 RED: test subject creation/selection, missing-subject write rejection, atomic replay, and stable IDs in `tests/{unit,integration}/`.
- [x] 2.2 GREEN: create `backend/app/care_repository.py` and subject routes; wire explicit onboarding/active-subject gating in `front/src/App.ts` and pages.
- [x] 2.3 RED: test daily records, events, end-of-day availability, local timezone closure, and prediction temporal isolation.
- [ ] 2.4 GREEN: implement subject-scoped care endpoints in `backend/app/routes/subjects.py`; wire `BitacoraDiaria.tsx`, cutoff metadata, retry-safe writes, and mock parity.

## Phase 3: Sessions and Privacy

- [ ] 3.1 RED: test authorized tutor/professional shared reads, unauthorized denial, and `internal_notes` redaction at route and reload boundaries.
- [ ] 3.2 GREEN: implement session persistence/projections and authorization in `subjects.py`; update `Sesiones.tsx` with safe visibility and accessible errors.
- [ ] 3.3 RED→GREEN: test and preserve `Placeholders.tsx` as explicit non-functional out-of-scope views; verify `frontend/` is untouched.

## Phase 4: Prediction and Verification

- [ ] 4.1 RED: test prediction risk/confidence separation, provenance, abstention/missingness, cutoff snapshot isolation, and no caregiver `model_score`.
- [ ] 4.2 GREEN: implement canonical prediction/snapshot/outcome routes in `predictions.py`, `prediction_service.py`, and `ml/promotion.py`; make outcome confirmation idempotent.
- [ ] 4.3 RED→GREEN: add frontend adapter/UI tests for retry, focus/live status, synthetic marker, accessible errors, outcome denial, and `Evolucion.tsx` rendering.
- [ ] 4.4 Verify `.venv/Scripts/pytest`, `cd front; npm run typecheck`, and `cd front; npm run build`; record exact results per work unit.

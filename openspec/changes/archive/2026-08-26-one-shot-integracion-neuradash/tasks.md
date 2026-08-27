# Tasks: One-shot NeuraDash Integration

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900–1,300 authored lines across five vertical PRs |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 care carry-forward → PR2 sessions/privacy → PR3 prediction/outcomes → PR4 frontend/placeholders → PR5 verification/docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR/base | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Revalidate/adopt care contract | PR1 / feature branch | `pytest tests/integration/test_care_records_cutoff.py` | TestClient write→replay→cutoff | `care_repository.py`, care routes/tests only |
| 2 | Sessions and privacy | PR2 / PR1 branch | `pytest -k session` | TestClient tutor/professional/denied reads | session routes/repository/tests/UI |
| 3 | Prediction and outcomes | PR3 / PR2 branch | `pytest -k prediction` | TestClient prediction→retry outcome | prediction files/routes/tests |
| 4 | Frontend integration/placeholders | PR4 / PR3 branch | `cd front; npm test -- --run` | `npm run typecheck; npm run build` | `front/src` pages, adapter, mocks/tests |
| 5 | Verification/docs/hygiene | PR5 / PR4 branch | focused suites + build | clean staging and documented API run | docs/tests and ignore rules only |

## Phase 1: Care Carry-forward (PR1)
- [x] 1.1 RED: Re-run existing care tests and add failing prediction-path temporal isolation; reconcile Contract v2 DTO/error expectations before trusting partial PR3.
- [x] 1.2 GREEN: Complete `backend/app/routes/subjects.py` and `care_repository.py` for daily records, events, timeline, local end-of-day, aware timestamps, replay lineage, and mock-equivalent errors.
- [x] 1.3 REFACTOR: Extract shared cutoff/replay projection helpers; re-run onboarding plus care safety net and preserve persisted JSON without destructive migration.

## Phase 2: Sessions, Privacy, Placeholders (PR2)
- [x] 2.1 RED: Test tutor/professional authorized shared reads, unauthorized denial, reload-boundary redaction, and `internal_notes` never serialized.
- [x] 2.2 GREEN: Implement session persistence/projections and server-derived authorization in `subjects.py`, `schemas.py`; update `front/src/pages/Sesiones.tsx`.
- [x] 2.3 RED→GREEN→REFACTOR: Test then render `Placeholders.tsx` for professional network/support tickets as explicitly non-functional, with no submit action; prove `frontend/` untouched.

## Phase 3: Prediction and Outcomes (PR3)
- [x] 3.1 RED: Test cutoff isolation through prediction, immutable identity/provenance, risk/confidence separation, abstention/missingness, absent `model_score`, and unauthorized outcome confirmation.
- [x] 3.2 GREEN: Implement canonical snapshots/outcomes in `prediction_service.py`, `routes/predictions.py`, `ml/promotion.py`; make confirmation idempotent and actor-bound.
- [x] 3.3 REFACTOR: Centralize safe prediction serialization and verify later events/end-of-day values cannot rewrite prior snapshots.

## Phase 4: Frontend Integration (PR4)
- [x] 4.1 RED: Add Vitest/RTL tests for real/mock DTO parity, care/session/prediction retries, loading/live announcements, keyboard focus, safe errors, and no private fields/score.
- [x] 4.1a RED: Add Evolucion prediction/outcome RTL coverage for safe risk/confidence, cutoff/provenance, abstention/missingness, outcome confirmation, and no `model_score`.
- [x] 4.2 GREEN: Wire `front/src/{api.ts,types.ts,mocks/mockApi.ts,App.tsx}` and pages `BitacoraDiaria.tsx`, `Sesiones.tsx`, `Evolucion.tsx`, `Placeholders.tsx` to canonical contracts and idempotency.
- [x] 4.2a GREEN: Wire canonical prediction/outcome DTOs and idempotent confirmation into `front/src/pages/Evolucion.tsx` and real/mock adapters.
- [x] 4.3 REFACTOR: Remove duplicated mappings, preserve non-sensitive input on retry, and keep `front/node_modules`/build artifacts out of changes.
- [x] 4.3a REFACTOR: Remove legacy score-based prediction mapping from the Evolucion slice; retain only caregiver-safe Contract v2 fields.

## Phase 5: Verification, Docs, Handoff (PR5)
- [x] 5.1 RED→GREEN→REFACTOR: Run focused/full pytest, Vitest, typecheck, build, accessibility and clean-staging checks; record exact results per chain slice.
- [x] 5.2 Update `docs/` with API/run/privacy/cutoff guidance and production identity open question; confirm generated data/dependencies and legacy `frontend/` are excluded.
- [x] 5.3 Revalidate every carry-forward PR3 claim against current Contract v2, review each rollback boundary, and produce final spec/task traceability.

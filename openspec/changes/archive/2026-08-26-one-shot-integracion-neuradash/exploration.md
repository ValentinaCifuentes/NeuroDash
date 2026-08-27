## Exploration: One-shot NeuraDash Integration

### Current State
`front/` is the intended care UI, with committed v2 adapter/onboarding work on `ftr_reverse` (`b06cf3e`). The prior change's PR 3 is an uncommitted backend-only partial: daily records, events, timeline projection, replay keys, and end-of-day availability are covered by two focused FastAPI tests, but the strict frontend test harness is blocked by locked/missing local binaries.

The remaining system is not contract-complete: the daily/event UI sends legacy shapes without `occurred_at`, idempotency keys, provenance, or actor headers; sessions have UI/mock paths but no backend endpoints or redaction; and prediction request/response names differ between `front/` and the current backend. `Evolucion.tsx` still renders `model_score`, contrary to the safe adapter view. Placeholder copy also implies functional linking/tickets rather than explicitly saying out of scope.

### Affected Areas
- `backend/app/care_repository.py`, `backend/app/routes/subjects.py` — carry forward and complete the uncommitted care/cutoff foundation; add session storage, server authorization, redacted projections, and canonical timeline behavior.
- `backend/app/{routes/predictions.py,prediction_service.py,schemas.py}` and `ml/promotion.py` — align v2 prediction transport, immutable cutoff snapshots, and idempotent outcome recording.
- `front/src/{api.ts,types.ts,App.tsx,mocks/mockApi.ts}` — reconcile DTOs, actor transport, idempotency/provenance, mock parity, and safe prediction mapping.
- `front/src/pages/{BitacoraDiaria,Sesiones,Evolucion,Placeholders}.tsx` — connect records/events/end-of-day, privacy-safe sessions, outcome follow-up, and clear non-functional placeholders.
- `tests/{unit,integration}/`, `front/src/**/*.test.tsx` — add contract, replay/cutoff, authorization/redaction, snapshot/outcome, mock parity, and accessibility coverage.
- `front/node_modules/` — local generated binaries are untracked and MUST be removed from the worktree or ignored; they are not reviewable source artifacts and must not be committed.
- `openspec/changes/integra-fases-frontend-core/` and `docs/` — preserve prior evidence, document migration/actor assumptions, API contract, run/verification instructions, and explicit placeholder policy.

### Approaches
1. **One change, chained vertical work units** — Use this change as the single remaining-integration plan, but implement it as a feature-branch chain: first settle/reconcile the partial care backend, then care UI/mock parity, sessions/privacy, prediction/outcomes, and docs/generated-artifact hygiene.
   - Pros: one coherent scope and acceptance boundary; each PR remains independently testable, revertible, and under review control; partial work is audited before adoption.
   - Cons: requires an explicit carry-forward decision and a clean frontend harness before UI work.
   - Effort: High.

2. **Single implementation PR** — combine partial work and all remaining backend, UI, tests, docs, and generated-artifact cleanup.
   - Pros: one merge event.
   - Cons: infeasible under the 400-line review budget; hides contract/privacy/temporal regressions and makes rollback unsafe.
   - Effort: High.

### Recommendation
Proceed with **one named change but not one PR**. First create a carry-forward baseline from the partial PR 3: discard untracked generated binaries, preserve the uncommitted source/test diff outside a commit, rerun its focused backend tests, and reconcile it to the v2 API before marking it adopted. Then use five bounded chain slices: (1) care backend + contract repair, (2) daily/event/end-of-day UI and mock parity, (3) sessions/privacy and placeholders, (4) prediction snapshots/outcomes and safe UI, and (5) full verification/docs/artifact hygiene.

The current partial source diff is already about 279 review lines when the untracked care test is included, leaving too little room for safe completion in a 400-line slice. A one-shot implementation is therefore feasible only as a planning umbrella with chained PRs; it is not feasible as a single reviewable implementation.

### Risks
- The frontend/backend care DTO mismatch will fail real writes until timestamps, replay keys, provenance, and actor context are consistently defined and tested.
- Session privacy cannot be trusted until the backend derives roles, authorizes subject access, and strips `internal_notes`; UI visibility controls are not enforcement.
- Prediction transport currently has incompatible names (`as_of`/`horizon` versus `prediction_cutoff`) and the existing UI exposes `model_score`; both need contract-first repair.
- End-of-day records share `records.json`; snapshot eligibility must be tested through the actual prediction path, not only timeline reads.
- `npm ci` is blocked while a Vite process locks esbuild. Continuing frontend work without restoring Vitest violates strict TDD.
- Generated native binaries and old change artifacts can accidentally enter the feature chain; source/test changes must be staged separately from generated files.

### Ready for Proposal
Yes — tell the user that the change can own all remaining integration work, but approval must explicitly retain the 400-line guard and feature-branch chain. The proposal should state that carry-forward starts only after the partial PR 3 is revalidated and reconciled, and that production actor-context/role ownership plus the end-of-day closure policy remain release blockers.

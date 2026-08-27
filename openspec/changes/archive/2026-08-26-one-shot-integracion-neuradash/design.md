# Design: Complete NeuraDash Integration

## Technical Approach

Complete one integration change through a feature-branch chain, not a single implementation PR. Each vertical slice targets the preceding feature branch, is independently testable/revertible, and stays at or below 400 authored changed lines. Revalidate the uncommitted PR 3 care diff before adoption; it is not a trusted baseline. `front/` is the only UI target; legacy `frontend/` is an explicit no-touch boundary.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Carry-forward | Re-run PR 3 RED/Green evidence, reconcile its DTO/error behavior, then commit only its validated source/tests. | Commit the current diff unchanged; discard it. | The partial code has cutoff coverage but drifts from Contract v2 and lacks prediction-path proof. |
| Canonical transport | Define Contract v2 request/response DTOs once in `schemas.py`; mirror safe UI DTOs in `front/src/types.ts`; adapt only in `front/src/api.ts`. | Page-specific shapes; expose backend snapshots directly. | Keeps real/mock parity and prevents `model_score` or raw private fields reaching UI pages. |
| Privacy | Derive actor and subject authorization server-side; authorized tutors/professionals receive permitted shared projections by default; redact `internal_notes` unconditionally. | UI visibility enforcement; private-by-default sharing. | The server is the trust boundary and fulfills the sharing requirement without leaking internal notes. |
| Temporal state | Persist records, events, sessions, snapshots, and outcomes subject-scoped with atomic JSON writes, immutable IDs, provenance, actor, availability timestamp, and idempotency key. | Mutable prediction files; derived UI-only cutoff. | Preserves replay lineage and makes the actual prediction path cutoff-safe. |
| Delivery | Five chained vertical slices: care revalidation/contract; care UI/mock; sessions/privacy/placeholders; predictions/outcomes UI; verification/docs/hygiene. | One large PR. | The existing partial alone is near 279 lines; chaining protects the 400-line review budget. |

## Data Flow

```text
front pages -> api.ts (actor headers, idempotency, safe DTO) -> FastAPI routes
     mockApi.ts (same DTO/error semantics)                    -> authorization
                                                          -> subject JSON stores
                                                          -> cutoff projection
                                                          -> immutable snapshot/outcome
```

Writes validate aware timestamps and actor context before persistence. Timeline and prediction feature construction include only values whose `availability_timestamp <= prediction_cutoff`; end-of-day records become eligible at next local midnight. A prediction response exposes risk, independent confidence, abstention/missingness, cutoff, versions, and provenance, while the caregiver projection omits `model_score`. Outcome retries return prior lineage without modifying a snapshot.

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/app/{schemas.py,care_repository.py}` | Modify | Canonical care/session/snapshot/outcome DTOs and atomic replay-safe repositories. |
| `backend/app/routes/{subjects.py,predictions.py}` | Modify | Authorized/redacted care/session/timeline and prediction/outcome endpoints. |
| `backend/app/prediction_service.py`, `ml/promotion.py` | Modify | Shared cutoff filtering, immutable complete snapshots, idempotent outcomes. |
| `front/src/{types.ts,api.ts,mocks/mockApi.ts,App.tsx}` | Modify | Contract adapter, actor/idempotency transport, parity, retry states. |
| `front/src/pages/{BitacoraDiaria,Sesiones,Evolucion,Placeholders}.tsx` | Modify | Care/end-of-day, redacted sessions, safe predictions/outcomes, non-functional placeholders. |
| `tests/**`, `front/src/**/*.test.tsx`, `docs/**` | Modify/Create | Contract, privacy, temporal, parity, accessibility, API/run guidance. |
| `frontend/**` | No change | Legacy boundary; do not migrate, test, or modify it. |
| `front/node_modules/**` | Remove/Ignore | Generated local dependencies/binaries are never staged or committed. |

## Interfaces / Contracts

```ts
type ActorHeaders = { 'X-Actor-Id': string; 'X-Actor-Role': 'tutor' | 'professional' };
type ReplayWrite = { occurred_at: string; idempotency_key: string; provenance: Provenance };
type SafePrediction = { prediction_id: string; risk: Risk | null; confidence: Confidence;
  abstained: boolean; missingness: Missing[]; cutoff: string; provenance: Provenance; versions: Versions };
```

Session read DTOs omit `internal_notes`; write DTOs accept it only for authorized professionals. Outcome confirmation requires actor context and a stable idempotency key.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | DTO validation, redaction, replay lookup, cutoff eligibility, snapshot/outcome serialization | Pytest and Vitest RED tests before production code. |
| Integration | Real FastAPI care/session/prediction flows | TestClient: boundary/future/end-of-day values through prediction, authorization denial, replay lineage. |
| UI | Real/mock equivalence, loading/error/retry, keyboard/focus, hidden `model_score`/notes, placeholders | RTL/Vitest after restoring a runnable locked-free harness. |
| Verification | API docs, build/typecheck, generated-artifact exclusion | Full focused suites and clean staging review per chain slice. |

## Threat Matrix

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Documentation-like paths | N/A — no executable classification. | None. | None. |
| Git repository selection | N/A — no VCS command integration. | None. | None. |
| Commit state | N/A — chain policy is documentation, not automation. | None. | None. |
| Push state | N/A — no push automation. | None. | None. |
| PR commands | N/A — no PR command composition. | None. | None. |

## Migration / Rollout

No destructive migration. Preserve existing subject JSON; introduce optional collections and compatibility readers. Reject/reconcile malformed legacy records rather than silently making naive timestamps eligible. Roll back only the current chain slice; retain prior data and remove generated artifacts separately.

## Open Questions

- [ ] Confirm production identity-to-subject permission source before release; headers remain a development transport, not identity proof.

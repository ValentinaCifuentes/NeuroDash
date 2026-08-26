# Design: Integrate Frontend CORE Phases

`front/` becomes the only care UI. A versioned FastAPI transport contract and a thin adapter replace the current incompatible frontend/backend shapes; FastAPI owns persistence, authorization, cutoffs, and prediction semantics.

## Technical Approach

Define canonical v2 DTOs in `backend/app/schemas.py`, then implement transport-to-view-model mapping only in `front/src/api.ts`. `front/src/types.ts` contains canonical client DTOs, not a second clinical model. The UI selects/onboards a subject before allowing writes or predictions. Each vertical slice is independently testable and revertible.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Contract ownership | FastAPI exposes `contract_version: "2.0"`; adapter maps only presentation names | Keep two naming schemes | One wire vocabulary prevents drift (`as_of`/`risk_level` versus current `prediction_cutoff`/`risk`). |
| Persistence | Subject-scoped JSON repositories behind route/service functions; atomic writes and stable IDs/idempotency keys | UI-only state or route-local file code | Matches existing file persistence and makes retry, cutoff, and authorization rules testable. |
| Privacy | Server derives actor from an authentication/authorization context; shared care fields are readable by authorized tutors/professionals; strip `internal_notes` for non-authoring readers | `visible_to_tutor` client switch or client filtering | The current routes have no auth; privacy cannot be guaranteed in React. |
| Time | Require IANA subject timezone and aware ISO-8601 instants. Store `source_timestamp` and `availability_timestamp`; end-of-day regulation is available only after local-day closure and is `prior_day_only` for prediction | Date-only storage or UI cutoff filtering | Extends existing `AvailabilityPolicy` and prevents temporal leakage. |
| UI authority | Modify `front/`; leave `frontend/` untouched and do not redirect/remove it | Migrate or revive legacy shell now | The selected UI contains the accessibility and mock boundary; migration is explicitly out of scope. |

## Data Flow

```text
front page -> api.ts adapter -> FastAPI route -> authorization + repository
     ^              |                    |             -> subject JSON data
     |              v                    v
 mockApi (same DTO fixtures, synthetic)  prediction_service -> snapshot/outcome
```

```text
care write -> validate actor/subject/time -> persist availability metadata
prediction(cutoff) -> filter eligible inputs -> snapshot -> canonical result
end-of-day/outcome after cutoff ---------> never modifies that snapshot
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/app/schemas.py`, `engine/schemas.py` | Modify | Canonical v2 DTOs, error envelope, timestamps, provenance, outcome/session contracts. |
| `backend/app/main.py` | Modify | Central `code`, `message`, `details?` errors and actor-context dependency. |
| `backend/app/routes/subjects.py` | Modify | Onboarding/selection reads plus daily-record, event, end-of-day, timeline, and session endpoints. |
| `backend/app/routes/predictions.py`, `backend/app/prediction_service.py`, `ml/promotion.py` | Modify | Canonical prediction response, immutable snapshots, eligible-input filtering, idempotent outcome persistence. |
| `backend/app/care_repository.py` | Create | Subject-scoped atomic persistence, stable IDs, replay keys, and redacted read projections. |
| `front/src/{types,api,App}.ts` | Modify | Canonical client types, adapter, explicit active subject/onboarding gate; remove `PAC-002` bootstrap. |
| `front/src/pages/{Placeholders,BitacoraDiaria,Sesiones,Evolucion}.tsx` | Modify | Onboarding, care/end-of-day capture, privacy-safe sessions, outcome confirmation, retry/live status/focus preservation. |
| `front/src/mocks/mockApi.ts` | Modify | Same DTO/error/idempotency/cutoff behavior with visibly synthetic provenance. |
| `tests/{unit,integration}/` and `front/src/**/*.test.tsx` | Create/Modify | Contract, temporal, authorization, adapter, and accessibility coverage. |

## Interfaces / Contracts

All responses use `contract_version: "2.0"`; failures use:

```ts
type ApiErrorEnvelope = { code: string; message: string; details?: Record<string, string> };
type CareWrite = { subject_id: string; occurred_at: string; idempotency_key: string; provenance: Provenance };
```

Routes: `POST /subjects`, `GET /subjects`, `GET /subjects/{id}`, `POST /subjects/{id}/daily-records`, `/events`, `/end-of-day`, `GET /timeline?as_of&days`, `GET|POST /sessions`, `PUT /sessions/{session_id}`, `POST /predictions`, and `POST /predictions/{id}/outcome`. Writes require the server-derived actor. Reads return shared projections; `internal_notes` is never serialized to unauthorized actors. Prediction returns separate risk/confidence, abstention/missingness, provenance, cutoff, explanations, supports, and no caregiver-rendered `model_score`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | DTO conversion, error mapping, repository replay, redaction, local-date cutoff | RED pytest cases and shared JSON fixtures. |
| Integration | Routes, atomic persistence/reload, actor authorization, outcome retry, prediction snapshot isolation | FastAPI `TestClient` with temporary subject storage. |
| Frontend | Adapter parity, onboarding gate, synthetic marker, retries, focus/live status, no score rendering | Add Vitest/RTL to `front/`; test mock and HTTP fixtures identically. |
| E2E | Optional later smoke of each vertical slice | Playwright remains unconfigured; do not make it a gate. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

Deliver reviewable slices under 400 changed lines each: (1) contract/error/adapter fixtures, (2) onboarding and subject selection, (3) daily/events/end-of-day and cutoff, (4) sessions/privacy, (5) prediction/outcome and mock parity. Feature-flag or revert a slice without deleting persisted records. `frontend/` is frozen; inventory and migration/removal require a separate change.

## Open Questions

- [ ] The repository has no authentication/role source. Select the production actor-context provider before privacy-dependent endpoints are released.
- [ ] Define the operational local-day closure time for end-of-day availability; until then, conservatively exclude same-local-day regulation from predictions.

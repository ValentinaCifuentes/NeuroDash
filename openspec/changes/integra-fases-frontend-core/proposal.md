# Proposal: Integrate Frontend CORE Phases

## Intent

Make `front/` the integrated NeuraDash UI for onboarding, care records, sessions, and CORE prediction follow-up, replacing contract-incompatible prototype flows without moving prediction logic into the client.

## Scope

### In Scope
- Freeze one versioned API contract, stable error envelope, timezone/cutoff semantics, and provenance labels.
- Deliver staged vertical slices: (1) subject onboarding/baseline, (2) daily records and events, (3) sessions, (4) prediction display and outcome confirmation, (5) end-of-day regulation capture.
- Enforce **shared by default** visibility: authorized tutors and professionals can read daily records, sessions, and prediction outcomes; `internal_notes` remain private and server-enforced.
- Preserve accessible loading, validation, live-status, keyboard, and focus behavior; keep mock data visibly synthetic and contract-equivalent.

### Out of Scope / Placeholders
- Keep BLUBA-only professional network and support tickets as placeholders.
- Exclude calendar/future events, CONNECT, SENSE, and legacy `frontend/` migration/removal.
- Do not redesign prediction algorithms or expose end-of-day data/outcomes before their valid cutoff.

## Capabilities

### New Capabilities
- `care-record-integration`: Onboarding, daily/event/end-of-day records, and professional-session persistence with visibility rules.
- `prediction-follow-up`: Canonical prediction presentation, provenance, abstention/missingness, and idempotent outcome confirmation.

### Modified Capabilities
None; `openspec/specs/` has no existing capabilities.

## Approach

Contract first: define canonical backend DTOs and errors, test them at FastAPI and adapter boundaries, then wire each slice through a thin `front/src/api.ts` adapter. `front/` remains the sole UI authority; the backend remains the prediction authority. Treat `docs/comparacion_bluba_neuradash.md` as the scope boundary: retain BLUBA records/sessions as inputs and add NeuraDash onboarding, baseline, risk, confidence, abstention, explanations, and support outcomes.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `front/src/{api,types,App}.ts` | Modified | Contract adapter and subject lifecycle |
| `front/src/pages/` | Modified | Staged care and prediction flows |
| `backend/app/routes/{subjects,predictions}.py` | Modified | Canonical endpoints and server authorization |
| `backend/app/schemas.py`, `engine/schemas.py` | Modified | Versioned transport contract |
| `docs/comparacion_bluba_neuradash.md` | Referenced | Product-scope authority |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Contract or error drift | High | Contract fixtures and API/adapter tests before wiring |
| Temporal leakage | Medium | Explicit availability/cutoff tests |
| Privacy leakage | Medium | Server-side authorization tests; UI is not the control |
| Review overload | High | Slice delivery within the 400-line budget |

## Rollback Plan

Feature-flag or revert each vertical slice, retain the explicit mock boundary for local development, and preserve persisted records without schema-destructive rollback.

## Dependencies

- Canonical contract and authorization decisions must precede UI wiring.

## Acceptance Direction

- [ ] Each slice consumes the same tested contract in real and mock modes, with synthetic provenance visible.
- [ ] Tutors/authorized professionals share allowed records and outcomes; internal notes are never returned to unauthorized users.
- [ ] End-of-day fields and outcome confirmations cannot affect earlier predictions.
- [ ] Placeholder routes remain non-functional and clearly excluded.

## Proposal Question Round

Assumptions for user review: the stated sharing rule covers all authorized professionals; onboarding creates the subject used by the UI; and legacy `frontend/` stays untouched. A second product-question round can refine these before design.

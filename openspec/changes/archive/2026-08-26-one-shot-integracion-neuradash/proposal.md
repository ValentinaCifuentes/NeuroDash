# Proposal: Complete NeuraDash Integration

## Intent

Complete the remaining `front/` to backend integration without compromising temporal correctness, privacy, or reviewability. Adopt PR 3 source/test work only after it is revalidated and reconciled with Contract v2.

## Scope

### In Scope
- Finish daily records, events, timeline projection, replay safety, and local end-of-day cutoff.
- Persist sessions with server-derived authorization: authorized tutors/professionals share permitted data; `internal_notes` stay private.
- Align prediction snapshots and idempotent outcomes with safe frontend presentation.
- Wire UI, real/mock contract parity, accessibility coverage, tests, API/run documentation, and generated-artifact hygiene.

### Out of Scope
- Professional network and support tickets remain explicitly non-functional placeholders.
- Prediction-model redesign, legacy `frontend/` migration, and calendar/future-event work are deferred.

## Capabilities

### New Capabilities
- `care-journey-integration`: Subject-scoped daily/event/end-of-day records and privacy-safe sessions.
- `prediction-outcome-integration`: Cutoff-bound prediction snapshots, safe presentation, and replay-safe outcome recording.

### Modified Capabilities
None; `openspec/specs/` does not exist.

## Approach

Deliver one feature-branch chain, never one implementation PR: (1) audit/adopt PR 3 care backend, (2) care UI and mock parity, (3) sessions/privacy/placeholders, (4) predictions/outcomes UI, (5) verification/docs/hygiene. Each vertical slice must remain at or below 400 changed lines and independently revertible. Restore the strict frontend test harness before frontend changes; stage source/tests separately from generated files.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `backend/app/{care_repository.py,routes/subjects.py}` | Modified | Care, cutoff, sessions, authorization, redaction |
| `backend/app/{routes/predictions.py,prediction_service.py,schemas.py}`, `ml/promotion.py` | Modified | Snapshot/outcome contract |
| `front/src/{api.ts,types.ts,App.tsx,mocks/mockApi.ts,pages/}` | Modified | Contract-safe care, sessions, predictions, placeholders |
| `tests/`, `front/src/**/*.test.tsx`, `docs/` | Modified | Verification and operational guidance |
| `front/node_modules/` | Removed/Ignored | Never commit generated dependencies or binaries |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| PR 3 drift or oversized adoption | High | Revalidate, reconcile, and split before commit |
| Privacy or temporal leakage | High | Server authorization/redaction and actual prediction-path cutoff tests |
| Frontend harness unavailable | Medium | Restore Vitest before UI work |

## Rollback Plan

Revert the affected chain slice only; retain persisted data and prior slices. Do not use destructive schema rollback. Remove generated artifacts from staging/worktree separately.

## Dependencies

- Validated PR 3 baseline, Contract v2 alignment, and runnable strict frontend test harness.

## Success Criteria

- [ ] Daily/event/end-of-day writes are replay-safe and cutoff-correct through prediction paths.
- [ ] Authorized shared reads are server-enforced and never expose `internal_notes`.
- [ ] Predictions/outcomes use canonical snapshots without caregiver `model_score`.
- [ ] Each chain PR is independently tested, revertible, and within 400 changed lines.
- [ ] Placeholders are clearly non-functional; generated dependencies/binaries are excluded.

# Care Journey Integration Specification

## Purpose

Define subject-scoped care records, events, sessions, end-of-day visibility, and privacy-safe integration for `front/` without changing the legacy `frontend/` boundary.

## Requirements

### Requirement: Canonical care records and replay safety

The system MUST accept timezone-aware records and events containing subject identity, occurrence/availability timestamps, actor context, provenance, and an idempotency identity. Replays MUST return the original result without duplicate data or altered provenance.

#### Scenario: Save and replay a record
- GIVEN an authorized caregiver submits a valid record
- WHEN the same idempotent request is submitted twice
- THEN one canonical record remains and both responses identify the same provenance

#### Scenario: Reject unsafe input
- GIVEN a naive timestamp, unknown subject, or missing actor context
- WHEN a write is attempted
- THEN nothing is persisted and a stable safe error identifies the invalid condition

### Requirement: Cutoff-safe care timeline

The system MUST project records and events by subject and cutoff, including data available exactly at the cutoff and excluding later data from the timeline and every prediction input path. End-of-day closure MUST be explicit and local-timezone aware.

#### Scenario: Boundary and future event
- GIVEN one event available at the cutoff and one after it
- WHEN the timeline and prediction are requested
- THEN only the boundary event is visible and eligible

#### Scenario: End-of-day request
- GIVEN the local day is not closed
- WHEN end-of-day data is requested
- THEN it is marked unavailable and cannot influence an earlier prediction

### Requirement: Authorized sharing with private notes

The server MUST derive authorization from actor context. Authorized tutors and professionals share permitted records, sessions, and outcomes by default; `internal_notes` MUST remain private and MUST NOT be exposed through any read projection.

#### Scenario: Shared authorized read
- GIVEN an authorized tutor or professional requests a subject projection
- WHEN access is evaluated
- THEN permitted fields are returned and `internal_notes` is omitted

#### Scenario: Unauthorized read
- GIVEN an actor lacks subject permission
- WHEN protected data is requested
- THEN access is denied without protected content leakage

### Requirement: UI boundary and placeholders

The integrated UI MUST use `front/` and equivalent real/mock contracts, expose accessible loading/error/retry states, and label professional-network and support-ticket features as non-functional out of scope with no submit action. `frontend/` MUST remain untouched.

#### Scenario: Mock/real parity
- GIVEN identical valid care operations
- WHEN real and mock transports are used
- THEN DTOs, provenance, errors, and visible states are contract-equivalent

#### Scenario: Placeholder rendering
- GIVEN a user opens either deferred feature
- WHEN it renders
- THEN it states that the feature is out of scope and offers no functional submission

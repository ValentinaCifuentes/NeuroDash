# Care Record Integration Specification

## Requirements

### Requirement: Canonical care API and adapter

The backend and adapter MUST use one versioned, timezone-aware DTO vocabulary and an error envelope with `code`, `message`, and optional field details. Mock and real transports MUST be equivalent.

#### Scenario: Contract-compatible request
- GIVEN a valid record
- WHEN either transport submits it
- THEN the canonical response shape and provenance match

#### Scenario: Validation failure
- GIVEN an invalid field or timestamp
- WHEN submitted
- THEN nothing persists and the envelope identifies the failure

### Requirement: Subject onboarding and selection

The system MUST create a subject with identity, timezone, and baseline inputs before associated data or predictions. Selection MUST be explicit, never hard-coded.

#### Scenario: Onboard and select
- GIVEN valid onboarding data
- WHEN completed
- THEN the subject is persisted and selectable

#### Scenario: Missing subject
- GIVEN no active subject
- WHEN a care or prediction action is attempted
- THEN an actionable error appears and no orphan write is sent

### Requirement: Daily records and events persist safely

The system MUST persist daily records and events with subject, author, timezone, and provenance. Writes MUST be retry-safe; reads MUST honor cutoffs.

#### Scenario: Save and reload care data
- GIVEN an authorized caregiver submits care data
- WHEN saved and reloaded
- THEN it appears once with canonical timestamp and provenance

#### Scenario: End-of-day cutoff
- GIVEN the prediction cutoff has not passed
- WHEN end-of-day data is requested
- THEN it is excluded and cannot influence earlier predictions

### Requirement: Shared visibility by caregiver

Authorized tutors MUST share daily records and outcomes by default.

#### Scenario: Authorized shared read
- GIVEN an authorized tutor
- WHEN allowed data is read
- THEN shared fields return

#### Scenario: Unauthorized read
- GIVEN an unauthorized user requests protected data
- WHEN the server evaluates access
- THEN it denies access without content leakage

### Requirement: Explicit placeholders and legacy policy

Support-ticket routes MUST remain clearly labeled non-functional placeholders. `front/` MUST remain the sole UI authority; `frontend/` MUST be untouched by this change.

#### Scenario: Placeholder use
- GIVEN a user opens a placeholder
- WHEN it renders
- THEN it states “out of scope” and offers no submit action

#### Scenario: Legacy isolation
- GIVEN this change is applied
- WHEN build references are evaluated
- THEN `frontend/` remains untouched and cannot implicitly become production UI

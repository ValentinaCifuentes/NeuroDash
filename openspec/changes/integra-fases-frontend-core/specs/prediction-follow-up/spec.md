# Prediction Follow-up Specification

## Requirements

### Requirement: Canonical prediction lifecycle and provenance

The backend MUST own prediction creation, snapshots, cutoffs, provenance, risk, confidence, missingness, abstention, explanations, and outcomes. The adapter MUST map them without semantic duplication. `model_score` MUST NOT be caregiver-rendered.

#### Scenario: Render a CORE prediction
- GIVEN a valid prediction
- WHEN displayed
- THEN risk and confidence are separate and provenance is visible

#### Scenario: Synthetic prediction
- GIVEN mock mode is active
- WHEN displayed
- THEN it is visibly synthetic and contract-equivalent to real mode

### Requirement: Safe prediction availability

The system MUST exclude unavailable inputs and expose abstention/missingness. End-of-day fields and outcomes MUST NOT affect predictions created before their valid cutoff.

#### Scenario: Abstention or missingness
- GIVEN inputs are unavailable or the model abstains
- WHEN follow-up is requested
- THEN no fabricated risk appears and the unavailable state is explained

#### Scenario: Temporal isolation
- GIVEN the cutoff precedes regulation capture
- WHEN prediction data is created or reloaded
- THEN the later value cannot appear or be used

### Requirement: Idempotent outcome confirmation

An authorized user MUST confirm an outcome idempotently. Repeated submissions with the same identity MUST return the persisted result without duplication or snapshot rewriting.

#### Scenario: Confirm outcome
- GIVEN an eligible prediction and authorized user
- WHEN confirmed
- THEN actor, timestamp, provenance, and prediction identity persist

#### Scenario: Retry confirmation
- GIVEN the same confirmation is retried
- WHEN submitted again
- THEN one outcome remains and the prior result returns

### Requirement: Accessible errors and mode boundary

The UI MUST retain accessible loading, validation, live-status, keyboard, focus-return, and provenance behavior. Errors MUST use the stable envelope without internal details.

#### Scenario: Recoverable API error
- GIVEN transport fails
- WHEN the UI receives the error
- THEN it announces an actionable message, preserves safe input, and offers retry

#### Scenario: Unauthorized outcome
- GIVEN a user lacks outcome permission
- WHEN confirmation is attempted
- THEN the server rejects it and the UI does not claim success

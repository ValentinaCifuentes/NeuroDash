# Prediction Outcome Integration Specification

## Purpose

Define cutoff-bound prediction presentation and replay-safe outcome confirmation while preserving provenance, abstention, and the separation of risk from confidence.

## Requirements

### Requirement: Canonical prediction snapshot

The backend MUST create immutable, versioned prediction snapshots from only inputs available at the requested cutoff. Responses MUST expose risk, independent confidence, missingness, abstention, explanation, cutoff, versions, and provenance separately. Caregiver views MUST NOT expose `model_score`.

#### Scenario: Safe prediction display
- GIVEN eligible subject data and a prediction snapshot
- WHEN a caregiver views it
- THEN risk and confidence are separately labeled, provenance and cutoff are visible, and `model_score` is absent

#### Scenario: Insufficient or synthetic prediction
- GIVEN insufficient coverage, model abstention, or mock mode
- WHEN prediction is requested
- THEN HTTP 200 returns an explicit unavailable/abstention state without fabricated risk and identifies synthetic provenance when applicable

### Requirement: Temporal and provenance integrity

Prediction creation and reload MUST preserve the snapshot identity and complete input provenance. End-of-day values, later events, and outcomes MUST NOT alter predictions whose cutoff precedes their availability.

#### Scenario: Later value isolation
- GIVEN a value becomes available after a prediction cutoff
- WHEN the prediction is created or reloaded
- THEN the value is absent from inputs, features, explanation, and result

#### Scenario: Reproducible transport
- GIVEN the same subject, cutoff, and contract-compatible data
- WHEN real and mock transports are queried
- THEN both return semantically equivalent fields and safe status handling

### Requirement: Idempotent outcome confirmation

An authorized actor MUST confirm an eligible outcome using a stable request identity. Repeated confirmation MUST return the persisted lineage without duplicate outcomes or snapshot rewriting; unauthorized attempts MUST fail safely.

#### Scenario: Confirm and retry
- GIVEN an eligible prediction and authorized actor
- WHEN outcome confirmation is submitted and retried with the same identity
- THEN one outcome records actor, timestamp, prediction identity, and provenance, and the prior result is returned

#### Scenario: Unauthorized confirmation
- GIVEN an actor lacks outcome permission
- WHEN confirmation is attempted
- THEN the server rejects it and the UI does not claim success

### Requirement: Accessible safe errors

The UI MUST announce stable actionable errors without internal details, preserve safe input, support keyboard/focus behavior, and offer retry where recovery is possible.

#### Scenario: Recoverable failure
- GIVEN a transport or validation failure
- WHEN the UI receives the safe error envelope
- THEN it announces the problem, preserves non-sensitive input, and provides a retry path

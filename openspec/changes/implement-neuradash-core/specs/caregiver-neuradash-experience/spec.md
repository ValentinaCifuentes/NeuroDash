# Caregiver NeuraDash Experience Specification

## Purpose
Provide an accessible family-facing BLUBA-aligned experience.

## Requirements
### Requirement: Contract-only caregiver UI
The React experience MUST support profile-first onboarding and consume Prediction Contract v2 only; it MUST distinguish risk, confidence, factors, provenance, missingness, and safe abstention without exposing model score, algorithm, diagnosis, or causal claims. It MUST use accessible text, focus, contrast, and touch targets.
#### Scenario: Safe result
- GIVEN a valid contract response
- WHEN caregiver views the subject
- THEN risk and confidence are separately labelled with factors, provenance, and supports
#### Scenario: Empty timeline
- GIVEN no timeline or abstention response
- WHEN the page renders
- THEN an accessible missing/insufficient state explains what is unavailable

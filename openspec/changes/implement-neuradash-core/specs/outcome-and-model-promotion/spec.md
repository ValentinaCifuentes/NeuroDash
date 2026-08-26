# Outcome and Model Promotion Specification

## Purpose
Close outcomes and promote models only with auditable evidence.

## Requirements
### Requirement: Audited lifecycle
The system MUST require manual outcome confirmation, persist prediction-feature-outcome lineage, update training data, create candidates, compare them temporally with the active model, and automatically promote only when configured criteria pass. Otherwise it MUST record non-promotion and never silently overwrite.
#### Scenario: Confirm and promote
- GIVEN an eligible prediction and manually confirmed outcome
- WHEN a candidate passes configured temporal criteria
- THEN it is promoted with an audit record and prior version remains inspectable
#### Scenario: Candidate fails
- GIVEN insufficient or non-improving evidence
- WHEN promotion runs
- THEN the candidate is rejected/audited and the active model is unchanged

# School Record Adapter Specification

## Purpose
Reserve a future integration boundary without expanding CORE.

## Requirements
### Requirement: Non-CORE school boundary
The system MAY accept future structured school records through an explicit adapter contract, but school records MUST NOT enter current predictor inputs, features, training examples, or risk decisions.
#### Scenario: Adapter absent
- GIVEN CORE receives no school adapter
- WHEN prediction runs
- THEN behavior is unchanged and no school dependency is required
#### Scenario: Adapter data supplied
- GIVEN structured school data is supplied through the future boundary
- WHEN CORE prediction runs
- THEN the data is excluded from current predictor inputs and its exclusion is observable

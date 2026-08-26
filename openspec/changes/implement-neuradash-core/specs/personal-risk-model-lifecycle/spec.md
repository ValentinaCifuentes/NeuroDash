# Personal Risk Model Lifecycle Specification

## Purpose
Provide reproducible, subject-local learning without profile risk branches.

## Requirements
### Requirement: Versioned personal model
The system MUST build subject-local X(T)->y(T) examples where y is moderate/severe in (T,T+24h], validate temporally, and train a deterministic regularized LogisticRegression per subject. Artifacts, schema, configuration, data lineage, and metadata MUST be versioned and registry-loadable.
#### Scenario: Train and load
- GIVEN sufficient labelled history
- WHEN training is repeated with the same inputs
- THEN the same subject artifact and metadata are reproducible and loadable
#### Scenario: Cold start
- GIVEN insufficient labels or no active model
- WHEN prediction is requested
- THEN no profile-to-risk branch runs and the result is unavailable/abstained

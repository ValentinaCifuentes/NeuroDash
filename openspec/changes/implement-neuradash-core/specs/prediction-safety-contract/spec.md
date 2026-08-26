# Prediction Safety Contract Specification

## Purpose
Expose one safe, versioned interface for prediction and demo flows.

## Requirements
### Requirement: Prediction Contract v2
The API MUST return version 2 risk, independent confidence, abstention, non-causal factors, missingness, cutoff, versions, and synthetic provenance. Raw score is technical metadata only. Confidence MUST be monotonic with coverage; hard abstention MUST return HTTP 200. Subject, timeline, prediction, and demo operations MUST be cutoff-safe.
#### Scenario: Insufficient coverage
- GIVEN missing required coverage or no model
- WHEN prediction is requested
- THEN HTTP 200 returns an explicit abstention/INSUFFICIENT state without a risk claim
#### Scenario: Distinct histories
- GIVEN equal current observations for two subjects with divergent histories
- WHEN predictions are requested
- THEN each follows its subject model and temporal context, not a profile risk rule
#### Scenario: Unknown subject
- GIVEN a nonexistent subject identifier
- WHEN a subject, timeline, or prediction is requested
- THEN the API returns a consistent not-found error and no prediction

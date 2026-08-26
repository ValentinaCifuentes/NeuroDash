# Temporal Feature Safety Specification

## Purpose
Prevent temporal leakage and make feature coverage inspectable.

## Requirements
### Requirement: Cutoff-safe features
The system MUST normalize BLUBA data, require aware timestamps, include only records whose availability is <= cutoff, exclude future data, and use prior-day-only regulation. It MUST provide full provenance, 1/3/7/14-day features, and explicit missingness.
#### Scenario: Boundary
- GIVEN a record available exactly at cutoff and another after it
- WHEN features are built
- THEN only the boundary record is eligible and missingness is reported for absent windows
#### Scenario: Invalid data
- GIVEN a naive timestamp or same-day daily regulation
- WHEN processing occurs
- THEN the input is rejected or excluded under the conservative policy with provenance

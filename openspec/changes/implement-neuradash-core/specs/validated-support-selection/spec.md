# Validated Support Selection Specification

## Purpose
Offer safe, non-prescriptive supports.

## Requirements
### Requirement: Evidence-bounded supports
The system MUST select historical supports first, then supports from a local explicitly versioned validated catalog. It MUST NOT invent, generate with an LLM, or prescribe clinical treatment.
#### Scenario: No evidence
- GIVEN no matching history or catalog entry
- WHEN supports are requested
- THEN an explicit no-evidence result is returned
#### Scenario: Historical match
- GIVEN a support previously recorded for the subject
- WHEN selection occurs
- THEN it is labelled historical and shown as an option to consider

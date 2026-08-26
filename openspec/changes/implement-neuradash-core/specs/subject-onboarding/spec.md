# Subject Onboarding Specification

## Purpose
Capture truthful caregiver context and reproducible demo histories.

## Requirements
### Requirement: Contextual onboarding
The system MUST create an anonymous subject with an IANA timezone, sensory and habitual context, and historical supports; onboarding MUST NOT claim a trained model or risk when labels are absent.
#### Scenario: New subject
- GIVEN valid anonymous identity and IANA timezone
- WHEN caregiver submits context
- THEN the subject and provisional baseline context are returned with cold-start status
#### Scenario: Demo identity
- GIVEN PAC-A, PAC-B, or PAC-C is selected
- WHEN its profile is loaded
- THEN seeded, provenance-labelled history and identity are available and predictions still use the loaded model path

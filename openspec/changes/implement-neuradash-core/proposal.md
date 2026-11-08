# Proposal: Implement NeuraDash CORE

## Intent

Deliver a caregiver-facing application that turns a subject's available history into a transparent, non-diagnostic 24-hour dysregulation risk estimate, independent confidence, contextual factors, provenance, and safe supports. It must demonstrate genuine per-subject ML without clinical-performance claims.

## Scope

### In Scope
- Functional onboarding and PAC-A/B/C demo profiles with seeded, provenance-labelled histories.
- File-backed temporal pipeline, baseline, features, per-subject regularized `LogisticRegression`, inference, manual outcome confirmation, and auditable candidate promotion.
- FastAPI Prediction Contract v2 and React/Vite caregiver UI for risk, confidence, factors, missingness, provenance, and validated/historical supports.

### Out of Scope
- Boosting/XGBoost, SHAP, SQLite, IoT, LLMs, microservices, authentication, clinical validation claims, and production concurrency.
- School records as CORE inputs; provide an adapter extension point only.

## Capabilities

### New Capabilities
- `subject-onboarding`: Capture caregiver-provided initial context and support history.
- `temporal-feature-safety`: Enforce timezone-aware cutoffs, availability, prior-day regulation, and feature provenance.
- `personal-risk-model-lifecycle`: Build, train, version, evaluate, and load one model per subject.
- `prediction-safety-contract`: Return risk, independent confidence/abstention, non-causal factors, and technical provenance.
- `outcome-and-model-promotion`: Manually confirm outcomes and audit configured temporal candidate promotion.
- `validated-support-selection`: Select only historical or explicitly versioned validated-catalog supports.
- `caregiver-neuradash-experience`: Provide accessible, non-diagnostic PAC demo and onboarding flows.
- `school-record-adapter`: Define a non-CORE adapter boundary for future structured school records.

### Modified Capabilities
None; no baseline specs exist.

## Approach

Use a Python/FastAPI and React/Vite modular monolith with CSV/JSON/joblib repositories. Train deterministic regularized `LogisticRegression` artifacts separately for PAC-A/B/C; profile selection loads its history and active model, never a risk branch. Sensory context never sets baseline risk. Version target mapping, thresholds, schema, confidence/abstention, risk mapping, promotion, catalog, and availability policy; keep the raw score as technical metadata, not a clinical probability.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `engine/`, `ml/`, `config/` | New | Temporal safety, features, ML lifecycle, versioned policy. |
| `backend/app/`, `frontend/` | New | Contract API and caregiver experience. |
| `data/`, `models/`, `scripts/`, `tests/` | New | Reproducible demo evidence and invariant tests. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Temporal leakage | High | Availability metadata, prior-day rule, boundary tests. |
| Synthetic-data overclaiming | High | Mandatory provenance and no clinical claims. |
| Configuration drift | Med | Persist configuration versions with predictions and artifacts. |

## Rollback Plan

Remove the deployed module and generated artifacts; restore prior files. Retain versioned prediction, configuration, and promotion audit records for inspection.

## Dependencies

- Source CSV structure, seeded demo fixtures, Python 3.12+, FastAPI, scikit-learn, React/Vite, and the design-system reference.

## Success Criteria

- [ ] PAC-A/B/C each load distinct trained artifacts and run the same inference path without profile-to-risk branching.
- [ ] Cutoff, prior-day regulation, missingness, risk/confidence separation, abstention, provenance, and non-prescriptive support invariants are tested.
- [ ] Caregivers complete onboarding and receive only non-diagnostic risk, confidence, factors, provenance, and safe supports.
- [ ] Candidate promotion is configuration-gated, temporal, audited, and never overwrites an active model silently.
- [ ] Tasks forecast reviewable work units; the orchestrator runs the workload guard before apply.

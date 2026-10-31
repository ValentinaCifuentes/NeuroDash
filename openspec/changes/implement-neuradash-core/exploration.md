## Exploration: Implement NeuraDash CORE

### Current State
The repository is a documentation baseline, not an application: it contains the two authoritative NeuraDash documents, the design-system reference, an empty `index.html`, and SDD bootstrap files. There are no Python or Node manifests, source packages, data fixtures, model artifacts, tests, CI, or configured tooling.

The requested CORE is consistent with the Source of Truth and technical architecture: a single FastAPI deployment with a React/Vite frontend, per-subject trained models, transparent CSV/JSON/joblib persistence, and no IoT, LLM, deep learning, microservices, or enterprise infrastructure. The supplied architecture already provides a sound target tree; implementation should adapt it rather than rewrite correct documents.

### Affected Areas
- `pyproject.toml`, `backend/`, `engine/`, `ml/`, `config/` — new Python modular-monolith runtime, typed contracts, temporal pipeline, ML lifecycle, and versioned configuration.
- `data/legacy_history/`, `data/demo_profiles/`, `models/` — normalized source anchor, provenance-labelled PAC-A/B/C histories, reproducible datasets, artifacts, and metadata.
- `scripts/` — deterministic source validation, demo-history generation, model training, and smoke execution.
- `tests/` — strict-TDD unit, integration, reproducibility, and invariant tests; currently absent.
- `frontend/` — Vite/React/TypeScript/Tailwind view consuming only Prediction Contract v2.
- The design-system reference — visual reference, not application code; extract its tokens, responsive/mobile-first hierarchy, semantic state treatment, and accessibility rules.
- `openspec/changes/implement-neuradash-core/exploration.md` — this exploration artifact.

### Gap Matrix
| Capability | Documented target | Current implementation | MVP gap |
|---|---|---|---|
| Data onboarding and normalization | CSV adapters, onboarding, provenance | None | Complete |
| Temporal safety | timezone-aware cutoff and availability control | None | Complete; critical |
| Features and baselines | per-subject baseline and 1/3/7/14d windows | None | Complete |
| Personal ML | trained/versioned model per PAC | None | Complete; critical |
| Risk/confidence/abstention | independent engines and safe contract | None | Complete; critical |
| Outcomes and promotion | close labels, candidate comparison, gated promotion | None | Complete |
| API and frontend | FastAPI plus caregiver-aligned React view | None | Complete |
| Tests and reproducibility | pytest/httpx, Vitest/RTL, scripts | None | Complete |

### Locked Constraints and Open Decisions
**Locked constraints:** 24-hour horizon; explicit `prediction_cutoff`; no post-cutoff predictor; risk separate from confidence; missing data is not normal; sensory profile contextualizes exposure but never directly determines risk; ML is per subject; synthetic data is provenance-labelled and never clinical evidence; explanations are non-causal; supports are non-prescriptive; CORE works without IoT; no clinical-probability claim; profile selection must load history/model rather than select risk.

| Decision | Status | Proposal treatment |
|---|---|---|
| Outcome threshold (moderate/severe vs including mild) | OPEN-01 / provisional | Put target definition and severity mapping in versioned YAML; default to moderate/severe without claiming final confirmation. |
| Availability of `nivel_regulacion_general_dia` | OPEN-02 / critical | Default to prior-day-only; record an availability policy per source and permit same-day use only after evidence. |
| Structured school records | OPEN-03 | Keep outside CORE; define an optional source adapter extension point. |
| Timezone for demo records | Engineering decision needed | Require an IANA timezone per subject and reject naive timestamps at API boundaries. |
| Baseline, abstention, risk-mapping, retraining and promotion thresholds | Provisional engineering values | Put each in versioned YAML and persist the version in metadata/predictions. |
| Model family | Provisional | Start with regularized `LogisticRegression`; add no second active model unless a temporal benchmark on the generated profile history justifies it. |

### Approaches
1. **File-backed modular monolith with regularized logistic regression** — CSV/JSON/joblib repositories behind interfaces, deterministic generation/training scripts, and one trained model per PAC.
   - Pros: aligns with both sources; transparent, reproducible, small review surface; avoids synthetic performance theatre and unnecessary infrastructure.
   - Cons: file writes need atomic handling and are not concurrent-production storage; model capacity is intentionally limited.
   - Effort: Medium per vertical slice; High overall because the repository starts empty.

2. **Add SQLite and a second boosting model in the initial MVP** — introduce database persistence and model-family benchmarking immediately.
   - Pros: richer promotion persistence and a possible later model path.
   - Cons: expands schemas, migrations, test matrix, dependency surface, and reviewer burden without solving the core evidence gap; boosting/SHAP introduces unnecessary complexity before a stable temporal pipeline exists.
   - Effort: High.

### Recommendation
Adopt approach 1. Build a Python 3.12+ modular monolith with explicit repository interfaces, but implement `CsvJsonRepository` first; SQLite remains a replaceable future adapter, not a prerequisite. Establish temporal/provenance contracts before any feature or model code. Train exactly one deterministic, regularized `LogisticRegression` per PAC-A/PAC-B/PAC-C from separate, seeded, provenance-labelled histories; persist `joblib` artifacts plus model, feature-schema, configuration, training-data, and temporal-validation metadata.

Keep `PersonalRiskModel` and the model registry family-neutral, but defer gradient boosting/XGBoost, SHAP, IoT, calendar, login, notifications, and production concurrency. For logistic regression, produce factor contributions from transformed coefficient contributions and translate them into non-causal, baseline-relative language. The frontend must consume only Prediction Contract v2: it can show a model version/provenance disclosure for the demo but must not expose raw algorithm details or present `model_score` as a clinical probability.

Recommended module boundaries are `engine/` (schemas, temporal context, baseline, features, confidence, abstention, explanations, supports, provenance), `ml/` (dataset building, training, temporal evaluation, registry, inference), `backend/app/` (providers, services, Pydantic API schemas, routes), and `frontend/` (typed API client and presentation components). This follows the documented tree without premature fragmentation.

### Proposed Delivery Slices
| Slice | Deliverable and proof | Estimated review burden | Risk |
|---|---|---:|---|
| 1. Foundation and data contract | Python/frontend manifests, typed domain/provenance records, YAML config, source validator, normalized/demo fixture contract, deterministic seeds | 250–350 lines | Medium |
| 2. Temporal engine and features | aware-time parsing, availability/cutoff filtering, baseline, 1/3/7/14d features, feature provenance, unit tests for no-leakage and missingness | 350–500 lines | High |
| 3. Personal ML lifecycle | per-PAC dataset builder, deterministic trainer/evaluator, joblib registry/metadata, inference, score-to-level mapping, candidate promotion, reproducibility tests | 400–550 lines | High |
| 4. Safety contract and API | confidence, abstention, non-causal explanations, support selection, Prediction Contract v2, subject/timeline/prediction/outcome/retrain routes, httpx tests | 350–500 lines | High |
| 5. Caregiver-aligned UI | React view, PAC switcher, risk/confidence/missing/support/timeline states, accessibility, Vitest/RTL, no algorithm exposure | 350–500 lines | Medium |
| 6. Demo hardening | executable generation/train/smoke scripts, frontend build serving, cross-stack smoke evidence, documentation only if needed by later phases | 200–350 lines | Medium |

The 800-line review budget is exceeded by the overall change. Under `ask-on-risk`, proposal/tasks must explicitly request chained delivery. Each slice should remain a reviewable PR/work unit; slices 2–4 merit especially focused review because they encode safety invariants.

### Test Strategy
- Unit-test every temporal boundary: future availability, exact cutoff inclusion, timezone offsets/DST behavior, prior-day policy for ambiguous daily regulation, and training-label horizons `(T, T+24h]`.
- Test feature windows, baseline divergence for equal observations across subjects, missingness monotonicity, and hard abstention.
- Test that profile IDs only select repositories/artifacts; identical daily input can yield different learned outputs across separate models, but no profile-to-risk branch exists.
- Test model artifacts and metadata per PAC, deterministic regeneration/training with a fixed seed, temporal—not random—validation, candidate non-promotion on insufficient or non-improving evidence, and explicit synthetic provenance.
- Test API contract states including `200` abstention/`INSUFFICIENT`, while frontend tests distinguish risk, confidence, missingness, explanations, and supports.
- Use one browser smoke only after API/UI contracts stabilize. Synthetic metrics may prove reproducibility and candidate comparison only, never clinical performance.

### Risks
- **Temporal leakage:** source timestamps and availability timestamps are different; ambiguous `nivel_regulacion_general_dia` must stay prior-day-only until resolved.
- **Synthetic-data overclaiming:** generated history can demonstrate an executable ML pipeline, not calibration, accuracy, causality, or clinical utility.
- **Per-subject validation limits:** even synthetic datasets need positive/negative balance and chronological splits; promotion rules must abstain from false evidence when data is insufficient.
- **Hardcoded-risk regression:** PAC selection, fixtures, score mappings, and UI demo states can accidentally encode risk; tests must trace every result through active model inference.
- **Configuration drift:** target, threshold, feature schema, and model metadata must be versioned together to make predictions reproducible.
- **Frontend semantics:** the design-system reference reserves purple for brand/action, requires text plus color, 44px targets, visible focus, reduced motion, and mobile-first layout. Clinical-risk semantics need accessible labels and must not imply diagnosis.
- **Scope/review overload:** building backend, ML, API, and UI from an empty repository cannot be credibly reviewed as one 800-line unit.

### Ready for Proposal
**Yes, with explicit risk handling.** The proposal should lock the file-backed modular-monolith MVP boundary and chained delivery, retain the documented invariants, and formalize the provisional decisions as versioned configuration. It should not silently resolve the three open questions; it should adopt conservative defaults and name confirmation as a pilot/product follow-up.

import hashlib
import uuid
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from engine.temporal import AvailabilityPolicy
from engine.baseline import build_baseline
from engine.features import build_features
from engine.confidence import calculate_confidence
from engine.abstention import should_abstain
from engine.explanation import generate_non_causal_factors
from engine.support import select_supports
from engine.provenance import build_provenance

from ml.model_registry import ModelRegistry, ModelAbstentionError
from ml.inference import predict_risk
from ml.explain import explain_prediction
from ml.promotion import write_json_atomic

from backend.app.schemas import PredictionContractV2
from engine.schemas import ConfidenceLevel, HORIZON_HOURS


class SubjectNotFoundError(ValueError):
    """Raised when a requested subject is not found in data stores."""
    pass


LEGACY_HISTORY_DIR = Path(__file__).resolve().parents[2] / "data" / "legacy_history"
# Modelos entrenados por infante. Constante de módulo para que los tests la redirijan.
MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


def _read_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_legacy_history(subject_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Historial sintético de un perfil demo (`data/legacy_history/{id}_history.json`), sin parsear."""
    history_path = LEGACY_HISTORY_DIR / f"{subject_id}_history.json"
    if not history_path.exists():
        return [], []
    with open(history_path, "r", encoding="utf-8") as f:
        history = json.load(f)
    return history.get("records", []), history.get("occurrences", [])


def load_legacy_planned_events(subject_id: str) -> list[dict[str, Any]]:
    """Eventos planificados del historial sintético de una demo (sin parsear)."""
    history_path = LEGACY_HISTORY_DIR / f"{subject_id}_history.json"
    if not history_path.exists():
        return []
    with open(history_path, "r", encoding="utf-8") as f:
        return json.load(f).get("planned_events", [])


def get_subject_paths(subject_id: str) -> tuple[Path, bool]:
    """
    Returns the path to the subject directory and a boolean indicating if it's a demo subject.
    """
    proj_root = Path(__file__).resolve().parents[2]
    
    # 1. Check demo profiles
    demo_dir = proj_root / "data" / "demo_profiles" / subject_id
    if demo_dir.exists():
        return demo_dir, True
        
    # 2. Check general subjects
    subject_dir = proj_root / "data" / "subjects" / subject_id
    if subject_dir.exists():
        return subject_dir, False
        
    raise SubjectNotFoundError(f"Subject {subject_id} not found.")


def load_subject_data(subject_id: str) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Loads subject profile, historical records, occurrences, and planned events.
    """
    subject_dir, is_demo = get_subject_paths(subject_id)

    # Load profile
    profile_path = subject_dir / "profile.json"
    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)

    records: list[dict[str, Any]] = []
    occurrences: list[dict[str, Any]] = []
    planned_events: list[dict[str, Any]] = []

    if is_demo:
        # Una demo une su historial sintético con lo que se registre en la app
        # (Bitácora, eventos y crisis confirmadas), guardado en su propia carpeta.
        records, occurrences = load_legacy_history(subject_id)
        history_path = LEGACY_HISTORY_DIR / f"{subject_id}_history.json"
        if history_path.exists():
            with open(history_path, "r", encoding="utf-8") as f:
                planned_events = json.load(f).get("planned_events", [])

    records = records + _read_json_list(subject_dir / "records.json")
    occurrences = occurrences + _read_json_list(subject_dir / "occurrences.json")
    planned_events = planned_events + _read_json_list(subject_dir / "planned_events.json")

    # Convert timestamps to aware datetimes
    def parse_dt(dt_str: str) -> datetime:
        dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            # Assume UTC if naive, but theoretically all stored timestamps must be aware
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    for r in records:
        r["source_timestamp"] = parse_dt(r["source_timestamp"])
        r["availability_timestamp"] = parse_dt(r["availability_timestamp"])

    for o in occurrences:
        o["source_timestamp"] = parse_dt(o["source_timestamp"])
        o["availability_timestamp"] = parse_dt(o["availability_timestamp"])

    for p in planned_events:
        if isinstance(p.get("starts_at"), str):
            p["starts_at"] = parse_dt(p["starts_at"])

    return profile, records, occurrences, planned_events


def make_prediction(
    subject_id: str,
    prediction_cutoff: datetime,
    school_records: list[dict[str, Any]] | None = None
) -> tuple[str, PredictionContractV2]:
    """
    Orchestrates prediction lifecycle:
    1. Loads data
    2. Builds features
    3. Evaluates models and safety policies
    4. Records snapshot
    """
    # 0. Check timezone aware cutoff
    if prediction_cutoff.tzinfo is None:
        raise ValueError("prediction_cutoff must be timezone-aware")

    # 1. Load data
    profile, records, occurrences, planned_events = load_subject_data(subject_id)
    
    timezone_name = profile["timezone"]
    sensory_context = profile.get("sensory_context", {})
    habitual_context = profile.get("habitual_context", {})
    historical_supports = profile.get("historical_supports", [])

    # 2. Build baseline and features from data available at the cutoff only.
    records = [record for record in records if record["source_timestamp"] <= prediction_cutoff and record["availability_timestamp"] <= prediction_cutoff]
    occurrences = [occurrence for occurrence in occurrences if occurrence["source_timestamp"] <= prediction_cutoff and occurrence["availability_timestamp"] <= prediction_cutoff]
    policy = AvailabilityPolicy(daily_regulation="prior_day_only", exclusion_policy="conservative")
    baseline = build_baseline(records, prediction_cutoff, policy=policy, timezone=timezone_name)
    features = build_features(records, baseline, prediction_cutoff, policy=policy, timezone=timezone_name, subject=profile, planned_events=planned_events)

    # 3. Model registry
    registry = ModelRegistry(base_dir=MODELS_DIR)

    # Check active model
    active_model_exists = True
    model_artifact = None
    try:
        model_artifact = registry.load_model(subject_id)
    except ModelAbstentionError:
        active_model_exists = False

    # Calculate confidence based on feature missingness
    confidence = calculate_confidence(features.missingness)

    # Check safety / abstention policy
    abstain, reason = False, None
    if not active_model_exists:
        abstain = True
        reason = "No active model trained for this subject."
    else:
        abstain, reason = should_abstain(features.baseline_maturity, confidence)

    # Determine school record exclusion
    has_school_records = school_records is not None and len(school_records) > 0

    prediction_id = uuid.uuid4().hex

    if abstain:
        # Build abstained contract response
        prov = build_provenance(subject_id, has_school_records=has_school_records, lineage=None)
        prov["synthetic"] = bool(profile.get("provenance", {}).get("synthetic", False))
        supports = select_supports(
            historical_supports,
            sensory_context,
            habitual_context=habitual_context,
            missingness=features.missingness,
            confidence=ConfidenceLevel.INSUFFICIENT,
            abstained=True,
            recent_records=records[-7:],
            recent_occurrences=occurrences[-7:],
        )
        
        contract = PredictionContractV2(
            prediction_id=prediction_id,
            subject_id=subject_id,
            prediction_cutoff=prediction_cutoff,
            horizon_hours=HORIZON_HOURS,
            risk=None,
            confidence=ConfidenceLevel.INSUFFICIENT,
            abstained=True,
            factors=[],
            missingness=features.missingness,
            supports=supports,
            provenance=prov,
            versions={
                "model_version": "none",
                "policy_hash": "default",
                "code_version": "0.1.0"
            }
        )
    else:
        # Run inference
        score, risk_tier = predict_risk(registry, subject_id, features.rolling_features)
        
        # Run explanation
        model = model_artifact["model"]
        feat_names = model_artifact["features"]
        metadata = model_artifact["metadata"]
        
        raw_explanations = explain_prediction(model, feat_names, features.rolling_features)
        # Lo que se rellenó con la línea base por falta de datos no se compara con ella.
        observed = dict(features.rolling_features)
        for item in features.missingness:
            if item.get("missing"):
                observed[f"{item['field']}_mean_{item['window']}d"] = None
        factors = generate_non_causal_factors(raw_explanations, baseline.modality_baselines, observed)
        
        # Select supports
        supports = select_supports(
            historical_supports,
            sensory_context,
            habitual_context=habitual_context,
            factors=factors,
            missingness=features.missingness,
            confidence=confidence,
            abstained=False,
            recent_records=records[-7:],
            recent_occurrences=occurrences[-7:],
        )
        
        # Build provenance
        prov = build_provenance(subject_id, has_school_records=has_school_records, lineage=metadata)
        prov["synthetic"] = bool(profile.get("provenance", {}).get("synthetic", False))
        
        contract = PredictionContractV2(
            prediction_id=prediction_id,
            subject_id=subject_id,
            prediction_cutoff=prediction_cutoff,
            horizon_hours=HORIZON_HOURS,
            risk=risk_tier,
            confidence=confidence,
            abstained=False,
            factors=factors,
            missingness=features.missingness,
            supports=supports,
            provenance=prov,
            versions={
                "model_version": str(metadata.get("version", 1)),
                "policy_hash": "default",
                "code_version": "0.1.0"
            }
        )

    # Una crisis ya confirmada en las últimas horas del horizonte: la pantalla lo
    # muestra («Confirmado a las 14:32») en vez de volver a ofrecer el botón.
    contract = contract.model_copy(update={"confirmed_at": _last_confirmation(occurrences, prediction_cutoff)})

    # 4. Save prediction snapshot for future outcomes
    subject_dir, _ = get_subject_paths(subject_id)
    predictions_dir = subject_dir / "predictions"
    predictions_dir.mkdir(parents=True, exist_ok=True)

    inputs = json.loads(json.dumps(
        {"records": records, "occurrences": occurrences, "planned_events": planned_events},
        default=str,
    ))

    # P5: abrir Evolución pide una estimación cada vez. Si es la misma hora y los
    # datos no cambiaron, el resultado es el mismo: se reutiliza la copia guardada
    # (y su prediction_id, que es el que usa «Confirmar que ocurrió») en vez de
    # escribir otra con todo el historial.
    reuse_key = _snapshot_key(prediction_cutoff, inputs)
    index_path = predictions_dir / "index.json"
    index = _read_snapshot_index(index_path)
    existing_id = index.get(reuse_key)
    if existing_id and (predictions_dir / f"{existing_id}.json").exists():
        return existing_id, contract.model_copy(update={"prediction_id": existing_id})

    snapshot = contract.model_dump(mode="json")
    snapshot["inputs"] = inputs
    snapshot["features"] = features.rolling_features

    snapshot_path = predictions_dir / f"{prediction_id}.json"
    write_json_atomic(snapshot_path, snapshot)
    write_json_atomic(index_path, {**index, reuse_key: prediction_id})

    return prediction_id, contract


def _last_confirmation(occurrences: list[dict[str, Any]], prediction_cutoff: datetime) -> datetime | None:
    window_start = prediction_cutoff - timedelta(hours=HORIZON_HOURS)
    times = []
    for occurrence in occurrences:
        if occurrence.get("source") != "outcome_confirmation":
            continue
        when = occurrence["source_timestamp"]
        when = datetime.fromisoformat(when) if isinstance(when, str) else when
        if window_start < when <= prediction_cutoff:
            times.append(when)
    return max(times) if times else None


def _snapshot_key(prediction_cutoff: datetime, inputs: dict[str, Any]) -> str:
    """Misma hora (UTC) + mismos datos de entrada → misma estimación."""
    hour = prediction_cutoff.astimezone(timezone.utc).strftime("%Y-%m-%dT%H")
    digest = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode("utf-8")).hexdigest()[:16]
    return f"{hour}:{digest}"


def _read_snapshot_index(index_path: Path) -> dict[str, str]:
    try:
        return json.loads(index_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

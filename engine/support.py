from pathlib import Path
from typing import Any

import yaml

from engine.schemas import ConfidenceLevel


CASE_KEYWORDS = {
    "routine_transition": ["routine_change", "upcoming_transition", "transition", "cambio", "rutina"],
    "early_dysregulation": ["irritability", "stress", "desregul", "regulation", "wake_state"],
    "demand_overload": ["demand_overload", "demand", "actividad", "tarea", "exigencia", "sobrecarga"],
    "communication_support": ["communication_need", "communication", "aac", "ayuda", "pausa"],
    "alternative_behavior_reinforcement": ["alternative_behavior_used", "conducta alternativa", "refuerzo"],
    "unclear_repeated_pattern": ["repeated_unclear_pattern", "unclear", "unknown", "inconsistente"],
    "caregiver_context": ["caregiver_view", "cuidador", "tutor", "familia", "familiar"],
    "learned_self_regulation": ["self_regulation_available", "autorregul", "recognize_stress"],
}

REGISTERED_ONLY_CASES = {
    "communication_support",
    "alternative_behavior_reinforcement",
    "learned_self_regulation",
}

CONTEXT_ALIASES = {
    "transition": "routine_transition",
    "routine_transition": "routine_transition",
    "regulation": "early_dysregulation",
    "early_dysregulation": "early_dysregulation",
    "self_regulation": "learned_self_regulation",
    "demand": "demand_overload",
    "demand_overload": "demand_overload",
    "communication": "communication_support",
    "communication_support": "communication_support",
    "alternative_behavior": "alternative_behavior_reinforcement",
    "reinforcement": "alternative_behavior_reinforcement",
    "caregiver": "caregiver_context",
}


def select_supports(
    subject_history: list[dict[str, Any]],
    sensory_context: dict[str, Any],
    config_path: Path | str | None = None,
    *,
    habitual_context: dict[str, Any] | None = None,
    factors: list[dict[str, Any]] | None = None,
    missingness: list[dict[str, Any]] | None = None,
    confidence: ConfidenceLevel | str | None = None,
    abstained: bool = False,
    recent_records: list[dict[str, Any]] | None = None,
    recent_occurrences: list[dict[str, Any]] | None = None,
    user_role: str | None = None,
) -> list[dict[str, Any]]:
    """
    Select evidence-bounded supports without prescribing treatment.

    Priority order:
    1. Previously effective or professional-approved subject supports.
    2. Contextual recommendations from the validated catalog.
    3. Explicit insufficient-data message when contextualization is unsafe.
    """
    catalog = _load_catalog(config_path)
    context = {**(sensory_context or {}), **(habitual_context or {})}
    signals = _detect_cases(context, factors or [], recent_records or [], recent_occurrences or [], user_role)

    if _must_abstain_from_contextual_supports(abstained, confidence, missingness or []):
        return [_insufficient_data_support(catalog, missingness or [])]

    historical = _historical_supports(subject_history, signals)
    selected = list(historical)

    if any(entry.get("case_id") for entry in catalog):
        registered_cases = _registered_cases(subject_history, context)
        if any(item.get("effective") is True for item in subject_history) and signals:
            signals.add("previously_effective_similar_context")
            selected.extend(_effective_history_recommendations(subject_history))

        for entry in catalog:
            case_id = entry.get("case_id")
            if not case_id or case_id == "insufficient_data" or case_id not in signals:
                continue
            if entry.get("requires_registered_support") and case_id not in registered_cases:
                continue
            if case_id in REGISTERED_ONLY_CASES and case_id not in registered_cases:
                continue
            selected.append(_catalog_support(entry))
    else:
        selected.extend(_legacy_catalog_supports(catalog, context, has_history=bool(selected)))

    selected = _dedupe(selected)
    if selected:
        return sorted(selected, key=lambda item: item.get("priority", 50))

    if any(entry.get("case_id") for entry in catalog) and not signals:
        return [_insufficient_data_support(catalog, missingness or [])]

    return [_fallback_support()]


def _load_catalog(config_path: Path | str | None) -> list[dict[str, Any]]:
    path = Path(config_path) if config_path is not None else Path(__file__).resolve().parents[1] / "config" / "support_catalog.yaml"
    try:
        with path.open("r", encoding="utf-8") as source:
            catalog = yaml.safe_load(source) or []
    except Exception:
        return []
    return catalog if isinstance(catalog, list) else []


def _detect_cases(
    context: dict[str, Any],
    factors: list[dict[str, Any]],
    recent_records: list[dict[str, Any]],
    recent_occurrences: list[dict[str, Any]],
    user_role: str | None,
) -> set[str]:
    text = _flatten_text(context)
    if user_role:
        text += f" {user_role.lower()}"

    signals = {
        case_id
        for case_id, keywords in CASE_KEYWORDS.items()
        if any(keyword.lower() in text for keyword in keywords)
    }

    for key, value in context.items():
        if value is True:
            key_case = CONTEXT_ALIASES.get(str(key))
            if key_case:
                signals.add(key_case)

    factor_text = _flatten_text({str(idx): factor for idx, factor in enumerate(factors)})
    if "sueno" in factor_text or "sueño" in factor_text or "despertar" in factor_text:
        signals.add("early_dysregulation")

    if any(_as_float(record.get("wake_state")) is not None and _as_float(record.get("wake_state")) >= 7 for record in recent_records):
        signals.add("early_dysregulation")
    if any(_as_float(record.get("event_count")) is not None and _as_float(record.get("event_count")) >= 3 for record in recent_records):
        signals.add("unclear_repeated_pattern")
    if len(recent_occurrences) >= 3:
        signals.add("unclear_repeated_pattern")

    return signals


def _must_abstain_from_contextual_supports(
    abstained: bool,
    confidence: ConfidenceLevel | str | None,
    missingness: list[dict[str, Any]],
) -> bool:
    if abstained:
        return True
    if confidence == ConfidenceLevel.INSUFFICIENT or confidence == "INSUFFICIENT":
        return True
    critical_missing = {"wake_state", "sleep_quality", "event_count", "routine_change", "context"}
    missing_fields = {str(item.get("field")) for item in missingness if item.get("missing") is True}
    return len(critical_missing & missing_fields) >= 2


def _historical_supports(subject_history: list[dict[str, Any]], signals: set[str]) -> list[dict[str, Any]]:
    selected = []
    for item in subject_history:
        case_id = _history_case(item, signals)
        selected.append(
            {
                "id": item.get("id"),
                "description": item.get("description") or item.get("name"),
                "type": "historical",
                "source": "historical_support",
                "category": item.get("category", "general"),
                "case_id": case_id,
                "evidence_bounded": True,
                "rationale": "Apoyo registrado previamente para esta persona.",
                "priority": 5 if item.get("effective") is True else 10,
            }
        )
    return selected


def _history_case(item: dict[str, Any], signals: set[str]) -> str:
    contexts = item.get("contexts", [])
    if isinstance(contexts, str):
        contexts = [contexts]
    for context in contexts:
        case_id = CONTEXT_ALIASES.get(str(context).lower())
        if case_id:
            return case_id
    category_case = CONTEXT_ALIASES.get(str(item.get("category", "")).lower())
    if category_case:
        return category_case
    return next(iter(signals), "previously_effective_similar_context") if item.get("effective") is True else "historical_support"


def _registered_cases(subject_history: list[dict[str, Any]], context: dict[str, Any]) -> set[str]:
    cases = set()
    for item in subject_history:
        if not (item.get("approved_by_professional") or item.get("effective") or item.get("type") == "historical"):
            continue
        contexts = item.get("contexts", [])
        if isinstance(contexts, str):
            contexts = [contexts]
        for item_context in contexts:
            case_id = CONTEXT_ALIASES.get(str(item_context).lower())
            if case_id:
                cases.add(case_id)
        category_case = CONTEXT_ALIASES.get(str(item.get("category", "")).lower())
        if category_case:
            cases.add(category_case)
    if context.get("professional_plan") is True and context.get("caregiver_view") is True:
        cases.add("caregiver_context")
    return cases


def _effective_history_recommendations(subject_history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    recommendations = []
    for item in subject_history:
        if item.get("effective") is not True:
            continue
        description = item.get("description") or item.get("name") or "la estrategia registrada"
        recommendations.append(
            {
                "id": f"previous_effective_{item.get('id', len(recommendations))}",
                "description": f"En situaciones similares, {description} resultó útil anteriormente. Considere utilizarla nuevamente.",
                "type": "historical",
                "source": "historical_support",
                "category": item.get("category", "general"),
                "case_id": "previously_effective_similar_context",
                "evidence_bounded": True,
                "rationale": "La prioridad se basa en un apoyo previamente registrado como efectivo.",
                "priority": 1,
            }
        )
    return recommendations


def _catalog_support(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": entry.get("id"),
        "description": entry.get("description"),
        "type": "catalog",
        "source": entry.get("source", "validated_catalog"),
        "category": entry.get("category", "general"),
        "case_id": entry.get("case_id"),
        "evidence_bounded": True,
        "rationale": entry.get("rationale", "Apoyo del catálogo validado."),
        "priority": entry.get("priority", 50),
    }


def _legacy_catalog_supports(catalog: list[dict[str, Any]], context: dict[str, Any], has_history: bool) -> list[dict[str, Any]]:
    context_values = [value.lower() for value in _string_values(context)]
    context_matches = []
    general_entries = []
    for entry in catalog:
        sensory_trigger = entry.get("sensory_profile_contains")
        habit_trigger = entry.get("habit_profile_contains")
        is_contextual = bool(sensory_trigger or habit_trigger)
        matched = False
        if sensory_trigger and any(str(sensory_trigger).lower() in value for value in context_values):
            matched = True
        if habit_trigger and any(str(habit_trigger).lower() in value for value in context_values):
            matched = True
        support = _catalog_support({**entry, "case_id": entry.get("case_id", "legacy_catalog")})
        if is_contextual and matched:
            context_matches.append(support)
        elif not is_contextual:
            general_entries.append(support)
    if context_matches:
        return context_matches
    return [] if has_history else general_entries


def _insufficient_data_support(catalog: list[dict[str, Any]], missingness: list[dict[str, Any]]) -> dict[str, Any]:
    entry = next((item for item in catalog if item.get("case_id") == "insufficient_data"), None)
    missing_fields = [str(item.get("field")) for item in missingness if item.get("missing") is True]
    detail = f" Falta información reciente sobre: {', '.join(missing_fields[:3])}." if missing_fields else ""
    if entry:
        support = _catalog_support(entry)
        support["type"] = "fallback"
        support["source"] = "insufficient_data"
        support["description"] = f"{support['description']}{detail}"
        return support
    fallback = _fallback_support()
    fallback["case_id"] = "insufficient_data"
    fallback["source"] = "insufficient_data"
    fallback["description"] = f"No hay información suficiente para seleccionar un apoyo contextualizado.{detail}"
    return fallback


def _fallback_support() -> dict[str, Any]:
    return {
        "id": "fallback_no_evidence",
        "description": "No evidence-based supports available.",
        "type": "fallback",
        "source": "insufficient_data",
        "category": "general",
        "case_id": "insufficient_data",
        "evidence_bounded": True,
        "rationale": "No hay base suficiente para seleccionar una recomendación contextual.",
        "priority": 100,
    }


def _dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    deduped = []
    for item in items:
        key = (item.get("id"), item.get("case_id"), item.get("description"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _flatten_text(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(f"{key} {_flatten_text(item)}" for key, item in value.items()).lower()
    if isinstance(value, list):
        return " ".join(_flatten_text(item) for item in value).lower()
    return str(value).lower()


def _string_values(value: Any) -> list[str]:
    if isinstance(value, dict):
        values = []
        for item in value.values():
            values.extend(_string_values(item))
        return values
    if isinstance(value, list):
        values = []
        for item in value:
            values.extend(_string_values(item))
        return values
    return [value] if isinstance(value, str) else []


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

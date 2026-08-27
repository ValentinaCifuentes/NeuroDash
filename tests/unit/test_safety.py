import pytest
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import yaml

from engine.schemas import ConfidenceLevel
from engine.confidence import calculate_confidence
from engine.abstention import should_abstain
from engine.explanation import generate_non_causal_factors
from engine.support import select_supports
from engine.provenance import build_provenance


def test_confidence_calculation_monotonicity() -> None:
    # We will test confidence levels with different coverage rates.
    # Monotonicity test: confidence level should increase or stay the same as coverage increases.
    # Total features: 4.
    # We'll mock missingness inputs.
    
    # 1. 100% missing (0% coverage) -> INSUFFICIENT
    missing_all = [
        {"window": 1, "field": "f1", "missing": True},
        {"window": 1, "field": "f2", "missing": True},
        {"window": 3, "field": "f1", "missing": True},
        {"window": 3, "field": "f2", "missing": True},
    ]
    
    # 2. 50% missing (50% coverage) -> LOW or MEDIUM depending on config
    missing_half = [
        {"window": 1, "field": "f1", "missing": False},
        {"window": 1, "field": "f2", "missing": False},
        {"window": 3, "field": "f1", "missing": True},
        {"window": 3, "field": "f2", "missing": True},
    ]
    
    # 3. 25% missing (75% coverage) -> MEDIUM or HIGH
    missing_quarter = [
        {"window": 1, "field": "f1", "missing": False},
        {"window": 1, "field": "f2", "missing": False},
        {"window": 3, "field": "f1", "missing": False},
        {"window": 3, "field": "f2", "missing": True},
    ]
    
    # 4. 0% missing (100% coverage) -> HIGH
    missing_none = [
        {"window": 1, "field": "f1", "missing": False},
        {"window": 1, "field": "f2", "missing": False},
        {"window": 3, "field": "f1", "missing": False},
        {"window": 3, "field": "f2", "missing": False},
    ]
    
    # Let's create a temporary config file for confidence thresholds
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "confidence.yaml"
        config_data = {
            "high_threshold": 0.8,
            "medium_threshold": 0.6,
            "low_threshold": 0.4
        }
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(config_data, f)
            
        conf_all = calculate_confidence(missing_all, config_path)
        conf_half = calculate_confidence(missing_half, config_path)
        conf_quarter = calculate_confidence(missing_quarter, config_path)
        conf_none = calculate_confidence(missing_none, config_path)
        
        # In order of increasing coverage: 0% -> 50% -> 75% -> 100%
        # levels: INSUFFICIENT < LOW < MEDIUM < HIGH
        level_values = {
            ConfidenceLevel.INSUFFICIENT: 0,
            ConfidenceLevel.LOW: 1,
            ConfidenceLevel.MEDIUM: 2,
            ConfidenceLevel.HIGH: 3
        }
        
        assert level_values[conf_all] <= level_values[conf_half]
        assert level_values[conf_half] <= level_values[conf_quarter]
        assert level_values[conf_quarter] <= level_values[conf_none]
        
        assert conf_all == ConfidenceLevel.INSUFFICIENT
        assert conf_none == ConfidenceLevel.HIGH


def test_abstention_logic() -> None:
    # Test case 1: Abstain when baseline maturity is insufficient
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "abstention.yaml"
        config_data = {
            "min_baseline_maturity": 3,
            "required_confidence": "LOW"
        }
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(config_data, f)
            
        # baseline maturity is 2, less than 3 -> must abstain
        abstain, reason = should_abstain(
            baseline_maturity=2,
            confidence=ConfidenceLevel.HIGH,
            config_path=config_path
        )
        assert abstain is True
        assert "maturity" in reason.lower()
        
        # Test case 2: Abstain when confidence is INSUFFICIENT
        # baseline maturity is 5 >= 3, but confidence is INSUFFICIENT -> must abstain
        abstain, reason = should_abstain(
            baseline_maturity=5,
            confidence=ConfidenceLevel.INSUFFICIENT,
            config_path=config_path
        )
        assert abstain is True
        assert "confidence" in reason.lower()
        
        # Test case 3: Do not abstain when baseline maturity is 3 and confidence is LOW
        abstain, reason = should_abstain(
            baseline_maturity=3,
            confidence=ConfidenceLevel.LOW,
            config_path=config_path
        )
        assert abstain is False
        assert reason is None


def test_non_causal_factors() -> None:
    # Explanations must not use causal words like "causes", "triggers", "makes", "diagnostic", etc.
    # Feature contributions from ML model are mapped to user-friendly non-causal Spanish descriptions.
    raw_explanations = [
        {"feature": "sleep_quality_mean_3d", "value": 5.0, "coefficient": -0.8, "contribution": -4.0},
        {"feature": "wake_state_mean_7d", "value": 8.0, "coefficient": 0.5, "contribution": 4.0},
        {"feature": "event_count_mean_3d", "value": 2.0, "coefficient": 0.2, "contribution": 0.4},
        {"feature": "record_count_2d", "value": 2.0, "coefficient": 0.1, "contribution": 0.2},
    ]
    
    factors = generate_non_causal_factors(raw_explanations)
    
    assert len(factors) == 4
    for factor in factors:
        desc = factor["description"]
        # Ensure description is present and not empty
        assert isinstance(desc, str)
        assert len(desc) > 0
        
        # Ensure non-causal and non-diagnostic language
        causal_words = ["cause", "trigger", "make", "diagnostic", "induce", "produce", "effect", "result in"]
        for word in causal_words:
            assert word not in desc.lower(), f"Description contains forbidden causal/diagnostic word '{word}': {desc}"
            
        assert "contribution" in factor
        assert "factor_name" in factor
        assert factor["factor_name"] in [
            "Calidad Del Sueno En Los Ultimos Tres Dias",
            "Estado Al Despertar En Los Ultimos Siete Dias",
            "Conteo De Eventos En Los Ultimos Tres Dias",
            "Conteo De Registros En Los Ultimos Dos Dias",
        ]
        assert factor["feature"] in [
            "calidad_sueno_promedio_tres_dias",
            "estado_despertar_promedio_siete_dias",
            "conteo_eventos_promedio_tres_dias",
            "conteo_registros_dos_dias",
        ]
        assert not any(char.isdigit() for char in factor["factor_name"])
        assert not any(char.isdigit() for char in factor["feature"])
        assert "sleep_quality" not in factor["feature"]
        assert "wake_state" not in factor["feature"]
        assert "event_count" not in factor["feature"]
        assert "record_count" not in factor["feature"]


def test_evidence_bounded_supports() -> None:
    # GIVEN history and catalog, select supports in order: historical first, then catalog.
    # If none match, fallback to "no-evidence" support.
    
    # 1. Catalog configuration
    with tempfile.TemporaryDirectory() as tmpdir:
        catalog_path = Path(tmpdir) / "support_catalog.yaml"
        catalog_data = [
            {
                "id": "cat_sensory_1",
                "category": "sensory",
                "sensory_profile_contains": "Hypersensitive",
                "description": "Reduce ambient lighting and noise in the evening."
            },
            {
                "id": "cat_habit_1",
                "category": "habit",
                "habit_profile_contains": "exercise",
                "description": "Engage in calm stretching before bedtime."
            },
            {
                "id": "cat_general_1",
                "category": "general",
                "description": "Maintain a regular sleep schedule."
            }
        ]
        with open(catalog_path, "w", encoding="utf-8") as f:
            yaml.dump(catalog_data, f)
            
        # Case A: Subject has historical supports -> return them first
        subject_history = [
            {"id": "hist_1", "description": "Weighted blanket used successfully.", "type": "historical"}
        ]
        sensory_context = {"sensory_profile": "Hypersensitive Tactile"}
        
        supports = select_supports(
            subject_history=subject_history,
            sensory_context=sensory_context,
            config_path=catalog_path
        )
        
        assert len(supports) >= 2
        # Historical first
        assert supports[0]["type"] == "historical"
        assert supports[0]["description"] == "Weighted blanket used successfully."
        
        # Catalog second (matching sensory_profile_contains "Hypersensitive")
        assert supports[1]["type"] == "catalog"
        assert "ambient lighting" in supports[1]["description"]
        
        # Case B: No history, no matching sensory/habit context -> returns catalog general or fallback
        supports_fallback = select_supports(
            subject_history=[],
            sensory_context={},
            config_path=catalog_path
        )
        assert len(supports_fallback) == 1
        assert supports_fallback[0]["type"] == "catalog"
        assert "regular sleep schedule" in supports_fallback[0]["description"]
        
        # Case C: Empty catalog and empty history -> returns fallback "no-evidence"
        empty_catalog_path = Path(tmpdir) / "empty_catalog.yaml"
        with open(empty_catalog_path, "w", encoding="utf-8") as f:
            yaml.dump([], f)
            
        supports_empty = select_supports(
            subject_history=[],
            sensory_context={},
            config_path=empty_catalog_path
        )
        assert len(supports_empty) == 1
        assert supports_empty[0]["type"] == "fallback"
        assert "No evidence-based supports" in supports_empty[0]["description"]


def test_contextual_support_cases_from_recommendation_guide() -> None:
    subject_history = [
        {
            "id": "hist_transition_visual",
            "description": "Usar agenda visual de transiciones ya acordada.",
            "category": "transition",
            "contexts": ["transition"],
            "effective": True,
        },
        {
            "id": "hist_regulation_pause",
            "description": "Pausa breve acordada con el profesional.",
            "category": "regulation",
            "contexts": ["early_dysregulation", "self_regulation"],
            "approved_by_professional": True,
        },
        {
            "id": "hist_help_card",
            "description": "Tarjeta de ayuda registrada para pedir apoyo.",
            "category": "communication",
            "contexts": ["communication"],
            "approved_by_professional": True,
        },
        {
            "id": "hist_reinforcement",
            "description": "Reconocer verbalmente el uso de la pausa acordada.",
            "category": "reinforcement",
            "contexts": ["alternative_behavior"],
            "approved_by_professional": True,
        },
    ]
    context = {
        "routine_change": True,
        "upcoming_transition": True,
        "irritability": True,
        "demand_overload": True,
        "communication_need": True,
        "alternative_behavior_used": True,
        "repeated_unclear_pattern": True,
        "caregiver_view": True,
        "self_regulation_available": True,
        "professional_plan": True,
    }

    supports = select_supports(
        subject_history=subject_history,
        sensory_context=context,
        confidence=ConfidenceLevel.HIGH,
    )
    case_ids = {support["case_id"] for support in supports}

    assert {
        "routine_transition",
        "early_dysregulation",
        "demand_overload",
        "communication_support",
        "alternative_behavior_reinforcement",
        "unclear_repeated_pattern",
        "previously_effective_similar_context",
        "caregiver_context",
        "learned_self_regulation",
    }.issubset(case_ids)
    assert supports[0]["source"] == "historical_support"
    assert supports[0]["case_id"] in {"routine_transition", "previously_effective_similar_context"}
    assert all(support["evidence_bounded"] is True for support in supports)


def test_support_selector_abstains_when_context_is_insufficient() -> None:
    supports = select_supports(
        subject_history=[],
        sensory_context={},
        confidence=ConfidenceLevel.INSUFFICIENT,
        abstained=True,
        missingness=[{"field": "wake_state", "missing": True}],
    )

    assert len(supports) == 1
    assert supports[0]["case_id"] == "insufficient_data"
    assert supports[0]["type"] == "fallback"
    assert "información suficiente" in supports[0]["description"]


def test_registered_only_supports_are_not_invented() -> None:
    context = {
        "communication_need": True,
        "alternative_behavior_used": True,
        "self_regulation_available": True,
    }

    supports = select_supports(
        subject_history=[],
        sensory_context=context,
        confidence=ConfidenceLevel.HIGH,
    )
    case_ids = {support["case_id"] for support in supports}

    assert "communication_support" not in case_ids
    assert "alternative_behavior_reinforcement" not in case_ids
    assert "learned_self_regulation" not in case_ids


def test_support_copy_is_non_prescriptive_and_non_causal() -> None:
    supports = select_supports(
        subject_history=[],
        sensory_context={"routine_change": True, "demand_overload": True},
        confidence=ConfidenceLevel.HIGH,
    )
    forbidden_words = ["tratamiento", "diagnóstico", "causa", "provoca", "debe aplicar", "intervención correcta"]

    for support in supports:
        text = f"{support['description']} {support.get('rationale', '')}".lower()
        assert not any(word in text for word in forbidden_words)


def test_provenance_school_exclusion() -> None:
    # If structured school records were supplied (e.g. has_school_records=True),
    # the exclusion must be observable (excluded_from_core = True).
    # Otherwise, it must be False.
    
    lineage = {"generator": "PAC-A", "seed": 42}
    
    # Case A: School records supplied
    prov_with = build_provenance(
        subject_id="sub_1",
        has_school_records=True,
        lineage=lineage
    )
    assert prov_with["subject_id"] == "sub_1"
    assert prov_with["excluded_from_core"] is True
    assert "school records were excluded" in prov_with["exclusion_reason"].lower()
    assert prov_with["lineage"] == lineage
    
    # Case B: No school records supplied
    prov_without = build_provenance(
        subject_id="sub_1",
        has_school_records=False,
        lineage=lineage
    )
    assert prov_without["subject_id"] == "sub_1"
    assert prov_without["excluded_from_core"] is False
    assert "exclusion_reason" not in prov_without or prov_without["exclusion_reason"] is None

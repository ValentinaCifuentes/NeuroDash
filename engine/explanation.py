from typing import Any

FEATURE_DISPLAY_NAMES = {
    "sleep_quality_mean_1d": "sleep quality in the last day",
    "sleep_quality_mean_3d": "sleep quality in the last 3 days",
    "sleep_quality_mean_7d": "sleep quality in the last 7 days",
    "sleep_quality_mean_14d": "sleep quality in the last 14 days",
    "wake_state_mean_1d": "wake state in the last day",
    "wake_state_mean_3d": "wake state in the last 3 days",
    "wake_state_mean_7d": "wake state in the last 7 days",
    "wake_state_mean_14d": "wake state in the last 14 days",
    "sleep_quality_delta_baseline": "sleep quality deviation from baseline",
    "wake_state_delta_baseline": "wake state deviation from baseline",
}

def generate_non_causal_factors(
    explanations: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    Translates raw feature contributions into user-facing non-causal descriptions.
    Enforces non-causal and non-diagnostic language guidelines.
    """
    factors = []
    for exp in explanations:
        feature = exp["feature"]
        contribution = exp.get("contribution", 0.0)
        value = exp.get("value", 0.0)
        
        display_name = FEATURE_DISPLAY_NAMES.get(feature, feature.replace("_", " "))
        
        if contribution > 0:
            description = f"Recent {display_name} ({value:.1f}) is associated with an increase in observed patterns."
        elif contribution < 0:
            description = f"Recent {display_name} ({value:.1f}) is associated with a decrease in observed patterns."
        else:
            description = f"Recent {display_name} ({value:.1f}) shows no active association with observed patterns."
            
        factors.append({
            "feature": feature,
            "contribution": float(contribution),
            "description": description
        })
        
    return factors

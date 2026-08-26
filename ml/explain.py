from typing import Any


def explain_prediction(
    model: Any,
    feature_names: list[str],
    X: dict[str, float | None]
) -> list[dict[str, Any]]:
    """
    Computes feature contributions for a given prediction.
    Contribution = coefficient * imputed_value.
    Returns features sorted by absolute contribution in descending order.
    """
    coefs = model.coef_[0]
    
    explanations = []
    for i, name in enumerate(feature_names):
        val = X.get(name)
        val_imputed = 0.0 if val is None else float(val)
        coef = float(coefs[i])
        contribution = coef * val_imputed
        
        explanations.append({
            "feature": name,
            "value": val_imputed,
            "coefficient": coef,
            "contribution": contribution
        })
        
    # Sort by absolute contribution descending
    explanations.sort(key=lambda item: abs(item["contribution"]), reverse=True)
    
    return explanations

from typing import Any
import numpy as np
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score


def evaluate_model(
    model: Any,
    X_test: list[dict[str, float | None]],
    y_test: list[bool],
    feature_names: list[str]
) -> dict[str, float]:
    """
    Evaluates model predictions on a test set, returning accuracy, precision, recall, and f1.
    """
    if not X_test or not y_test:
        return {
            "accuracy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1": 0.0
        }
        
    # Convert test set to feature matrix
    X_matrix = []
    for row in X_test:
        feature_vector = []
        for name in feature_names:
            val = row.get(name)
            feature_vector.append(0.0 if val is None else float(val))
        X_matrix.append(feature_vector)
        
    X_arr = np.array(X_matrix)
    y_true = np.array(y_test)
    
    # Predict binary classes
    y_pred = model.predict(X_arr)
    
    # Calculate metrics with zero_division safety
    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    
    return {
        "accuracy": float(acc),
        "precision": float(prec),
        "recall": float(rec),
        "f1": float(f1)
    }

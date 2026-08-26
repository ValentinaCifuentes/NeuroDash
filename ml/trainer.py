from typing import Any
from sklearn.linear_model import LogisticRegression
import numpy as np


class InsufficientDataError(ValueError):
    """Exception raised when there is not enough historical data/labels to train a model."""
    pass


def train_model(
    X_train: list[dict[str, float | None]],
    y_train: list[bool],
    seed: int = 42,
    min_samples: int = 5,
    min_positive_labels: int = 1
) -> tuple[LogisticRegression, list[str], dict[str, Any]]:
    """
    Trains a deterministic regularized LogisticRegression model.
    Checks cold start rules before training.
    """
    # 1. Cold start checks
    if len(X_train) < min_samples:
        raise InsufficientDataError(f"Insufficient samples to train: {len(X_train)} < {min_samples}")
        
    pos_count = sum(1 for label in y_train if label)
    neg_count = len(y_train) - pos_count
    
    if pos_count < min_positive_labels or neg_count < 1:
        raise InsufficientDataError(
            f"Insufficient class balance to train: need at least {min_positive_labels} positive labels "
            f"and 1 negative label. Got {pos_count} positive and {neg_count} negative labels."
        )
        
    # 2. Extract feature names deterministically
    feature_names_set = set()
    for row in X_train:
        feature_names_set.update(row.keys())
    # Sort alphabetically to keep feature order deterministic
    feature_names = sorted(list(feature_names_set))
    
    # 3. Build training matrix X and vector y
    X_matrix = []
    for row in X_train:
        feature_vector = []
        for name in feature_names:
            val = row.get(name)
            # Impute None/missing values with 0.0
            feature_vector.append(0.0 if val is None else float(val))
        X_matrix.append(feature_vector)
        
    X_arr = np.array(X_matrix)
    y_arr = np.array(y_train)
    
    # 4. Train the model deterministically
    model = LogisticRegression(
        penalty="l2",
        C=1.0,
        solver="liblinear",
        random_state=seed
    )
    model.fit(X_arr, y_arr)
    
    metadata = {
        "seed": seed,
        "C": 1.0,
        "penalty": "l2",
        "solver": "liblinear",
        "samples_count": len(X_train),
        "positives_count": pos_count,
        "negatives_count": neg_count
    }
    
    return model, feature_names, metadata

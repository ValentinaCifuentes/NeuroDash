"""Evaluación walk-forward del motor, orientada a la propuesta de valor.

No evalúa solo el clasificador: reproduce también la capa de confianza y
abstención del producto, compara contra baselines triviales y resume las
métricas por fold y por sujeto.

El objetivo es responder preguntas útiles para el producto:
  - ¿cuántas crisis cubre el sistema cuando da una estimación?
  - ¿cuántas falsas alarmas genera por semana?
  - ¿cuánto se abstiene?
  - ¿aporta algo frente a no usar modelo?
  - ¿qué variables explican sus decisiones y son estables entre folds?
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Sequence

import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from engine.abstention import should_abstain
from engine.baseline import build_baseline
from engine.confidence import calculate_confidence
from engine.features import build_features
from engine.schemas import HORIZON_HOURS
from engine.temporal import AvailabilityPolicy
from ml.dataset_builder import CUTOFF_HOURS, build_feature_example, training_cutoffs
from ml.trainer import InsufficientDataError, train_model


# ---------------------------------------------------------------------------
# Construcción de ejemplos y folds temporales
# ---------------------------------------------------------------------------


def _has_prior_crisis(
    occurrences: Sequence[dict[str, Any]],
    cutoff: datetime,
    lookback_hours: int,
) -> bool:
    """Heurística simple: ¿hubo una crisis moderada/severa en las horas previas?"""
    window_start = cutoff - timedelta(hours=lookback_hours)
    for occurrence in occurrences:
        source_ts = occurrence.get("source_timestamp")
        if not isinstance(source_ts, datetime):
            continue
        if window_start < source_ts <= cutoff:
            severity = str(occurrence.get("severity", "")).lower()
            if severity in ("moderate", "severe"):
                return True
    return False


def build_evaluation_examples(
    records: Sequence[dict[str, Any]],
    occurrences: Sequence[dict[str, Any]],
    cutoffs: Sequence[datetime],
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC",
    planned_events: Sequence[dict[str, Any]] | None = None,
    horizon_hours: int = HORIZON_HOURS,
    prior_lookback_hours: int = 24,
) -> list[dict[str, Any]]:
    """Construye un ejemplo evaluable por corte, incluyendo confianza y abstención."""
    active_policy = policy or AvailabilityPolicy()
    events = list(planned_events or [])
    examples: list[dict[str, Any]] = []

    for cutoff in cutoffs:
        baseline = build_baseline(
            records,
            cutoff,
            active_policy,
            timezone=timezone,
        )
        feature_set, label = build_feature_example(
            records=records,
            occurrences=occurrences,
            baseline=baseline,
            cutoff=cutoff,
            policy=active_policy,
            timezone=timezone,
            horizon_hours=horizon_hours,
            planned_events=events,
        )
        confidence = calculate_confidence(feature_set.missingness)
        abstain, abstention_reason = should_abstain(
            feature_set.baseline_maturity,
            confidence,
        )

        examples.append(
            {
                "cutoff": cutoff,
                "features": feature_set.rolling_features,
                "label": bool(label),
                "baseline_maturity": feature_set.baseline_maturity,
                "confidence": confidence.value,
                "abstain": bool(abstain),
                "abstention_reason": abstention_reason,
                "prior_crisis": _has_prior_crisis(
                    occurrences,
                    cutoff,
                    prior_lookback_hours,
                ),
            }
        )

    return examples


def cold_start_case(
    records: Sequence[dict[str, Any]],
    cutoff: datetime,
    policy: AvailabilityPolicy | None = None,
    timezone: str = "UTC",
    planned_events: Sequence[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Reproduce la decisión de abstención para un corte concreto.

    Sirve para mostrar el caso de arranque en frío (por ejemplo, PAC-C): el
    sistema puede tener confianza en los datos que ve y, aun así, abstenerse
    porque la línea base todavía no es suficientemente madura.
    """
    active_policy = policy or AvailabilityPolicy()
    baseline = build_baseline(
        records,
        cutoff,
        active_policy,
        timezone=timezone,
    )
    feature_set = build_features(
        records=records,
        baseline=baseline,
        cutoff=cutoff,
        policy=active_policy,
        timezone=timezone,
        planned_events=list(planned_events or []),
    )
    confidence = calculate_confidence(feature_set.missingness)
    abstain, reason = should_abstain(
        feature_set.baseline_maturity,
        confidence,
    )

    return {
        "cutoff": cutoff,
        "baseline_maturity": feature_set.baseline_maturity,
        "confidence": confidence.value,
        "abstain": bool(abstain),
        "reason": reason,
    }


def walk_forward_folds(
    n_examples: int,
    initial_train: int = 28,
    test_size: int = 7,
    step: int = 7,
) -> list[dict[str, Any]]:
    """Folds de ventana expansiva: entrena con todo el pasado y prueba el bloque siguiente.

    Es una validación temporal honesta: ningún fold usa ejemplos futuros para
    entrenar. El bloque de prueba avanza `step` ejemplos en cada iteración.
    """
    if initial_train < 1:
        raise ValueError("initial_train must be >= 1")
    if test_size < 1:
        raise ValueError("test_size must be >= 1")
    if step < 1:
        raise ValueError("step must be >= 1")

    folds: list[dict[str, Any]] = []
    start = initial_train
    while start + test_size <= n_examples:
        folds.append(
            {
                "fold": len(folds) + 1,
                "train_indices": list(range(0, start)),
                "test_indices": list(range(start, start + test_size)),
            }
        )
        start += step

    return folds


# ---------------------------------------------------------------------------
# Métricas
# ---------------------------------------------------------------------------


def _matrix(
    rows: Sequence[dict[str, float | None]],
    feature_names: Sequence[str],
) -> np.ndarray:
    """Convierte filas de features en matriz, imputando faltantes con 0.0."""
    if not rows:
        return np.empty((0, len(feature_names)), dtype=float)
    return np.array(
        [
            [
                0.0 if row.get(name) is None else float(row[name])
                for name in feature_names
            ]
            for row in rows
        ],
        dtype=float,
    )


def _positive_proba(model: Any, X: np.ndarray) -> np.ndarray:
    """Probabilidad de la clase positiva, sin asumir el orden de `classes_`."""
    probabilities = model.predict_proba(X)
    positive_positions = np.flatnonzero(np.asarray(model.classes_) == 1)
    if len(positive_positions) == 0:
        return np.zeros(len(X), dtype=float)
    return probabilities[:, int(positive_positions[0])]


def _empty_metrics() -> dict[str, Any]:
    return {
        "n": 0,
        "positives": 0,
        "prevalence": 0.0,
        "accuracy": None,
        "balanced_accuracy": None,
        "precision": None,
        "recall": None,
        "specificity": None,
        "f1": None,
        "roc_auc": None,
        "pr_auc": None,
        "brier": None,
        "threshold": 0.5,
        "confusion": {"tn": 0, "fp": 0, "fn": 0, "tp": 0},
    }


def binary_metrics(
    y_true: Sequence[bool | int],
    y_score: Sequence[float],
    threshold: float = 0.5,
) -> dict[str, Any]:
    """Métricas binarias con guardas para folds sin una de las dos clases."""
    y_true_arr = np.asarray(y_true, dtype=int)
    y_score_arr = np.asarray(y_score, dtype=float)

    if len(y_true_arr) == 0:
        return _empty_metrics()

    y_pred = (y_score_arr >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true_arr, y_pred, labels=[0, 1]).ravel()
    positives = int(y_true_arr.sum())
    n = len(y_true_arr)
    has_both_classes = 0 < positives < n

    metrics: dict[str, Any] = {
        "n": n,
        "positives": positives,
        "prevalence": positives / n,
        "accuracy": float(accuracy_score(y_true_arr, y_pred)),
        "balanced_accuracy": (
            float(balanced_accuracy_score(y_true_arr, y_pred))
            if has_both_classes
            else None
        ),
        "precision": float(precision_score(y_true_arr, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true_arr, y_pred, zero_division=0)),
        "specificity": (
            float(tn / (tn + fp)) if (tn + fp) > 0 else None
        ),
        "f1": float(f1_score(y_true_arr, y_pred, zero_division=0)),
        "roc_auc": (
            float(roc_auc_score(y_true_arr, y_score_arr))
            if has_both_classes
            else None
        ),
        "pr_auc": (
            float(average_precision_score(y_true_arr, y_score_arr))
            if has_both_classes
            else None
        ),
        "brier": float(brier_score_loss(y_true_arr, y_score_arr)),
        "threshold": threshold,
        "confusion": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
    }
    return metrics


def _empty_product_metrics() -> dict[str, Any]:
    return {
        "n": 0,
        "n_covered": 0,
        "coverage": 0.0,
        "abstention_rate": 0.0,
        "abstention_reasons": {},
        "confidence_counts": {},
        "high": {},
        "any": {},
    }


def _alert_metrics(
    y_true: np.ndarray,
    y_score: np.ndarray,
    threshold: float,
    n_examples: int,
    total_positives: int,
) -> dict[str, Any]:
    """Métricas de una regla de alerta concreta (HIGH o MEDIUM/HIGH)."""
    if len(y_true) == 0:
        return {
            "threshold": threshold,
            "alerts": 0,
            "alert_rate": 0.0,
            "alerts_per_week": 0.0,
            "precision": None,
            "recall_covered": None,
            "recall_overall": None,
            "false_alarms": 0,
            "false_alarms_per_week": 0.0,
            "missed_crises": 0,
            "confusion": {"tn": 0, "fp": 0, "fn": 0, "tp": 0},
        }

    y_pred = (y_score > threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    weeks = n_examples / 7.0 if n_examples else 0.0

    return {
        "threshold": threshold,
        "alerts": int(y_pred.sum()),
        "alert_rate": float(y_pred.mean()),
        "alerts_per_week": float(y_pred.sum() / weeks) if weeks else 0.0,
        "precision": (
            float(tp / (tp + fp)) if (tp + fp) > 0 else None
        ),
        "recall_covered": (
            float(tp / (tp + fn)) if (tp + fn) > 0 else None
        ),
        "recall_overall": (
            float(tp / total_positives) if total_positives > 0 else None
        ),
        "false_alarms": int(fp),
        "false_alarms_per_week": float(fp / weeks) if weeks else 0.0,
        "missed_crises": int(fn),
        "confusion": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
    }


def product_metrics(
    examples: Sequence[dict[str, Any]],
    y_score: Sequence[float],
    low_threshold: float = 0.3,
    high_threshold: float = 0.7,
) -> dict[str, Any]:
    """Métricas del producto: cobertura, abstención y carga de alertas.

    - `coverage`: proporción de días con estimación (sin abstención).
    - `high`: alerta cuando el score supera el umbral alto (riesgo HIGH).
    - `any`: alerta cuando supera el umbral bajo (MEDIUM o HIGH).
    - `recall_overall`: cuenta las crisis de días abstendidos como no cubiertas.
    """
    if len(examples) == 0:
        return _empty_product_metrics()

    covered_pairs = [
        (example, score)
        for example, score in zip(examples, y_score)
        if not example["abstain"]
    ]
    n = len(examples)
    n_covered = len(covered_pairs)

    abstention_reasons: dict[str, int] = {}
    confidence_counts: dict[str, int] = {}
    for example in examples:
        confidence_counts[example["confidence"]] = (
            confidence_counts.get(example["confidence"], 0) + 1
        )
        if example["abstain"]:
            reason = example.get("abstention_reason") or "unknown"
            abstention_reasons[reason] = abstention_reasons.get(reason, 0) + 1

    y_true = np.asarray([example["label"] for example, _ in covered_pairs], dtype=int)
    scores = np.asarray([score for _, score in covered_pairs], dtype=float)
    total_positives = sum(1 for example in examples if example["label"])

    return {
        "n": n,
        "n_covered": n_covered,
        "coverage": n_covered / n,
        "abstention_rate": 1.0 - (n_covered / n),
        "abstention_reasons": abstention_reasons,
        "confidence_counts": confidence_counts,
        "high": _alert_metrics(
            y_true, scores, high_threshold, n, total_positives
        ),
        "any": _alert_metrics(
            y_true, scores, low_threshold, n, total_positives
        ),
    }


def score_summary(
    y_true: Sequence[bool | int],
    y_score: Sequence[float],
) -> dict[str, Any]:
    """Resume la distribución de scores, separando positivos y negativos.

    Ayuda a detectar un modelo con scores comprimidos: si la media de los
    positivos queda por debajo del umbral de producto, el recall se hunde
    aunque el ranking (AUC) sea bueno.
    """
    y_true_arr = np.asarray(y_true, dtype=int)
    y_score_arr = np.asarray(y_score, dtype=float)
    if len(y_score_arr) == 0:
        return {
            "min": None,
            "max": None,
            "mean": None,
            "mean_positive": None,
            "mean_negative": None,
        }

    positives = y_score_arr[y_true_arr == 1]
    negatives = y_score_arr[y_true_arr == 0]
    return {
        "min": float(y_score_arr.min()),
        "max": float(y_score_arr.max()),
        "mean": float(y_score_arr.mean()),
        "mean_positive": float(positives.mean()) if len(positives) else None,
        "mean_negative": float(negatives.mean()) if len(negatives) else None,
    }


def threshold_sweep(
    y_true: Sequence[bool | int],
    y_score: Sequence[float],
    n_examples: int,
    thresholds: Sequence[float] | None = None,
) -> list[dict[str, Any]]:
    """Barrido de umbrales para ver el trade-off recall / carga de alertas.

    Devuelve una fila por umbral. Es la base para elegir un punto de operación
    con un presupuesto de falsas alarmas, en vez de usar 0.5 por inercia.
    """
    y_true_arr = np.asarray(y_true, dtype=int)
    y_score_arr = np.asarray(y_score, dtype=float)
    if len(y_true_arr) == 0:
        return []

    if thresholds is None:
        thresholds = [round(float(value), 2) for value in np.arange(0.05, 0.96, 0.05)]

    weeks = n_examples / 7.0 if n_examples else 0.0
    total_positives = int(y_true_arr.sum())
    rows: list[dict[str, Any]] = []

    for threshold in thresholds:
        y_pred = (y_score_arr > threshold).astype(int)
        tn, fp, fn, tp = confusion_matrix(
            y_true_arr, y_pred, labels=[0, 1]
        ).ravel()
        precision = float(tp / (tp + fp)) if (tp + fp) > 0 else None
        recall = float(tp / (tp + fn)) if (tp + fn) > 0 else None
        f1 = (
            2 * precision * recall / (precision + recall)
            if precision is not None and recall is not None and (precision + recall) > 0
            else 0.0
        )
        rows.append(
            {
                "threshold": float(threshold),
                "alerts": int(y_pred.sum()),
                "alert_rate": float(y_pred.mean()),
                "alerts_per_week": float(y_pred.sum() / weeks) if weeks else 0.0,
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "false_alarms": int(fp),
                "false_alarms_per_week": float(fp / weeks) if weeks else 0.0,
                "missed_crises": int(fn),
                "confusion": {
                    "tn": int(tn),
                    "fp": int(fp),
                    "fn": int(fn),
                    "tp": int(tp),
                },
            }
        )

    return rows


def select_operating_points(
    sweep: Sequence[dict[str, Any]],
    low_threshold: float,
    high_threshold: float,
    max_false_alarms_per_week: float = 1.0,
) -> dict[str, Any]:
    """Selecciona puntos de operación útiles a partir del barrido.

    - `current_high`: umbral alto configurado para el producto.
    - `current_any`: umbral bajo (cualquier señal).
    - `best_f1`: mejor F1 observado (exploratorio).
    - `recall_at_budget`: máximo recall con <= X falsas alarmas por semana.
    """
    if not sweep:
        return {}

    def closest(threshold: float) -> dict[str, Any]:
        return min(sweep, key=lambda row: abs(row["threshold"] - threshold))

    best_f1 = max(
        sweep,
        key=lambda row: (
            row["f1"],
            row["recall"] if row["recall"] is not None else -1,
            -row["false_alarms_per_week"],
        ),
    )

    within_budget = [
        row
        for row in sweep
        if row["false_alarms_per_week"] <= max_false_alarms_per_week
    ]
    if within_budget:
        recall_at_budget = max(
            within_budget,
            key=lambda row: (
                row["recall"] if row["recall"] is not None else -1,
                -row["false_alarms_per_week"],
            ),
        )
    else:
        recall_at_budget = min(sweep, key=lambda row: row["false_alarms_per_week"])

    return {
        "current_high": closest(high_threshold),
        "current_any": closest(low_threshold),
        "best_f1": best_f1,
        "recall_at_budget": recall_at_budget,
        "max_false_alarms_per_week": max_false_alarms_per_week,
    }


def _metric_summary(
    folds: Sequence[dict[str, Any]],
    keys: Sequence[str],
    section: str = "metrics",
) -> dict[str, Any]:
    """Resume un conjunto de métricas entre folds (media, mediana, rango)."""
    summary: dict[str, Any] = {}
    for key in keys:
        values = [
            fold[section][key]
            for fold in folds
            if fold.get("skipped") is None
            and fold.get(section, {}).get(key) is not None
        ]
        if values:
            summary[key] = {
                "mean": float(np.mean(values)),
                "median": float(np.median(values)),
                "min": float(np.min(values)),
                "max": float(np.max(values)),
                "n": len(values),
            }
        else:
            summary[key] = {
                "mean": None,
                "median": None,
                "min": None,
                "max": None,
                "n": 0,
            }
    return summary


def _product_metric_summary(folds: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Resume las métricas de producto entre folds."""
    summary: dict[str, Any] = {}
    for key in ("coverage", "abstention_rate"):
        values = [
            fold["product"][key]
            for fold in folds
            if fold.get("skipped") is None
        ]
        summary[key] = _summarize_values(values)

    for rule in ("high", "any"):
        for key in (
            "alert_rate",
            "recall_covered",
            "recall_overall",
            "false_alarms_per_week",
            "precision",
        ):
            values = [
                fold["product"][rule][key]
                for fold in folds
                if fold.get("skipped") is None
                and fold["product"][rule].get(key) is not None
            ]
            summary[f"{rule}.{key}"] = _summarize_values(values)
    return summary


def _summarize_values(values: Sequence[float]) -> dict[str, Any]:
    if not values:
        return {
            "mean": None,
            "median": None,
            "min": None,
            "max": None,
            "n": 0,
        }
    return {
        "mean": float(np.mean(values)),
        "median": float(np.median(values)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "n": len(values),
    }


# ---------------------------------------------------------------------------
# Baselines
# ---------------------------------------------------------------------------


def _fit_and_score_baseline(
    strategy: str,
    X_train: np.ndarray,
    y_train: Sequence[bool],
    X_test: np.ndarray,
) -> np.ndarray:
    """Entrena un DummyClassifier y devuelve la probabilidad de la clase positiva."""
    dummy = DummyClassifier(strategy=strategy)
    dummy.fit(X_train, np.asarray(y_train, dtype=int))
    return _positive_proba(dummy, X_test)


def _evaluate_baselines(
    examples: Sequence[dict[str, Any]],
    folds: Sequence[dict[str, Any]],
    low_threshold: float,
    high_threshold: float,
) -> dict[str, Any]:
    """Evalúa baselines triviales sobre los mismos folds out-of-fold."""
    y_true: list[bool] = []
    scores_by_name: dict[str, list[float]] = {
        "majority": [],
        "prior": [],
        "persistence": [],
    }
    test_examples: list[dict[str, Any]] = []

    for fold in folds:
        train = [examples[i] for i in fold["train_indices"]]
        test = [examples[i] for i in fold["test_indices"]]
        if not train or not test:
            continue

        feature_names = sorted(
            {name for example in train for name in example["features"]}
        )
        X_train = _matrix(
            [example["features"] for example in train], feature_names
        )
        X_test = _matrix(
            [example["features"] for example in test], feature_names
        )
        y_train = [example["label"] for example in train]

        y_true.extend(example["label"] for example in test)
        test_examples.extend(test)

        for name, strategy in (("majority", "most_frequent"), ("prior", "prior")):
            try:
                scores_by_name[name].extend(
                    _fit_and_score_baseline(
                        strategy, X_train, y_train, X_test
                    ).tolist()
                )
            except ValueError:
                scores_by_name[name].extend([0.0] * len(test))
        scores_by_name["persistence"].extend(
            1.0 if example["prior_crisis"] else 0.0 for example in test
        )

    results: dict[str, Any] = {}
    for name, scores in scores_by_name.items():
        results[name] = {
            "metrics": binary_metrics(y_true, scores),
            "product": product_metrics(
                test_examples,
                scores,
                low_threshold=low_threshold,
                high_threshold=high_threshold,
            ),
            "predictions": [
                {
                    "cutoff": example["cutoff"].isoformat(),
                    "label": example["label"],
                    "score": float(score),
                }
                for example, score in zip(test_examples, scores)
            ],
        }
    return results


# ---------------------------------------------------------------------------
# Evaluación por sujeto
# ---------------------------------------------------------------------------


def _coefficient_summary(
    coefficients_by_fold: Sequence[dict[str, float]],
) -> list[dict[str, Any]]:
    """Resume coeficientes entre folds: media, desviación y consistencia de signo."""
    if not coefficients_by_fold:
        return []

    feature_names = sorted(
        {name for coefficients in coefficients_by_fold for name in coefficients}
    )
    rows: list[dict[str, Any]] = []
    for name in feature_names:
        values = np.asarray(
            [coefficients.get(name, 0.0) for coefficients in coefficients_by_fold],
            dtype=float,
        )
        positive = int((values > 0).sum())
        negative = int((values < 0).sum())
        sign_consistency = max(positive, negative) / len(values)

        rows.append(
            {
                "feature": name,
                "mean_coefficient": float(values.mean()),
                "std": float(values.std()),
                "mean_abs_coefficient": float(np.abs(values).mean()),
                "sign_consistency": float(sign_consistency),
            }
        )

    rows.sort(key=lambda row: -row["mean_abs_coefficient"])
    return rows


def evaluate_subject(
    subject_id: str,
    records: Sequence[dict[str, Any]],
    occurrences: Sequence[dict[str, Any]],
    planned_events: Sequence[dict[str, Any]] | None = None,
    timezone: str = "UTC",
    initial_train: int = 28,
    test_size: int = 7,
    step: int = 7,
    seed: int = 42,
    low_threshold: float = 0.3,
    high_threshold: float = 0.7,
    horizon_hours: int = HORIZON_HOURS,
    policy: AvailabilityPolicy | None = None,
) -> dict[str, Any]:
    """Evalúa un sujeto con folds temporales y devuelve métricas listas para reportar.

    Hay varias estimaciones por día (`CUTOFF_HOURS`); `initial_train`, `test_size` y
    `step` se cuentan en días, así cada fold empieza y termina en un día completo.
    """
    cutoffs = training_cutoffs(list(records), timezone=timezone)
    per_day = len(CUTOFF_HOURS)
    examples = build_evaluation_examples(
        records=records,
        occurrences=occurrences,
        cutoffs=cutoffs,
        policy=policy,
        timezone=timezone,
        planned_events=planned_events,
        horizon_hours=horizon_hours,
    )
    folds = walk_forward_folds(
        len(examples),
        initial_train=initial_train * per_day,
        test_size=test_size * per_day,
        step=step * per_day,
    )

    fold_results: list[dict[str, Any]] = []
    all_y: list[bool] = []
    all_scores: list[float] = []
    all_examples: list[dict[str, Any]] = []
    coefficients_by_fold: list[dict[str, float]] = []

    for fold in folds:
        train = [examples[i] for i in fold["train_indices"]]
        test = [examples[i] for i in fold["test_indices"]]

        try:
            model, feature_names, metadata = train_model(
                [example["features"] for example in train],
                [example["label"] for example in train],
                seed=seed,
            )
        except InsufficientDataError as error:
            fold_results.append(
                {
                    "fold": fold["fold"],
                    "skipped": str(error),
                    "train_size": len(train),
                    "test_size": len(test),
                    "train_start": train[0]["cutoff"].isoformat(),
                    "train_end": train[-1]["cutoff"].isoformat(),
                    "test_start": test[0]["cutoff"].isoformat(),
                    "test_end": test[-1]["cutoff"].isoformat(),
                }
            )
            continue

        test_rows = [example["features"] for example in test]
        X_test = _matrix(test_rows, feature_names)
        scores = _positive_proba(model, X_test).tolist()
        y_test = [example["label"] for example in test]

        fold_results.append(
            {
                "fold": fold["fold"],
                "skipped": None,
                "train_size": len(train),
                "test_size": len(test),
                "train_start": train[0]["cutoff"].isoformat(),
                "train_end": train[-1]["cutoff"].isoformat(),
                "test_start": test[0]["cutoff"].isoformat(),
                "test_end": test[-1]["cutoff"].isoformat(),
                "model": metadata,
                "metrics": binary_metrics(y_test, scores),
                "product": product_metrics(
                    test,
                    scores,
                    low_threshold=low_threshold,
                    high_threshold=high_threshold,
                ),
            }
        )

        all_y.extend(y_test)
        all_scores.extend(scores)
        all_examples.extend(test)
        coefficients_by_fold.append(
            dict(zip(feature_names, (float(value) for value in model.coef_[0])))
        )

    successful_folds = [fold for fold in fold_results if fold["skipped"] is None]
    pooled_metrics = binary_metrics(all_y, all_scores)
    pooled_product = product_metrics(
        all_examples,
        all_scores,
        low_threshold=low_threshold,
        high_threshold=high_threshold,
    )
    sweep = threshold_sweep(all_y, all_scores, len(all_examples))
    operating_points = select_operating_points(
        sweep,
        low_threshold=low_threshold,
        high_threshold=high_threshold,
    )

    return {
        "subject_id": subject_id,
        "config": {
            # En días; cada día aporta una estimación por hora de `cutoff_hours`.
            "initial_train": initial_train,
            "test_size": test_size,
            "step": step,
            "cutoff_hours": list(CUTOFF_HOURS),
            "seed": seed,
            "horizon_hours": horizon_hours,
            "low_threshold": low_threshold,
            "high_threshold": high_threshold,
            "timezone": timezone,
            "policy": {
                "daily_regulation": (policy or AvailabilityPolicy()).daily_regulation,
                "exclusion_policy": (policy or AvailabilityPolicy()).exclusion_policy,
            },
        },
        "dataset": {
            "n_examples": len(examples),
            "n_positive": sum(1 for example in examples if example["label"]),
            "prevalence": (
                sum(1 for example in examples if example["label"]) / len(examples)
                if examples
                else 0.0
            ),
            "cutoff_start": cutoffs[0].isoformat() if cutoffs else None,
            "cutoff_end": cutoffs[-1].isoformat() if cutoffs else None,
            "n_folds": len(folds),
            "n_successful_folds": len(successful_folds),
        },
        "folds": fold_results,
        "fold_summary": {
            "metrics": _metric_summary(
                successful_folds,
                (
                    "accuracy",
                    "balanced_accuracy",
                    "precision",
                    "recall",
                    "f1",
                    "roc_auc",
                    "pr_auc",
                    "brier",
                ),
            ),
            "product": _product_metric_summary(successful_folds),
        },
        "pooled": {
            "metrics": pooled_metrics,
            "product": pooled_product,
            "score_summary": score_summary(all_y, all_scores),
            "threshold_sweep": sweep,
            "operating_points": operating_points,
        },
        "predictions": [
            {
                "cutoff": example["cutoff"].isoformat(),
                "label": example["label"],
                "score": float(score),
                "abstain": example["abstain"],
                "confidence": example["confidence"],
                "prior_crisis": example["prior_crisis"],
            }
            for example, score in zip(all_examples, all_scores)
        ],
        "baselines": _evaluate_baselines(
            examples,
            folds,
            low_threshold=low_threshold,
            high_threshold=high_threshold,
        ),
        "coefficients": _coefficient_summary(coefficients_by_fold),
    }


def evaluate_subjects(
    subjects: dict[str, dict[str, Any]],
    initial_train: int = 28,
    test_size: int = 7,
    step: int = 7,
    seed: int = 42,
    low_threshold: float = 0.3,
    high_threshold: float = 0.7,
    horizon_hours: int = HORIZON_HOURS,
) -> dict[str, Any]:
    """Evalúa varios sujetos y calcula un promedio macro entre ellos.

    `subjects` mapea `subject_id` a un bundle con `records`, `occurrences`,
    `planned_events`, `profile` y opcionalmente `timezone`.
    """
    results: dict[str, Any] = {}
    for subject_id, bundle in subjects.items():
        profile = bundle.get("profile", {})
        results[subject_id] = evaluate_subject(
            subject_id=subject_id,
            records=bundle["records"],
            occurrences=bundle["occurrences"],
            planned_events=bundle.get("planned_events"),
            timezone=bundle.get("timezone", profile.get("timezone", "UTC")),
            initial_train=initial_train,
            test_size=test_size,
            step=step,
            seed=seed,
            low_threshold=low_threshold,
            high_threshold=high_threshold,
            horizon_hours=horizon_hours,
        )

    macro: dict[str, Any] = {}
    for metric in (
        "precision",
        "recall",
        "f1",
        "roc_auc",
        "pr_auc",
        "brier",
    ):
        values = [
            result["pooled"]["metrics"][metric]
            for result in results.values()
            if result["pooled"]["metrics"][metric] is not None
        ]
        macro[metric] = _summarize_values(values)

    macro_product: dict[str, Any] = {}
    for key in ("coverage", "abstention_rate"):
        values = [
            result["pooled"]["product"][key]
            for result in results.values()
            if result["pooled"]["product"].get(key) is not None
        ]
        macro_product[key] = _summarize_values(values)

    for rule in ("high", "any"):
        for key in (
            "alert_rate",
            "recall_covered",
            "recall_overall",
            "false_alarms_per_week",
            "precision",
        ):
            values = [
                result["pooled"]["product"][rule][key]
                for result in results.values()
                if result["pooled"]["product"][rule].get(key) is not None
            ]
            macro_product[f"{rule}.{key}"] = _summarize_values(values)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            # En días; cada día aporta una estimación por hora de `cutoff_hours`.
            "initial_train": initial_train,
            "test_size": test_size,
            "step": step,
            "cutoff_hours": list(CUTOFF_HOURS),
            "seed": seed,
            "low_threshold": low_threshold,
            "high_threshold": high_threshold,
            "horizon_hours": horizon_hours,
        },
        "subjects": results,
        "macro": {"metrics": macro, "product": macro_product},
    }


# ---------------------------------------------------------------------------
# Serialización y tablas Markdown
# ---------------------------------------------------------------------------


def json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _format_number(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "sí" if value else "no"
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)


def _markdown_table(
    headers: Sequence[str],
    rows: Iterable[Sequence[Any]],
) -> str:
    header = "| " + " | ".join(headers) + " |"
    separator = "| " + " | ".join("---" for _ in headers) + " |"
    body = [
        "| " + " | ".join(_format_number(cell) for cell in row) + " |"
        for row in rows
    ]
    return "\n".join([header, separator, *body])


def format_results_markdown(results: dict[str, Any]) -> str:
    """Genera un informe Markdown legible con las tablas principales."""
    lines: list[str] = [
        "# Evaluación de la propuesta de valor",
        "",
        f"Generado: {results.get('generated_at', '—')}",
        "",
        "> Datos sintéticos. Esta evaluación valida el pipeline y la metodología; "
        "no constituye rendimiento clínico.",
        "",
        "> Las figuras están en `reports/figures/` y en el informe HTML "
        "`reports/evaluacion-propuesta-valor.html`.",
        "",
    ]

    subject_rows = []
    for subject_id, result in results["subjects"].items():
        metrics = result["pooled"]["metrics"]
        subject_rows.append(
            [
                subject_id,
                metrics["n"],
                metrics["positives"],
                metrics["prevalence"],
                metrics["precision"],
                metrics["recall"],
                metrics["f1"],
                metrics["roc_auc"],
                metrics["pr_auc"],
                metrics["brier"],
            ]
        )

    lines.extend(
        [
            "## Resultados por sujeto (out-of-fold)",
            "",
            "Las columnas de precision, recall y F1 usan el umbral 0.5 del "
            "clasificador. Las métricas de producto (umbrales 0.3/0.7) están más abajo.",
            "",
            _markdown_table(
                [
                    "Sujeto",
                    "n",
                    "crisis",
                    "prevalencia",
                    "precision",
                    "recall",
                    "F1",
                    "ROC-AUC",
                    "PR-AUC",
                    "Brier",
                ],
                subject_rows,
            ),
            "",
        ]
    )

    lines.append("### Comparación con baselines")
    lines.append("")
    baseline_labels = {
        "majority": "clase mayoritaria",
        "prior": "prevalencia",
        "persistence": "persistencia 24 h",
    }
    baseline_rows = []
    for subject_id, result in results["subjects"].items():
        for baseline_name, baseline in result["baselines"].items():
            metrics = baseline["metrics"]
            baseline_rows.append(
                [
                    subject_id,
                    baseline_labels.get(baseline_name, baseline_name),
                    metrics["accuracy"],
                    metrics["precision"],
                    metrics["recall"],
                    metrics["f1"],
                    metrics["roc_auc"],
                    metrics["pr_auc"],
                ]
            )
    lines.append(
        _markdown_table(
            [
                "Sujeto",
                "Baseline",
                "accuracy",
                "precision",
                "recall",
                "F1",
                "ROC-AUC",
                "PR-AUC",
            ],
            baseline_rows,
        )
    )
    lines.append("")

    lines.append("### Métricas de producto y carga de alertas")
    lines.append("")
    product_rows = []
    for subject_id, result in results["subjects"].items():
        product = result["pooled"]["product"]
        product_rows.append(
            [
                subject_id,
                product["coverage"],
                product["abstention_rate"],
                product["high"]["alert_rate"],
                product["high"]["recall_covered"],
                product["high"]["false_alarms_per_week"],
                product["any"]["alert_rate"],
                product["any"]["recall_covered"],
                product["any"]["false_alarms_per_week"],
            ]
        )
    lines.append(
        _markdown_table(
            [
                "Sujeto",
                "cobertura",
                "abstención",
                "alerta HIGH",
                "recall HIGH",
                "FA/semana HIGH",
                "alerta MEDIA+",
                "recall MEDIA+",
                "FA/semana MEDIA+",
            ],
            product_rows,
        )
    )
    lines.append("")

    cold_start = results.get("cold_start")
    if cold_start:
        lines.append("### Abstención en arranque en frío")
        lines.append("")
        lines.append(
            "El sistema prefiere no estimar antes que inventar un número cuando "
            "la línea base todavía no es suficientemente madura."
        )
        lines.append("")
        lines.append(
            _markdown_table(
                [
                    "Sujeto",
                    "Días de historial",
                    "Confianza",
                    "Se abstiene",
                    "Motivo",
                ],
                [
                    [
                        cold_start["subject_id"],
                        cold_start["baseline_maturity"],
                        cold_start["confidence"],
                        cold_start["abstain"],
                        cold_start["reason"],
                    ]
                ],
            )
        )
        lines.append("")

    lines.append("### Puntos de operación (out-of-fold)")
    lines.append("")
    operating_rows = []
    for subject_id, result in results["subjects"].items():
        points = result["pooled"]["operating_points"]
        labels = {
            "current_high": "HIGH actual",
            "current_any": "MEDIA+ actual",
            "best_f1": "mejor F1",
            "recall_at_budget": "máx. recall con ≤1 FA/semana",
        }
        for key, label in labels.items():
            point = points.get(key)
            if not point:
                continue
            operating_rows.append(
                [
                    subject_id,
                    label,
                    point["threshold"],
                    point["alerts_per_week"],
                    point["recall"],
                    point["precision"],
                    point["f1"],
                    point["false_alarms_per_week"],
                ]
            )
    lines.append(
        _markdown_table(
            [
                "Sujeto",
                "Punto",
                "umbral",
                "alertas/semana",
                "recall",
                "precision",
                "F1",
                "FA/semana",
            ],
            operating_rows,
        )
    )
    lines.append("")
    lines.append(
        "Los puntos «mejor F1» y «máx. recall con presupuesto» son exploratorios: "
        "se calculan sobre las predicciones out-of-fold y sirven para discutir el "
        "trade-off, no para fijar el umbral final sin validación anidada."
    )
    lines.append("")

    lines.append("### Resumen entre folds")
    lines.append("")
    lines.append(
        "La recall y las falsas alarmas se calculan con el punto de operación "
        "MEDIA+ actual (umbral bajo). La AUC y el Brier son independientes del umbral."
    )
    lines.append("")
    fold_rows = []
    for subject_id, result in results["subjects"].items():
        metrics = result["fold_summary"]["metrics"]
        product = result["fold_summary"]["product"]
        fold_rows.append(
            [
                subject_id,
                product["any.recall_overall"]["median"],
                product["any.recall_overall"]["min"],
                product["any.recall_overall"]["max"],
                product["any.false_alarms_per_week"]["median"],
                metrics["roc_auc"]["median"],
                metrics["pr_auc"]["median"],
                metrics["brier"]["median"],
            ]
        )
    lines.append(
        _markdown_table(
            [
                "Sujeto",
                "recall MEDIA+ (mediana)",
                "recall MEDIA+ (mín)",
                "recall MEDIA+ (máx)",
                "FA/semana MEDIA+ (mediana)",
                "ROC-AUC (mediana)",
                "PR-AUC (mediana)",
                "Brier (mediana)",
            ],
            fold_rows,
        )
    )
    lines.append("")

    lines.append("### Variables con mayor peso")
    lines.append("")
    feature_rows = []
    for subject_id, result in results["subjects"].items():
        for feature in result["coefficients"][:10]:
            feature_rows.append(
                [
                    subject_id,
                    feature["feature"],
                    feature["mean_coefficient"],
                    feature["std"],
                    feature["sign_consistency"],
                ]
            )
    lines.append(
        _markdown_table(
            [
                "Sujeto",
                "Variable",
                "coef. medio",
                "desv.",
                "consistencia de signo",
            ],
            feature_rows,
        )
    )
    lines.append("")
    lines.append(
        "La consistencia de signo indica en qué proporción de folds el coeficiente "
        "mantuvo el mismo signo. Los coeficientes muestran asociación, no causalidad."
    )
    lines.append("")

    return "\n".join(lines)

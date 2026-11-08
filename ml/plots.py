"""Gráficos de la evaluación, pensados para el notebook y el informe.

Usa pandas para ordenar los datos y matplotlib para dibujar. No importa
matplotlib desde `ml/evaluation.py`: así el núcleo de cálculo y los tests
siguen funcionando sin el extra `notebooks`.
"""

from __future__ import annotations

import os
from pathlib import Path
import sys
from typing import Any

import matplotlib

# En consola o CI no hay display: Agg permite guardar figuras sin Tk.
# En Jupyter se respeta el backend inline que ya configuró el kernel.
if "ipykernel" not in sys.modules and not os.environ.get("DISPLAY"):
    matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)

from engine.explanation import FEATURE_DISPLAY_NAMES

SUBJECT_COLORS = ["#0f766e", "#b45309", "#4338ca", "#be123c"]


def _subject_results(results: dict[str, Any]) -> dict[str, Any]:
    return results["subjects"]


def predictions_frame(result: dict[str, Any]) -> pd.DataFrame:
    """DataFrame de predicciones out-of-fold de un sujeto."""
    return pd.DataFrame(result["predictions"])


def _display_feature(feature: str) -> str:
    """Nombre legible para el informe, con fallback para los indicadores *_missing."""
    if feature in FEATURE_DISPLAY_NAMES:
        return FEATURE_DISPLAY_NAMES[feature]
    for suffix, label in (
        ("_missing_1d", "sin dato (último día)"),
        ("_missing_3d", "sin dato (últimos tres días)"),
        ("_missing_7d", "sin dato (últimos siete días)"),
        ("_missing_14d", "sin dato (últimos catorce días)"),
    ):
        if feature.endswith(suffix):
            base = feature[: -len(suffix)]
            base_name = FEATURE_DISPLAY_NAMES.get(
                f"{base}_mean_1d", base.replace("_", " ")
            )
            return f"{base_name} — {label}"
    return feature


def _style_axes(ax: plt.Axes) -> None:
    ax.grid(True, alpha=0.25, linewidth=0.7)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)


def plot_roc_curves(results: dict[str, Any]) -> tuple[plt.Figure, plt.Axes]:
    """ROC por sujeto, con la persistencia como referencia punteada."""
    fig, ax = plt.subplots(figsize=(6.4, 5.2))

    for index, (subject_id, result) in enumerate(_subject_results(results).items()):
        frame = predictions_frame(result)
        y_true = frame["label"].astype(int)
        y_score = frame["score"].astype(float)
        if y_true.nunique() < 2:
            continue
        fpr, tpr, _ = roc_curve(y_true, y_score)
        auc_value = roc_auc_score(y_true, y_score)
        color = SUBJECT_COLORS[index % len(SUBJECT_COLORS)]
        ax.plot(
            fpr,
            tpr,
            color=color,
            linewidth=2,
            label=f"{subject_id} (AUC={auc_value:.3f})",
        )

        baseline = result["baselines"]["persistence"]["predictions"]
        baseline_frame = pd.DataFrame(baseline)
        b_fpr, b_tpr, _ = roc_curve(
            baseline_frame["label"].astype(int),
            baseline_frame["score"].astype(float),
        )
        ax.plot(
            b_fpr,
            b_tpr,
            color=color,
            linestyle="--",
            linewidth=1.2,
            alpha=0.7,
            label=f"{subject_id} persistencia",
        )

    ax.plot([0, 1], [0, 1], color="#94a3b8", linestyle=":", linewidth=1)
    ax.set_xlabel("Tasa de falsos positivos")
    ax.set_ylabel("Tasa de verdaderos positivos (recall)")
    ax.set_title("Curva ROC — predicciones out-of-fold")
    ax.legend(fontsize=8, loc="lower right")
    _style_axes(ax)
    fig.tight_layout()
    return fig, ax


def plot_precision_recall_curves(
    results: dict[str, Any],
) -> tuple[plt.Figure, plt.Axes]:
    """Curva Precision-Recall por sujeto; más informativa que ROC con desbalance."""
    fig, ax = plt.subplots(figsize=(6.4, 5.2))

    for index, (subject_id, result) in enumerate(_subject_results(results).items()):
        frame = predictions_frame(result)
        y_true = frame["label"].astype(int)
        y_score = frame["score"].astype(float)
        if y_true.nunique() < 2:
            continue
        precision, recall, _ = precision_recall_curve(y_true, y_score)
        ap = average_precision_score(y_true, y_score)
        color = SUBJECT_COLORS[index % len(SUBJECT_COLORS)]
        ax.plot(
            recall,
            precision,
            color=color,
            linewidth=2,
            label=f"{subject_id} (PR-AUC={ap:.3f})",
        )

        baseline = pd.DataFrame(result["baselines"]["persistence"]["predictions"])
        b_precision, b_recall, _ = precision_recall_curve(
            baseline["label"].astype(int),
            baseline["score"].astype(float),
        )
        ax.plot(
            b_recall,
            b_precision,
            color=color,
            linestyle="--",
            linewidth=1.2,
            alpha=0.7,
            label=f"{subject_id} persistencia",
        )

    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title("Curva Precision-Recall — predicciones out-of-fold")
    ax.set_xlim(0, 1.02)
    ax.set_ylim(0, 1.02)
    ax.legend(fontsize=8, loc="upper right")
    _style_axes(ax)
    fig.tight_layout()
    return fig, ax


def plot_threshold_tradeoff(
    results: dict[str, Any],
) -> tuple[plt.Figure, plt.Axes]:
    """Recall frente a falsas alarmas por semana, con puntos de operación."""
    fig, ax = plt.subplots(figsize=(7.2, 5.2))

    for index, (subject_id, result) in enumerate(_subject_results(results).items()):
        color = SUBJECT_COLORS[index % len(SUBJECT_COLORS)]
        sweep = pd.DataFrame(result["pooled"]["threshold_sweep"])
        sweep = sweep.dropna(subset=["recall"])
        # Frontera eficiente: para cada nivel de falsas alarmas, el mejor recall.
        frontier = (
            sweep.groupby("false_alarms_per_week", as_index=False)["recall"]
            .max()
            .sort_values("false_alarms_per_week")
        )
        ax.plot(
            frontier["false_alarms_per_week"],
            frontier["recall"],
            color=color,
            linewidth=2,
            marker="o",
            markersize=3,
            label=f"{subject_id} (frontera de umbral)",
        )

        points = result["pooled"]["operating_points"]
        markers = {
            "current_high": ("s", "HIGH actual"),
            "current_any": ("o", "MEDIA+ actual"),
            "recall_at_budget": ("*", "máx. recall ≤1 FA/semana"),
        }
        for key, (marker, label) in markers.items():
            point = points.get(key)
            if not point:
                continue
            ax.scatter(
                point["false_alarms_per_week"],
                point["recall"],
                color=color,
                marker=marker,
                s=90 if key == "recall_at_budget" else 45,
                edgecolor="white",
                linewidth=0.6,
                zorder=5,
            )
            if key == "recall_at_budget":
                ax.annotate(
                    f"{subject_id}\n{label}",
                    (point["false_alarms_per_week"], point["recall"]),
                    textcoords="offset points",
                    xytext=(6, 6),
                    fontsize=8,
                    color=color,
                )

        baseline = result["baselines"]["persistence"]
        baseline_metrics = baseline["metrics"]
        b_fp = baseline_metrics["confusion"]["fp"]
        b_recall = baseline_metrics["recall"]
        b_weeks = baseline_metrics["n"] / 7.0
        if b_recall is not None:
            baseline_x = b_fp / b_weeks if b_weeks else 0
            ax.scatter(
                baseline_x,
                b_recall,
                facecolor="none",
                edgecolor=color,
                marker="D",
                s=55,
                linewidth=1.4,
                label=f"{subject_id} persistencia",
                zorder=4,
            )
            ax.annotate(
                "persistencia",
                (baseline_x, b_recall),
                textcoords="offset points",
                xytext=(5, -12),
                fontsize=7,
                color=color,
            )

    ax.set_xlabel("Falsas alarmas por semana")
    ax.set_ylabel("Recall")
    ax.set_title("Trade-off entre recall y carga de alertas")
    ax.legend(fontsize=8, loc="lower right")
    _style_axes(ax)
    fig.tight_layout()
    return fig, ax


def plot_score_distributions(
    results: dict[str, Any],
) -> tuple[plt.Figure, np.ndarray]:
    """Histograma de scores separando días con y sin crisis."""
    subjects = list(_subject_results(results).items())
    fig, axes = plt.subplots(
        1, len(subjects), figsize=(5.2 * len(subjects), 4.2), squeeze=False
    )
    axes = axes[0]

    for index, (subject_id, result) in enumerate(subjects):
        ax = axes[index]
        frame = predictions_frame(result)
        colors = SUBJECT_COLORS[index % len(SUBJECT_COLORS)]

        frame[frame["label"] == False]["score"].plot.hist(
            bins=12,
            alpha=0.55,
            color="#94a3b8",
            label="sin crisis",
            ax=ax,
        )
        frame[frame["label"] == True]["score"].plot.hist(
            bins=12,
            alpha=0.65,
            color=colors,
            label="con crisis",
            ax=ax,
        )
        for threshold, style, label in (
            (result["config"]["low_threshold"], "--", "umbral bajo"),
            (result["config"]["high_threshold"], ":", "umbral alto"),
        ):
            ax.axvline(threshold, color="#0f172a", linestyle=style, linewidth=1.2)
            ax.text(
                threshold,
                ax.get_ylim()[1] * 0.92,
                label,
                rotation=90,
                fontsize=7,
                ha="right",
                va="top",
            )

        ax.set_title(f"{subject_id} — distribución de scores")
        ax.set_xlabel("Score del modelo")
        ax.set_ylabel("Días")
        ax.legend(fontsize=8)
        _style_axes(ax)

    fig.tight_layout()
    return fig, axes


def plot_confusion_matrices(
    results: dict[str, Any],
) -> tuple[plt.Figure, np.ndarray]:
    """Matrices de confusión con el punto MEDIA+ actual."""
    subjects = list(_subject_results(results).items())
    fig, axes = plt.subplots(
        1, len(subjects), figsize=(4.8 * len(subjects), 4.2), squeeze=False
    )
    axes = axes[0]

    for index, (subject_id, result) in enumerate(subjects):
        ax = axes[index]
        confusion = result["pooled"]["product"]["any"]["confusion"]
        matrix = np.array(
            [
                [confusion["tn"], confusion["fp"]],
                [confusion["fn"], confusion["tp"]],
            ]
        )
        ax.imshow(matrix, cmap="Blues")
        for row in range(2):
            for column in range(2):
                value = matrix[row, column]
                color = "white" if value > matrix.max() / 2 else "#0f172a"
                ax.text(
                    column,
                    row,
                    str(value),
                    ha="center",
                    va="center",
                    fontsize=12,
                    color=color,
                )
        ax.set_xticks([0, 1], ["sin alerta", "alerta"])
        ax.set_yticks([0, 1], ["sin crisis", "crisis"])
        ax.set_xlabel("Predicción")
        ax.set_ylabel("Realidad")
        ax.set_title(f"{subject_id} — matriz de confusión (MEDIA+)")

    fig.tight_layout()
    return fig, axes


def plot_feature_importance(
    results: dict[str, Any],
    top_n: int = 10,
) -> tuple[plt.Figure, np.ndarray]:
    """Coeficientes medios entre folds, con desviación como barra de error."""
    subjects = list(_subject_results(results).items())
    fig, axes = plt.subplots(
        1, len(subjects), figsize=(7.2 * len(subjects), 5.2), squeeze=False
    )
    axes = axes[0]

    for index, (subject_id, result) in enumerate(subjects):
        ax = axes[index]
        frame = pd.DataFrame(result["coefficients"][:top_n]).copy()
        frame = frame.sort_values("mean_abs_coefficient", ascending=True)
        frame["label"] = frame["feature"].map(_display_feature)
        colors = [
            "#0f766e" if value >= 0 else "#be123c"
            for value in frame["mean_coefficient"]
        ]
        ax.barh(
            frame["label"],
            frame["mean_coefficient"],
            xerr=frame["std"],
            color=colors,
            alpha=0.85,
            error_kw={"elinewidth": 0.8, "capsize": 2, "ecolor": "#475569"},
        )
        ax.axvline(0, color="#0f172a", linewidth=0.8)
        ax.set_title(f"{subject_id} — variables con mayor peso")
        ax.set_xlabel("Coeficiente medio entre folds")
        ax.tick_params(axis="y", labelsize=8)
        _style_axes(ax)

    fig.tight_layout()
    return fig, axes


def plot_calibration(
    results: dict[str, Any],
    n_bins: int = 6,
) -> tuple[plt.Figure, plt.Axes]:
    """Curva de confiabilidad simple: score medio vs. tasa observada de crisis."""
    fig, ax = plt.subplots(figsize=(6.4, 5.2))
    edges = np.linspace(0.0, 1.0, n_bins + 1)

    for index, (subject_id, result) in enumerate(_subject_results(results).items()):
        frame = predictions_frame(result)
        frame = frame.assign(
            bin=pd.cut(frame["score"], bins=edges, include_lowest=True)
        )
        grouped = (
            frame.groupby("bin", observed=True)
            .agg(score_medio=("score", "mean"), tasa_observada=("label", "mean"), n=("label", "size"))
            .dropna()
        )
        color = SUBJECT_COLORS[index % len(SUBJECT_COLORS)]
        ax.plot(
            grouped["score_medio"],
            grouped["tasa_observada"],
            marker="o",
            color=color,
            linewidth=2,
            label=f"{subject_id} (Brier={result['pooled']['metrics']['brier']:.3f})",
        )
        for _, row in grouped.iterrows():
            ax.annotate(
                f"n={int(row['n'])}",
                (row["score_medio"], row["tasa_observada"]),
                textcoords="offset points",
                xytext=(4, -10),
                fontsize=6,
                color=color,
            )

    ax.plot([0, 1], [0, 1], color="#94a3b8", linestyle=":", linewidth=1)
    ax.set_xlabel("Score medio del modelo")
    ax.set_ylabel("Tasa observada de crisis")
    ax.set_title("Calibración del score")
    ax.set_xlim(0, 1.02)
    ax.set_ylim(0, 1.02)
    ax.legend(fontsize=8)
    _style_axes(ax)
    fig.tight_layout()
    return fig, ax


def save_figures(
    results: dict[str, Any],
    output_dir: Path | str = "reports/figures",
) -> list[Path]:
    """Genera y guarda todas las figuras en PNG (300 dpi) y SVG."""
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)

    figures = {
        "roc": plot_roc_curves(results),
        "precision_recall": plot_precision_recall_curves(results),
        "threshold_tradeoff": plot_threshold_tradeoff(results),
        "score_distributions": plot_score_distributions(results),
        "confusion_matrices": plot_confusion_matrices(results),
        "feature_importance": plot_feature_importance(results),
        "calibration": plot_calibration(results),
    }

    paths: list[Path] = []
    for name, (figure, _) in figures.items():
        for extension in ("png", "svg"):
            path = destination / f"{name}.{extension}"
            figure.savefig(path, dpi=300, bbox_inches="tight")
            paths.append(path)
        plt.close(figure)

    return paths

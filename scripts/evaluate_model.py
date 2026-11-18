"""Genera la evaluación walk-forward de los perfiles demo.

Uso:
    python scripts/evaluate_model.py
    python scripts/evaluate_model.py --subjects PAC-A PAC-B --initial-train 28
    python scripts/evaluate_model.py --out reports/evaluacion.json

El script escribe un JSON con todos los números y un Markdown con las tablas
principales. No genera gráficos: esas cifras son la fuente para el notebook
y el informe HTML.
"""

import argparse
from datetime import timedelta
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.data_loading import load_subject_data
from ml.evaluation import (
    HIGH_THRESHOLD,
    LOW_THRESHOLD,
    cold_start_case,
    evaluate_subjects,
    format_results_markdown,
    json_default,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluación walk-forward de los modelos por sujeto."
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Directorio con demo_profiles/ y legacy_history/ (por defecto: ./data).",
    )
    parser.add_argument(
        "--subjects",
        nargs="+",
        default=["PAC-A", "PAC-B"],
        help="Sujetos a evaluar (por defecto: PAC-A PAC-B).",
    )
    parser.add_argument(
        "--initial-train",
        type=int,
        default=28,
        help="Ejemplos iniciales de entrenamiento (por defecto: 28).",
    )
    parser.add_argument(
        "--test-size",
        type=int,
        default=7,
        help="Días de prueba por fold (por defecto: 7).",
    )
    parser.add_argument(
        "--step",
        type=int,
        default=7,
        help="Días que avanza el bloque de prueba (por defecto: 7).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Semilla del modelo (por defecto: 42).",
    )
    parser.add_argument(
        "--low-threshold",
        type=float,
        default=LOW_THRESHOLD,
        help=f"Umbral bajo de riesgo (por defecto: {LOW_THRESHOLD}, de config/risk_mapping.yaml).",
    )
    parser.add_argument(
        "--high-threshold",
        type=float,
        default=HIGH_THRESHOLD,
        help=f"Umbral alto de riesgo (por defecto: {HIGH_THRESHOLD}, de config/risk_mapping.yaml).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("reports/evaluacion.json"),
        help="Ruta del JSON de salida.",
    )
    parser.add_argument(
        "--markdown",
        type=Path,
        default=Path("reports/evaluacion.md"),
        help="Ruta del Markdown de salida.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[1]
    data_dir = args.data_dir or (project_root / "data")

    bundles = {}
    for subject_id in args.subjects:
        try:
            bundles[subject_id] = load_subject_data(subject_id, data_dir)
        except FileNotFoundError as error:
            print(f"Se omite {subject_id}: {error}")

    if not bundles:
        raise SystemExit("No hay sujetos evaluables en el directorio de datos.")

    results = evaluate_subjects(
        bundles,
        initial_train=args.initial_train,
        test_size=args.test_size,
        step=args.step,
        seed=args.seed,
        low_threshold=args.low_threshold,
        high_threshold=args.high_threshold,
    )

    # PAC-C es el caso de arranque en frío: no tiene folds, pero sí una
    # decisión de abstención que interesa mostrar junto a los resultados.
    try:
        cold_start_bundle = load_subject_data("PAC-C", data_dir)
        last_record = max(
            record["source_timestamp"]
            for record in cold_start_bundle["records"]
        )
        results["cold_start"] = {
            "subject_id": "PAC-C",
            **cold_start_case(
                records=cold_start_bundle["records"],
                cutoff=last_record + timedelta(days=1),
                timezone=cold_start_bundle["profile"].get("timezone", "UTC"),
                planned_events=cold_start_bundle["planned_events"],
            ),
        }
    except (FileNotFoundError, ValueError):
        pass

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.parent.mkdir(parents=True, exist_ok=True)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            results,
            f,
            ensure_ascii=False,
            indent=2,
            default=json_default,
        )

    markdown = format_results_markdown(results)
    with open(args.markdown, "w", encoding="utf-8") as f:
        f.write(markdown)

    print(f"JSON:     {args.out}")
    print(f"Markdown: {args.markdown}")
    for subject_id, result in results["subjects"].items():
        metrics = result["pooled"]["metrics"]
        product = result["pooled"]["product"]
        print(
            f"{subject_id}: n={metrics['n']} "
            f"prevalencia={metrics['prevalence']:.1%} "
            f"recall={metrics['recall']:.3f} "
            f"f1={metrics['f1']:.3f} "
            f"cobertura={product['coverage']:.1%} "
            f"FA/semana(HIGH)={product['high']['false_alarms_per_week']:.2f}"
        )


if __name__ == "__main__":
    main()

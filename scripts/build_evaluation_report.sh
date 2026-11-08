#!/usr/bin/env bash
# Ejecuta el notebook de evaluación y genera el informe HTML reproducible.
#
#   bash scripts/build_evaluation_report.sh
#
# El HTML queda en reports/evaluacion-propuesta-valor.html. El notebook se
# ejecuta de principio a fin, así que el informe refleja los datos y modelos
# actuales, no una salida guardada a mano.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p reports

uv run --extra notebooks jupyter nbconvert \
  --execute \
  --to html \
  notebooks/evaluacion_propuesta_valor.ipynb \
  --output evaluacion-propuesta-valor.html \
  --output-dir reports

printf '\nInforme: %s/reports/evaluacion-propuesta-valor.html\n' "$ROOT"

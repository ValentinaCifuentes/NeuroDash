#!/usr/bin/env bash
# Deja la demo lista para grabar: historiales que terminan el día anterior a la
# grabación, el Mi Día de esa mañana (07:45) en PAC-A y PAC-B, modelos reentrenados, fixtures del front al día, Docker con datos
# limpios y una comprobación de los tres estados en la app levantada.
#
#   bash scripts/prepare_demo.sh                 # graba hoy
#   bash scripts/prepare_demo.sh 2026-11-20      # graba ese día
#   bash scripts/prepare_demo.sh 2026-11-20 --no-docker   # solo datos y modelos
#
# ⚠️ `docker compose down -v` borra lo registrado en la app (volúmenes
# neuradash-data y neuradash-models). El script pregunta antes; con --yes no pregunta.
#
# Variables opcionales: DEMO_URL (por defecto http://localhost:8090, donde se graba),
# y las de Compose (COMPOSE_PROJECT_NAME, COMPOSE_FILE) para levantar otra pila.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECORDING_DATE="$(date +%F)"
DOCKER=1
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --no-docker) DOCKER=0 ;;
    --yes) ASSUME_YES=1 ;;
    ????-??-??) RECORDING_DATE="$arg" ;;
    *) echo "Uso: bash scripts/prepare_demo.sh [AAAA-MM-DD] [--no-docker] [--yes]" >&2; exit 2 ;;
  esac
done
END_DATE="$(date -d "$RECORDING_DATE -1 day" +%F)"
DEMO_URL="${DEMO_URL:-http://localhost:8090}"

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

# --- 1. Datos y modelos (en la imagen del backend: no hay que instalar nada) ---
step "Historiales hasta el $END_DATE (grabación: $RECORDING_DATE) y modelos nuevos"
if ! docker image inspect neuradash-backend >/dev/null 2>&1; then
  (cd "$ROOT" && docker compose build backend)
fi
# Modelos desde cero: el nuevo queda como versión 1.
rm -rf "$ROOT/models/PAC-A" "$ROOT/models/PAC-B"
docker run --rm -v "$ROOT":/work -w /work \
  -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONPATH=/work \
  neuradash-backend sh -c "
    set -e
    python scripts/generate_mock_histories.py --end-date $END_DATE
    python scripts/train_demo_models.py
    python scripts/smoke_demo.py
    python scripts/export_contract_fixture.py
    uv pip install -q --target /tmp/deps httpx==0.28.1 >/dev/null
    PYTHONPATH=/work:/tmp/deps python scripts/export_mock_fixture.py 2>/dev/null
  "

if [ "$DOCKER" -eq 0 ]; then
  printf '\n\033[1;32m✔ Datos y modelos listos.\033[0m Para la app: docker compose down -v && docker compose up --build -d\n'
  exit 0
fi

# --- 2. Docker con datos limpios ---
step "Docker con datos limpios"
if [ "$ASSUME_YES" -eq 0 ]; then
  read -r -p "Esto borra lo registrado en la app (docker compose down -v). ¿Seguir? [s/N] " answer
  [[ "$answer" =~ ^[sS]$ ]] || { echo "Cancelado. Datos y modelos ya están listos."; exit 1; }
fi
(cd "$ROOT" && docker compose down -v && docker compose up --build -d)

# --- 3. Comprobación en la app levantada ---
step "Comprobando los estados en $DEMO_URL"
for _ in $(seq 1 60); do
  curl -fsS "$DEMO_URL/api/v1/subjects" >/dev/null 2>&1 && break
  sleep 2
done
DEMO_URL="$DEMO_URL" python3 - <<'PY'
import json, os, sys, urllib.request
from datetime import datetime, timezone

url = os.environ["DEMO_URL"]
# PAC-A abre en moderado (su Mi Día de hoy: mala noche) y sube a elevado al registrar
# desregulaciones leves; ver docs/guia-grabacion-demo.md.
expected = {"PAC-A": "MEDIUM", "PAC-B": "LOW", "PAC-C": None}
ok = True
for subject, risk in expected.items():
    body = json.dumps({"subject_id": subject, "prediction_cutoff": datetime.now(timezone.utc).isoformat()}).encode()
    request = urllib.request.Request(f"{url}/api/v1/predictions", data=body, headers={"Content-Type": "application/json"})
    contract = json.load(urllib.request.urlopen(request))
    state = "sin estimación" if contract["abstained"] else f"{contract['risk']} · confianza {contract['confidence']}"
    good = contract["risk"] == risk and contract["horizon_hours"] == 8
    ok &= good
    print(f"  {'✔' if good else '✘'} {subject}: {state}")
sys.exit(0 if ok else 1)
PY

printf '\n\033[1;32m✔ Demo lista en %s\033[0m (guía: docs/guia-grabacion-demo.md)\n' "$DEMO_URL"

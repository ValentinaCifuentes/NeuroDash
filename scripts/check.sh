#!/usr/bin/env bash
# Corre todas las comprobaciones del proyecto: pruebas del backend y, en el
# front, tipos, pruebas y build. Es lo mismo que corre GitHub en cada push
# (.github/workflows/tests.yml).
#
#   bash scripts/check.sh            # todo
#   bash scripts/check.sh backend    # solo el backend
#   bash scripts/check.sh front      # solo el front
#
# Backend: si hay `pytest` en este Python lo usa; si no, corre dentro de la
# imagen de Docker del backend (`neuradash-backend`, la construye si falta) con
# el repo montado en solo lectura: no hay que instalar nada y no escribe en tus
# archivos. Front: necesita Node 20+ (instala dependencias si faltan).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"
PYTEST_DEPS="pytest==8.3.5 httpx==0.28.1"   # mismo «dev» de pyproject.toml

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

backend() {
  step "Backend · pytest"
  if python3 -c "import pytest, httpx, fastapi, sklearn" >/dev/null 2>&1; then
    (cd "$ROOT" && python3 -m pytest -q -p no:cacheprovider)
    return
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "No hay pytest en este Python ni Docker. Instala las dependencias (uv sync --extra dev) o Docker." >&2
    exit 1
  fi
  if ! docker image inspect neuradash-backend >/dev/null 2>&1; then
    echo "Construyendo la imagen neuradash-backend…"
    (cd "$ROOT" && docker compose build backend)
  fi
  docker run --rm \
    -v "$ROOT":/work:ro -w /work \
    -u "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONPATH=/work \
    neuradash-backend sh -c "
      uv pip install -q --target /tmp/deps $PYTEST_DEPS >/dev/null &&
      PYTHONPATH=/work:/tmp/deps python -m pytest -q -p no:cacheprovider
    "
}

front() {
  cd "$ROOT/front"
  if [ ! -d node_modules ]; then
    step "Front · instalando dependencias (npm ci)"
    npm ci
  fi
  step "Front · tipos (tsc)"
  npm run typecheck
  step "Front · pruebas (vitest)"
  npx vitest run
  step "Front · build"
  npm run build
}

case "$TARGET" in
  all) backend; front ;;
  backend) backend ;;
  front) front ;;
  *) echo "Uso: bash scripts/check.sh [all|backend|front]" >&2; exit 2 ;;
esac

printf '\n\033[1;32m✔ Todo en orden.\033[0m\n'

# Backend NeuroDash (FastAPI)
# El código resuelve config/, data/ y models/ con rutas relativas a __file__,
# así que se ejecuta desde el árbol de fuentes (/app) sin instalar el proyecto.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app

WORKDIR /app

# Dependencias primero para aprovechar la caché de capas
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY backend ./backend
COPY engine ./engine
COPY ml ./ml
COPY config ./config
COPY scripts ./scripts
COPY data ./data
COPY models ./models

RUN useradd --create-home --uid 1000 app && chown -R app:app /app/data /app/models
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

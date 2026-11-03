# NeuroDash

NeuroDash es una aplicación de apoyo no diagnóstico para registros de cuidadores y
predicciones seguras orientadas a tendencias.
Combina un backend de FastAPI y un frontend de React/TypeScript.

> **Límite de seguridad:** NeuroDash comunica incertidumbre, asociaciones
> observadas y opciones de apoyo. No es una herramienta de diagnóstico, causal,
> clínica ni de toma de decisiones de emergencia. No utilice datos de demostración
> ni sintéticos para tomar decisiones clínicas.

## Estado actual

El repositorio contiene una demostración funcional y un flujo de validación. El
frontend ofrece actualmente:

- Incorporación de sujetos por parte del cuidador, registros diarios, registro de
  eventos y estados de predicción de Evolución.
- Vistas de planificación y seguimiento, incluidas **Planificación** y **Seguimiento**.
- Adaptadores explícitos para el modo simulado y el backend real que utilizan el
  mismo contrato del frontend.

Algunas entradas de navegación siguen siendo marcadores de posición no funcionales
de forma intencionada (por ejemplo, los tickets de soporte). Los datos de ML utilizados por la demostración son sintéticos
o datos locales de desarrollo; esto no es un despliegue de producción.

## Inicio rápido

### Requisitos previos

- Python 3.12 or newer
- Node.js and npm

### Instalar las dependencias del backend

Desde la raíz del repositorio:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install --upgrade pip
py -m pip install -e ".[dev]"
```

En macOS/Linux, utilice `python3.12 -m venv .venv`,
`source .venv/bin/activate` y `python -m pip install -e ".[dev]"`.

### Ejecutar el backend

```powershell
uvicorn backend.app.main:app --reload --port 8000
```

Enlaces útiles mientras está en ejecución:

- Estado: <http://localhost:8000/health>
- Documentación de OpenAPI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>

El punto de entrada de la API es `backend.app.main:app`. Las rutas se agrupan bajo
`/api/v1` e incluyen sujetos, registros diarios y eventos, predicciones y
perfiles de demostración.

### Ejecutar el frontend

En una segunda terminal:

```powershell
cd front
npm install
npm run dev
```

Abra la URL de Vite, normalmente <http://localhost:5173>.

De forma predeterminada, el frontend responde desde `front/src/mocks/mockBackend.ts`:
las mismas rutas y el mismo JSON que FastAPI, con las demos PAC-A/B/C exportadas de la
demo real. No ejecuta el motor de ML (la estimación no cambia al registrar) y lo
registrado se borra al recargar. Para utilizar el backend de FastAPI en su lugar:

```powershell
Copy-Item .env.example .env
# Set VITE_API_BASE=http://localhost:8000 in front/.env
npm run dev
```

Los encabezados del actor de desarrollo utilizados para las operaciones protegidas
no constituyen un proveedor de identidad de producción.

### Ejecutar con Docker

Requiere Docker con Compose. Desde la raíz del repositorio:

```bash
docker compose up --build
```

- Frontend: <http://localhost:8080> (nginx reenvía `/api` al backend)
- Backend: <http://localhost:8000/docs>

`data/` y `models/` se guardan en los volúmenes `neuradash-data` y
`neuradash-models`, por lo que los cambios sobreviven a los reinicios. Para volver
a los datos del repositorio, use `docker compose down -v`.

El frontend se compila con `VITE_API_BASE=http://localhost:8080` y guarda como el
tutor fijo `tutor-demo` (la autenticación está fuera de alcance). Si lo sirve desde
otra URL, o quiere otro actor, defina las variables antes de compilar (por ejemplo
en un `.env` en la raíz). El backend solo acepta los roles `tutor` y `system`:

```bash
VITE_API_BASE=http://mi-servidor:8080
VITE_ACTOR_ID=tutor-demo
VITE_ACTOR_ROLE=tutor
```

Con `VITE_API_BASE` definida vacía, la UI usa el mock en memoria y no llama al
backend (es secundario: la demo del congreso es un video grabado con el backend):

```bash
VITE_API_BASE= docker compose up --build -d frontend
```

Para volver a la API real, compile otra vez sin definir la variable
(`docker compose up --build -d`).

### Antes de una demo: refrescar PAC-A/B/C

El historial sintético de las demos termina en una fecha fija (por defecto, el día
anterior a cuando se generó). Unos días después, las ventanas de 1–14 días quedan sin
datos y PAC-A y PAC-B pasan a «Sin estimación». El día anterior a la presentación,
genere el historial con la fecha de término y reentrene:

```bash
python scripts/generate_mock_histories.py --end-date 2026-11-20
python scripts/train_demo_models.py
python scripts/smoke_demo.py
python scripts/export_contract_fixture.py
python scripts/export_mock_fixture.py
```

Los dos últimos actualizan lo que usa el front sin backend: el fixture de contrato de
las pruebas y las demos del modo sin servidor (`front/src/mocks/demo-fixture.json`,
usado con `VITE_API_BASE=`). El modo sin servidor corre las fechas solo, para que la
demo termine siempre el día anterior.

Antes de entrenar, borre `models/PAC-A` y `models/PAC-B`, para que el modelo nuevo sea
la versión 1. Después reconstruya con datos limpios: `docker compose down -v` y
`docker compose up --build -d`. Estados esperados: **PAC-A** riesgo elevado,
**PAC-B** riesgo bajo, **PAC-C** sin estimación (lo verifica `tests/unit/test_demo_states.py`).

## Pruebas y validación

Un solo comando corre todo: pruebas del backend y, en el front, tipos, pruebas y
build. Desde la raíz:

```bash
bash scripts/check.sh            # todo
bash scripts/check.sh backend    # solo el backend
bash scripts/check.sh front      # solo el front
```

Si en su Python no están las dependencias de desarrollo, el backend se prueba dentro
de la imagen de Docker (`neuradash-backend`) con el repo en solo lectura: no hay que
instalar nada. El front necesita Node 20.

GitHub corre lo mismo en cada push y pull request (`.github/workflows/tests.yml`) y
marca el commit con ✓ o ✗.

Por separado, sin el script:

```bash
uv sync --extra dev && uv run pytest          # backend (o: py -m pytest)
cd front && npm run typecheck && npx vitest run && npm run build
```

## Flujo de reproducibilidad

El flujo determinista genera historiales sintéticos, valida sus esquemas, entrena
modelos de demostración y ejecuta una comprobación integral. Desde la raíz del
repositorio:

```powershell
python scripts/generate_mock_histories.py
python scripts/validate_source_data.py data/legacy_history/PAC-A_history.json
python scripts/validate_source_data.py data/legacy_history/PAC-B_history.json
python scripts/validate_source_data.py data/legacy_history/PAC-C_history.json
python scripts/train_demo_models.py
python scripts/smoke_demo.py
```

PAC-A y PAC-B tienen suficiente historial sintético para el entrenamiento. PAC-C es
un caso de inicio en frío y debe abstenerse de forma segura en lugar de producir una
predicción. Para consultar la explicación completa de los artefactos generados, la
procedencia y los resultados esperados, consulte la [Guía de reproducibilidad y
verificación](docs/NeuraDash_Reproducibility_and_Verification_Guide.md).

## Estructura del repositorio

```text
backend/app/   FastAPI application, routes, schemas, and services
engine/        Temporal features, confidence, safety, and prediction logic
ml/            Dataset building, training, evaluation, and model registry
front/         Vite/React/TypeScript caregiver UI
scripts/       Synthetic-data, training, and verification commands
tests/         Backend unit/integration tests
docs/          Product, architecture, and verification guides
openspec/      Spec-driven development artifacts
config/        Runtime and model configuration
data/          Local demo and generated data
models/        Local generated model artifacts
```

## Aviso sobre privacidad e identidad de producción

Utilice únicamente datos sintéticos o debidamente autorizados durante el desarrollo.
Los historiales de demostración y los artefactos de modelos locales
no constituyen un almacén de datos de producción. Antes del despliegue, añada
controles verificados de autenticación, autorización y consentimiento del sujeto,
reemplace los encabezados de desarrollo `X-Actor-Id` y `X-Actor-Role`, proteja el
almacenamiento y el transporte, y complete una revisión adecuada de privacidad y
seguridad clínica. Las predicciones deben seguir siendo no diagnósticas y conscientes
de la incertidumbre.

## Documentación adicional

- [Fuente de verdad del producto](docs/NeuraDash_Source_of_Truth_Contexto_Maestro_CONSISTENTE.md)
- [Arquitectura técnica](docs/NeuraDash_Arquitectura_Tecnica_Completa_CONSISTENTE.md)
- [Casos y recomendaciones](docs/NeuraDash_Casos_y_Recomendaciones.md)
- [Flujo de OpenSpec](openspec/README.md)

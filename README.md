# NeuroDash

NeuroDash acompaña a quien cuida a un infante neurodivergente (el **tutor**): registra
cómo va el día y muestra una estimación del riesgo de desregulación en las próximas
8 horas, con la confianza de esa estimación, las señales que la explican y apoyos
concretos. Backend en FastAPI (motor y modelo por infante) y frontend en
React/TypeScript.

> **Límite de seguridad:** NeuroDash comunica incertidumbre, asociaciones
> observadas y opciones de apoyo. No es una herramienta de diagnóstico, causal,
> clínica ni de toma de decisiones de emergencia. No utilice datos de demostración
> ni sintéticos para tomar decisiones clínicas.

## Estado actual

Demostración funcional para el congreso, con tres infantes sintéticos:
**PAC-A** (riesgo elevado), **PAC-B** (riesgo bajo) y **PAC-C** (sin estimación:
solo 2 días de historial).

- **Evolución:** estimación de las próximas 8 h (riesgo y confianza por separado),
  «Por qué aparece así» comparado con lo habitual del infante, qué dato falta y
  «Qué puedo hacer ahora». **Seguimiento:** calendario del mes y comparación de 14 días.
- **Bitácora:** estado basal y contexto del día, registro de eventos en 4 categorías,
  Historial de Hoy.
- **Selección y perfil en 3 pasos**, y **Ficha** con el perfil completo.
- **Planificación** (mock en el navegador; no llega al modelo) y **Mis Tickets**
  (fuera de alcance).

El diseño está en `docs/rediseno/` y el frontend se describe en
[`front/README.md`](front/README.md). Los datos de la demostración son sintéticos;
esto no es un despliegue de producción.

## Inicio rápido

### Requisitos previos

- Python 3.12 o superior (o Docker con Compose)
- Node.js 20 y npm (para el front fuera de Docker)

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

### Grabar la demo: refrescar PAC-A/B/C

El historial sintético de las demos termina en una fecha fija. Unos días después, las
ventanas de 1–14 días quedan sin datos y PAC-A y PAC-B pasan a «Sin estimación». **El
día de la grabación**, un solo comando deja todo listo y lo comprueba:

```bash
bash scripts/prepare_demo.sh              # graba hoy (o: … 2026-11-20)
```

Genera los historiales hasta el día anterior, reentrena, actualiza los fixtures del
front, reinicia Docker con datos limpios (pregunta antes de borrar) y verifica los tres
estados en <http://localhost:8080>. El recorrido sugerido para el video está en la
[guía de grabación](docs/guia-grabacion-demo.md).

Los pasos por separado, si hiciera falta:

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
backend/app/   API FastAPI: rutas, esquemas y servicio de estimación
engine/        Motor: variables por ventana, línea base, confianza, explicación y apoyos
ml/            Datos sintéticos, entrenamiento, evaluación y registro de modelos
front/         App del tutor (Vite + React + TypeScript); ver front/README.md
scripts/       Generar demos, entrenar, verificar, exportar fixtures, check.sh, prepare_demo.sh
tests/         Pruebas unitarias y de integración del backend
docs/          Producto, arquitectura, rediseño, guía de grabación y accesibilidad
openspec/      Registro del desarrollo guiado por especificaciones
config/        Configuración del motor (confianza, apoyos, riesgo)
data/          Perfiles e historiales de las demos
models/        Modelos entrenados de las demos
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

- [Guía para grabar la demo](docs/guia-grabacion-demo.md)
- [Revisión de accesibilidad](docs/revision-accesibilidad.md)
- [Rediseño: especificación y pantallas](docs/rediseno/README.md)
- [Pendientes del rediseño](docs/pendientes-rediseno.md)

- [Fuente de verdad del producto](docs/NeuraDash_Source_of_Truth_Contexto_Maestro_CONSISTENTE.md)
- [Arquitectura técnica](docs/NeuraDash_Arquitectura_Tecnica_Completa_CONSISTENTE.md)
- [Casos y recomendaciones](docs/NeuraDash_Casos_y_Recomendaciones.md)
- [Flujo de OpenSpec](openspec/README.md)

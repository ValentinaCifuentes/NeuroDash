# NeuroDash · frontend

App para la persona que cuida (el **tutor**): registra cómo va el día del infante y
ve una estimación de las próximas 8 horas, con lo que puede hacer al respecto.
React 18 + TypeScript + Vite. El diseño sale de `docs/rediseno/`
(`screens/*.html` es la referencia visual; `DESIGN-SPEC.md` y `SCREENS.md` lo explican).

---

## Cómo correrlo

Con Docker, desde la raíz del repo (front + backend; ver el README raíz):

```bash
docker compose up --build        # http://localhost:8090
```

Solo el front, en desarrollo:

```bash
npm install
npm run dev                      # http://localhost:5173
```

Sin `VITE_API_BASE`, el front responde desde `src/mocks/mockBackend.ts` (ver
«Modo sin servidor»). Para usar el backend real en desarrollo:

```bash
cp .env.example .env             # VITE_API_BASE=http://localhost:8000
npm run dev
```

Comprobaciones (también corren en GitHub en cada push; ver `scripts/check.sh`):

```bash
npm run typecheck                # tsc --noEmit
npx vitest run                   # pruebas
npm run build                    # dist/
```

---

## Pantallas

La barra inferior tiene 4 pestañas. Cada vista es una ruta con `#` (funciona el
botón «atrás» y al recargar se vuelve a la misma vista):

| Pestaña | Rutas | Qué muestra |
|---|---|---|
| Evolución | `#evolucion` · `#seguimiento` | Estimación de las próximas 8 h (riesgo, confianza, por qué, qué falta, apoyos) · calendario del mes y comparación de 14 días |
| Bitácora | `#bitacora` · `#historial` | Mi Día (estado basal y contexto del día) y el «+» para registrar eventos · lo registrado hoy |
| Planificación | `#planificacion` | Agenda de lo que viene con la expectativa de cada evento (mock en el navegador, D6) |
| Ficha | `#ficha` · `#tickets` | Perfil del infante · Mis Tickets (fuera de alcance) |

Antes de todo, la **selección de infante** (con alta rápida o perfil en 3 pasos).
Las hojas inferiores: categorías y registro de eventos, «Por qué aparece así»,
«Puede mejorar la lectura» y «Añadir evento».

---

## Estructura

```text
src/
├── App.tsx                 Rutas, encabezado, barra inferior, hojas y avisos
├── api.ts                  Único punto que conoce el backend: rutas, cabeceras y adaptadores
├── types.ts                Tipos de la interfaz (espejo del contrato del backend)
├── domain/                 Reglas sin pantalla, probadas aparte
│   ├── catalog.ts          Opciones, etiquetas, colores y formas (sin emoji)
│   ├── aggregate.ts        Seguimiento: resumen por día y comparación semanal
│   ├── history.ts          Historial de Hoy: filas y resúmenes legibles
│   ├── profile.ts          Lectura del perfil (Ficha, señales de la Bitácora)
│   ├── onboarding.ts       Perfil en 3 pasos → POST /subjects
│   ├── planning.ts         Planificación (mock en el navegador)
│   ├── ids.ts              Claves de reintento (también fuera de https)
│   └── subjectIdentity.ts  Identificador e iniciales del infante
├── components/             Piezas reutilizables (controles, medidor, barra, hojas…)
├── sheets/                 Hojas de registro y de la estimación
├── pages/                  Una por pantalla
├── mocks/                  Modo sin servidor (mockBackend.ts + demo-fixture.json)
└── styles/neurodash.css    Única hoja de estilos: tokens --nd-* y componentes
```

---

## Contrato con el backend

```http
GET  /api/v1/subjects
POST /api/v1/subjects
GET  /api/v1/subjects/{id}
GET  /api/v1/subjects/{id}/timeline?as_of=…&days=…
POST /api/v1/subjects/{id}/daily-records
POST /api/v1/subjects/{id}/events
POST /api/v1/predictions
POST /api/v1/predictions/{id}/outcome
```

- El front **nunca manda variables calculadas**: solo lo que eligió el tutor (texto),
  el momento y una clave de reintento. El backend guarda el texto en `raw` y lo
  traduce a números para el modelo.
- Guardar lleva `X-Actor-Id` / `X-Actor-Role` (por defecto `tutor-demo` / `tutor`,
  configurables al compilar). La autenticación está fuera de alcance.
- Cada guardado lleva una `idempotency_key` que se reutiliza si hay que reintentar:
  una respuesta perdida no duplica el registro.
- «Sin estimación» llega como respuesta válida (`abstained: true`), no como error: la
  pantalla lo dice y muestra qué falta.

---

## Decisiones de diseño

- **Paleta propia «Cerezo y pizarra».** Tokens `--nd-*` en `styles/neurodash.css`.
  El riesgo usa azul / ámbar / rojo profundo, nunca verde-rojo, y siempre va con
  forma o texto (● ◆ ▲, barras): ningún estado se comunica solo por color.
- **Sin roles profesionales.** La app es para el tutor. No hay vistas clínicas
  ni lenguaje de diagnóstico.
- **Horizonte de 8 h, desde el contrato.** El front no fija el número: lo lee de
  `horizon_hours`.
- **Riesgo y confianza son ejes separados.** Una estimación puede ser elevada con
  confianza baja, y se dice así.
- **Lenguaje no causal.** Los factores «aparecen junto a» más o menos riesgo; no lo
  causan. Cada señal se compara con lo habitual del propio infante
  («Despertó más irritable que de costumbre…») y se muestran primero las coherentes.
- **Procedencia al pie de «Por qué aparece así».** Dice si la estimación usa datos
  sintéticos (demos) o los registrados para ese infante.
- **Nada viene preseleccionado.** Lo que el tutor no responde no se envía: un día
  sin dato no se confunde con un día «normal».
- **`nivel_regulacion_general_dia` no está en Mi Día.** Se conoce al cierre del día,
  así que no puede alimentar la estimación de ese mismo día (el motor la lee desde
  el día anterior).
- **Texto del tutor ≠ valor del modelo.** `domain/catalog.ts` separa lo que viaja
  («Dificultad de Conciliación») de lo que se lee («Muy Difícil»).

---

## Modo sin servidor (secundario)

Sin `VITE_API_BASE`, `api.ts` no llama a la red: `mocks/mockBackend.ts` responde las
mismas rutas con el mismo JSON que FastAPI, y pasa por los mismos adaptadores. Las
demos PAC-A/B/C salen de la demo real (`scripts/export_mock_fixture.py`) y sus fechas
se corren solas para terminar «ayer». **No es el motor:** la estimación no cambia
al registrar, y lo registrado se borra al recargar. Sirve para trabajar el front
sin levantar el backend; la demostración se graba con el backend.

---

## Accesibilidad

- Grupos de una opción como `radiogroup` con flechas y una sola parada de Tab;
  los de varias, como casillas. Interruptor con `role="switch"`.
- Hojas inferiores como diálogo: atrapan el foco, cierran con `Esc` y lo devuelven
  al botón que las abrió.
- Medidor de riesgo con `role="img"` y descripción en texto; barra de intensidad
  con su valor en palabras («6, moderado»).
- Área táctil mínima de 44 × 44 px; enlace «Saltar al contenido».
- `prefers-reduced-motion` y `prefers-reduced-transparency` respetados.
- `src/a11y.test.tsx` corre axe-core sobre cada pantalla y hoja, y
  `components/keyboard.test.tsx` prueba el teclado. La revisión manual (contraste,
  foco, 320 px, lector de pantalla) está en `docs/revision-accesibilidad.md`.

---

## Voz

La acción conserva su nombre: «Guardar Estado Basal» produce «Estado basal
guardado». Los errores dicen causa y salida, sin jerga. El vacío invita a actuar:
«Aún no hay registros de hoy». La app nunca afirma que una crisis ocurrirá.

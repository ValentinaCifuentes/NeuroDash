# Bluba · Bitácora Diaria — frontend NeuraDash

Frontend de la app **Bitácora Diaria** de BLUBA, con la superficie de
**NeuraDash CORE** (pantalla *Evolución*) integrada dentro del mismo producto.

Construido sobre `bluba-lineamientos.md` + `bluba-design-system.html`, y alineado
al stack y a la estructura de repo de `NeuraDash_Arquitectura_Tecnica_Completa`.

---

## Cómo correrlo

```bash
npm install
npm run dev            # http://localhost:5173
```

Sin `VITE_API_BASE`, la app corre contra `src/mocks/mockApi.ts`. Para apuntar al
backend real:

```bash
cp .env.example .env   # VITE_API_BASE=http://localhost:8000
npm run dev
```

Otros comandos:

```bash
npm run typecheck                        # tsc --noEmit
npm run build                            # dist/ normal
SINGLE_FILE=1 npx vite build --outDir dist-single   # HTML único autocontenido
```

El build `SINGLE_FILE` existe para la **demo congelada** (Arquitectura §14):
un solo `.html` que abre sin servidor, sin npm y sin red.

---

## Estructura

```text
src/
├── types.ts                  Contratos. Espejo de los schemas Pydantic.
├── api.ts                    Cliente HTTP. Único punto que conoce endpoints.
├── mocks/mockApi.ts          Fixture de UI. NO es el motor (ver abajo).
├── domain/catalog.ts         Vocabulario clínico BLUBA ↔ etiquetas de tutor.
├── styles/bluba.css          Tokens del design system + extensiones `app-`.
├── components/
│   ├── AppBar.tsx            App bar 56px
│   ├── Sidebar.tsx           Drawer 280px con focus trap
│   ├── controls.tsx          Tabs, OptionGroup, Switch, IntensitySlider, Field
│   └── shell.tsx             BottomSheet, Fab, Toast
├── sheets/EventSheets.tsx    Sheet de categorías + sheet de registro
├── pages/
│   ├── BitacoraDiaria.tsx    Mi Día (estado basal) + Historial de Hoy
│   ├── Evolucion.tsx         Prediction Contract v2 renderizado
│   └── Placeholders.tsx      Ficha Inicial, Profesionales, Tickets
└── App.tsx                   Chrome + navegación
```

Corresponde a `frontend/` en el árbol del documento técnico. `RiskCard`,
`ConfidenceBadge`, `FactorList`, `MissingDataCard` y `SupportCard` viven dentro
de `pages/Evolucion.tsx` porque ninguno se reutiliza fuera de esa pantalla;
extraerlos a archivos propios es un `git mv` cuando aparezca el segundo consumidor.

---

## Contrato con el backend

```http
GET  /api/v1/subjects/{id}
GET  /api/v1/subjects/{id}/timeline?as_of=…&days=…
POST /api/v1/subjects/{id}/daily-records
POST /api/v1/subjects/{id}/events
POST /api/v1/predictions
```

El cliente **nunca manda features calculadas**: solo `subject_id`, `as_of` y
`horizon`. El backend obtiene el resto (Arquitectura §5.3).

`INSUFFICIENT` llega como **HTTP 200** con `abstain: true`, no como error. La UI
lo trata como resultado válido de negocio y muestra una petición concreta de
datos, no un mensaje de fallo.

---

## Decisiones que conviene defender

### 1. CSS del design system, no Tailwind

El documento técnico sugiere Tailwind. El design system, sin embargo, ya existe
como tokens CSS + clases `bl-*`. Reimplementarlo como tema de Tailwind obligaba a
re-derivar ~60 valores a mano, con riesgo de deriva silenciosa respecto de la
fuente de verdad.

`src/styles/bluba.css` copia los tokens y los componentes **1:1** desde
`bluba-design-system.html`. Todo lo propio de esta app vive al final del archivo,
bajo `EXTENSIONES DE APLICACIÓN` con prefijo `app-`, y solo *compone* tokens
existentes — no introduce ni un color, ni un radio, ni una sombra nueva. La
consistencia con el design system es verificable con un diff.

Tailwind sigue siendo viable después: los tokens ya están como variables CSS.

### 2. `nivel_regulacion_general_dia` no está en el formulario matinal

Es la variable peligrosa del Source of Truth §6.3: se completa al cierre del día,
así que no puede alimentar la predicción de ese mismo día. Está fuera del estado
basal y documentada en `types.ts` como cierre de jornada, consumible por el motor
solo desde T-1.

Es el tipo de detalle que un juez técnico busca para separar un prototipo con
criterio temporal de uno con leakage.

### 3. El mock declara que no es el motor

`mocks/mockApi.ts` devuelve `technical_metadata.engine: "ui_fixture"` y
`data_provenance.origins: ["ui_fixture", …]`, y la pantalla *Evolución* imprime
ambos en la tarjeta de Procedencia. Es imposible confundir en pantalla el fixture
de interfaz con una inferencia del modelo entrenado.

El fixture varía de forma con la cobertura de datos **solo** para poder ver los
tres estados que el contrato permite: estimación normal, confianza baja y
abstención. No simula un modelo.

### 4. Medicación con tres estados

El CSV admite `Sí | No | No Aplica`, y `No Aplica` domina los registros reales.
El mockup muestra un switch binario. Resuelto con el switch tal cual + una acción
ghost «No aplica para este consultante», en vez de romper el contrato de datos o
inventar un control fuera del sistema.

### 5. `value` clínico ≠ `label` de tutor

`domain/catalog.ts` separa el literal que viaja al motor del texto que lee la
persona cuidadora. Ejemplo: el CSV guarda `Dificultad de Conciliación`; la
pantalla dice **Muy Difícil**, igual que el mockup.

### 6. Las categorías del sheet resuelven a `tipo_evento`

Alimentación → `Alimentación`, Desregulación → `Desregulación Emocional`,
Transición → `Transición de Actividad`, Dieta Sensorial → `Dieta Sensorial`.
El sheet no es un menú decorativo: es el selector de tipo del evento que se
guardará.

### 7. `Danger` solo en desregulación

El design system reserva el botón rojo para el registro rápido de desregulación,
donde el rojo ya es el código del módulo. Las otras tres categorías usan el mismo
sheet con botón primario.

---

## Accesibilidad

Implementado según §3.4 de los lineamientos:

- Grupos de opción con `role="radiogroup"` / `role="radio"` / `aria-checked`,
  navegables con flechas y roving `tabindex`.
- Switch con `role="switch"`, nunca un `div`.
- Slider expone su valor en texto: «Intensidad 5 de 10, Moderado».
- Sheet y sidebar atrapan el foco, cierran con `Esc` y devuelven el foco al FAB.
- Área táctil mínima 44 × 44px, incluidos cerrar y los iconos del app bar.
- Enlace «Saltar al contenido» en el DOM, visible al tabular.
- Ningún estado se comunica solo por color: punto de 14px + etiqueta, o icono +
  texto. Las flechas ↑/↓ de factores llevan texto para lector de pantalla.
- `prefers-reduced-motion` desactiva shimmer, spin y transiciones (viene del
  design system).

---

## Voz

La acción conserva su nombre: «Guardar Estado Basal» produce «Estado basal
guardado». Los errores dicen causa y salida sin jerga. El vacío invita a actuar:
«Aún no hay registros de hoy».

En *Evolución*, la UI nunca afirma que una crisis ocurrirá, presenta riesgo y
confianza como ejes separados, y etiqueta los factores como asociaciones
observadas, no como causas.

---

## Pendiente

- `Vitest + React Testing Library` sobre los estados críticos: abstención,
  confianza baja, y guardado con datos faltantes.
- Selector de perfil demo (`DemoProfileSwitcher`) contra
  `POST /api/v1/demo/profiles/{id}/predict`.
- Cierre de jornada como sheet propio, para capturar
  `nivel_regulacion_general_dia` sin contaminar el formulario matinal.

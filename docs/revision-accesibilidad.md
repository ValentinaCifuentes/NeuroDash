# Revisión de accesibilidad de NeuroDash

**Fecha:** 3 de noviembre de 2026 (Fase 8). **Alcance:** todas las pantallas y hojas del
front, con las demos PAC-A/B/C en Docker, a 390 px y a 320 px. **Referencia:** WCAG 2.1 AA.

Dos niveles:

1. **Automático, en cada push** (`front/src/a11y.test.tsx` con axe-core y
   `front/src/components/keyboard.test.tsx`): nombres de controles, roles y atributos
   ARIA, IDs, orden de títulos, zonas de la página y teclado de los grupos.
2. **Manual, en el navegador** (esta revisión): lo que las pruebas no pueden medir.

---

## Resultados

| Criterio | Cómo se revisó | Resultado |
|---|---|---|
| Contraste de texto (1.4.3) | Para cada texto visible: su color y el fondo real detrás (capas y opacidad incluidas), en las 6 pantallas, el perfil en 3 pasos y las 5 hojas | ✅ Tras corregir el calendario (abajo) |
| Ancho de 320 px sin scroll lateral (1.4.10) | Ancho del área de contenido y elementos fuera de pantalla, en cada vista y en una hoja abierta | ✅ Tras corregir la cabecera del calendario |
| Foco visible (2.4.7) | Recorrido con la tecla Tab real en Mi Día: cada elemento que recibe el foco muestra un contorno | ✅ |
| Orden del foco (2.4.3) | El mismo recorrido: encabezado → pestañas → preguntas en orden → «+» → barra inferior; una sola parada por grupo de una opción | ✅ |
| Saltar al contenido (2.4.1) | Activar el enlace desde la Bitácora | ✅ Tras corregirlo (abajo) |
| Medidor, calendario y avisos para lector de pantalla (1.1.1, 4.1.2, 4.1.3) | Nombres accesibles en el navegador | ✅ «Índice demostrativo 80 de 100, riesgo elevado, confianza alta» · cada día «2 de noviembre: 5 o más eventos» · avisos en regiones `polite` |
| Color como único medio (1.4.1) | Revisión del diseño | ✅ Riesgo, digestión, escalas y calendario llevan forma, barras o texto |
| Área táctil (2.5.5, AAA) | Tokens y componentes | ✅ Mínimo 44 × 44 px |

### Lo que se corrigió

1. **«Saltar al contenido» cambiaba de pantalla.** Con las rutas por `#`, ir a
   `#contenido` se leía como una vista desconocida y llevaba a Evolución, con el foco
   perdido. Ahora el enlace mueve el foco a `<main>` sin tocar la dirección, y un `#`
   desconocido no saca al tutor de donde está (`App.tsx`; prueba en `App.test.tsx`).
2. **Días sin registro del calendario con contraste 2.18:1.** Son botones que se pueden
   tocar, así que necesitan 4.5:1: pasan a `--nd-muted` (5.72:1 sobre blanco). Los días
   futuros y de otros meses siguen en gris claro, porque están deshabilitados.
3. **Cabecera del calendario 23 px más ancha que la pantalla a 320 px.** La leyenda
   («menos … más eventos») baja a su propia línea cuando no cabe.
4. *(En la Fase 7, con axe)* Títulos de Planificación que saltaban de `h1` a `h3`, y
   el aviso del modo sin servidor fuera de `<main>`.

### Contrastes de referencia (tokens)

| Par | Contraste |
|---|---|
| `--nd-muted` sobre blanco · sobre el fondo cerezo | 5.72 · 5.11 |
| `--nd-ink-2` sobre `--nd-neutral-1` (pestaña inactiva) | 6.21 |
| Acento sobre blanco · blanco sobre acento | 5.66 · 5.66 |
| Texto de riesgo alto · medio · bajo sobre su fondo | 7.18 · 6.33 · 5.85 |
| `--nd-muted` sobre `--nd-neutral-1` | **4.36: no usar** (por eso las pestañas inactivas usan `--nd-ink-2`) |

---

## Límites y recomendaciones

- **Lector de pantalla real.** Se revisaron los nombres accesibles en el navegador,
  pero no se probó con VoiceOver, TalkBack o NVDA. Antes de un uso real, recorrer Mi
  Día y una hoja de registro con al menos uno de ellos.
- **Botón de guardar deshabilitado.** «Guardar Estado Basal» queda deshabilitado
  hasta responder sueño y despertar, y por eso Tab no lo alcanza. El texto «Para
  guardar falta: …» se ve en pantalla y el lector lo encuentra en el recorrido normal.
  Alternativa a evaluar: dejarlo habilitado y, al tocarlo, anunciar lo que falta.
- **Zoom al 200 % (1.4.4).** El diseño es de una columna y usa tamaños relativos, pero
  no se probó con el zoom del sistema al 200 %.
- **Contraste en las pruebas.** Las pruebas automáticas no miden contraste (jsdom no
  calcula estilos). Un cambio de color en `neurodash.css` debe revisarse a mano con
  la tabla de arriba.

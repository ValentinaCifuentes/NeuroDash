# Guía para grabar la demo de NeuroDash

La demostración es un **video pregrabado** con la app conectada al backend
(Docker). Esta guía cubre cómo dejarla lista el día de la grabación, un recorrido
sugerido y lo que conviene evitar.

---

## 1. El mismo día de la grabación

Desde la raíz del repo:

```bash
bash scripts/prepare_demo.sh
```

El script:

1. Genera los historiales de PAC-A/B/C hasta **ayer** (las ventanas de 1 a 14 días
   quedan con datos recientes) y el **Mi Día de hoy a las 07:45** de PAC-A (durmió mal,
   despertó irritable) y PAC-B (buena noche), como si la tutora ya lo hubiera llenado.
2. Reentrena los modelos y corre la verificación de punta a punta.
3. Actualiza los fixtures del front (pruebas y modo sin servidor).
4. Reinicia Docker con datos limpios (`docker compose down -v`; **pregunta antes**,
   porque borra lo registrado en la app) y lo levanta de nuevo.
5. Comprueba en la app levantada: **PAC-A** riesgo moderado, **PAC-B** riesgo bajo,
   **PAC-C** sin estimación.

Correr el script **el mismo día de la grabación y después de las 07:45**: antes de esa
hora el Mi Día de la mañana todavía no cuenta y PAC-A se vería en riesgo bajo.

**Grabar entre las 12:00 y las 18:00.** En ese horario basta **una** desregulación leve
para que PAC-A pase a riesgo elevado; en la mañana o la noche hacen falta **dos**.

Si se graba otro día, pasarle la fecha: `bash scripts/prepare_demo.sh 2026-11-20`.
Si algo sale ✘, no grabar: revisar la salida del script.

La app queda en <http://localhost:8090>.

## 2. Preparar la pantalla

- **Formato teléfono.** La app está diseñada para 390 px de ancho. En Chrome:
  herramientas de desarrollo → modo dispositivo → «iPhone 12 Pro» (390 × 844), zoom 100 %.
  O abrirla en un teléfono de la misma red: `http://<IP-del-computador>:8090`
  (en ese caso, compilar con `VITE_API_BASE=http://<IP>:8090`; ver el README).
- Modo claro, sin extensiones que pinten la página, notificaciones silenciadas.
- Empezar en <http://localhost:8090> sin `#…` en la dirección: se abre la selección.

## 3. Recorrido sugerido (≈ 4–5 min)

| # | Pantalla | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | Selección | Los tres infantes y «Agregar infante» | Alias, nunca el nombre real |
| 2 | Evolución · **PAC-A** | Medidor «Riesgo moderado» y chip «Confianza alta» | Estima las próximas 8 h con lo de hoy: esta mañana durmió mal y despertó irritable. Riesgo y confianza son ejes separados |
| 3 | «Por qué aparece así» | Señales «…que de costumbre» con ↑/↓ y la nota del pie | Se compara con lo habitual del propio infante; asociaciones, no causas; aviso de datos sintéticos |
| 4 | «Puede mejorar la lectura» | Qué dato falta y dónde se registra | Lo que cuenta para la confianza va primero |
| 5 | «Qué puedo hacer ahora» | Manta con peso, audífonos | Apoyos que ya le sirvieron, con las palabras del tutor |
| 6 | Historial de Hoy | El Mi Día de las 07:45 («Muy difícil», «Irritable / Llorando») | Lo que el tutor anotó en la mañana ya cuenta para la tarde |
| 7 | «+» → **Desregulación** | Intensidad **leve (1–3)**, un disparador, **Guardar registro** | Registrar cuesta dos toques; el detalle es opcional |
| 8 | Evolución · **PAC-A** | El medidor sube a **«Riesgo elevado»** (si no, registrar una segunda desregulación leve) | Lo que pasa durante el día cambia la estimación de las próximas 8 horas: una desregulación leve suele anticipar una crisis |
| 9 | Evolución › Seguimiento | Calendario del mes, tocar un día, abrir «Evolución de 14 días» | Lo que ya pasó, día a día |
| 9b | (opcional) Bitácora · Mi Día en **PAC-B** | Responder sueño y despertar; **Guardar Estado Basal** | Nada viene marcado: lo que no se responde no se envía |
| 10 | Evolución · **PAC-C** | «Todavía no hay estimación» y «Lo que le ayuda» | Prefiere decir que no sabe antes que inventar un número |
| 11 | Ficha · PAC-A | Contexto clínico y «Su día a día» | Lo que el tutor contó en el perfil |
| 12 | (opcional) Perfil en 3 pasos | Agregar «Tomi» y recorrer los pasos | Todo con botones; solo el alias es obligatorio |
| 13 | (opcional) Planificación | Agenda y «Añadir Evento» | Hoy es un registro para el tutor; todavía no entra al modelo |

## 4. Qué evitar

- **«Confirmar que ocurrió» o registrar una crisis (intensidad 4 o más) en PAC-A antes de
  terminar:** la estimación es el riesgo de una crisis *nueva* y, justo después de una,
  suele bajar. Si se quiere mostrar, al final, o en PAC-B.
- **Volver a guardar el Mi Día de PAC-A** con otras respuestas: cuenta lo último que se
  guardó, y una buena noche bajaría el riesgo. Para mostrar el formulario, usar PAC-B.
- **Recargar después de registrar no borra nada** (está en el backend), pero si se
  repite una toma, volver a correr `prepare_demo.sh` para empezar limpio.
- La estimación se reutiliza dentro de la misma hora si no cambian los datos: es
  normal que al volver a Evolución el número sea el mismo.
- No decir que la app **predice crisis** ni que **diagnostica**: estima un riesgo
  con cierta confianza y sugiere apoyos.
- Planificación y Mis Tickets no llegan al modelo ni al equipo de soporte (D6 y
  fuera de alcance): mostrarlos como parte de la experiencia, no como funciones
  conectadas.

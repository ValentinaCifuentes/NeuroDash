# Guía para grabar la demo de NeuroDash

La demo del congreso es un **video pregrabado** con la app conectada al backend
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
   quedan con datos recientes).
2. Reentrena los modelos y corre la verificación de punta a punta.
3. Actualiza los fixtures del front (pruebas y modo sin servidor).
4. Reinicia Docker con datos limpios (`docker compose down -v`; **pregunta antes**,
   porque borra lo registrado en la app) y lo levanta de nuevo.
5. Comprueba en la app levantada: **PAC-A** riesgo elevado, **PAC-B** riesgo bajo,
   **PAC-C** sin estimación.

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
| 2 | Evolución · **PAC-A** | Medidor «Riesgo elevado» y chip «Confianza alta» | Riesgo y confianza son ejes separados; horizonte de 8 h |
| 3 | «Por qué aparece así» | Señales «…que de costumbre» con ↑/↓ y la nota del pie | Se compara con lo habitual del propio infante; asociaciones, no causas; aviso de datos sintéticos |
| 4 | «Puede mejorar la lectura» | Qué dato falta y dónde se registra | Lo que cuenta para la confianza va primero |
| 5 | «Qué puedo hacer ahora» | Manta con peso, audífonos | Apoyos que ya le sirvieron, con las palabras del tutor |
| 6 | Bitácora · Mi Día | Responder sueño y despertar; un par de chips del contexto; **Guardar Estado Basal** | Nada viene marcado: lo que no se responde no se envía |
| 7 | «+» → Transición | «Con ayuda», detalle → «Apoyo visual», **Guardar registro** | Registrar cuesta dos toques; el detalle es opcional |
| 8 | Historial de Hoy | Los dos registros recién hechos | Se lee lo que eligió el tutor |
| 9 | Evolución › Seguimiento | Calendario del mes, tocar un día, abrir «Evolución de 14 días» | Lo que ya pasó, día a día |
| 10 | Evolución · **PAC-C** | «Todavía no hay estimación» y «Lo que le ayuda» | Prefiere decir que no sabe antes que inventar un número |
| 11 | Ficha · PAC-A | Contexto clínico y «Su día a día» | Lo que el tutor contó en el perfil |
| 12 | (opcional) Perfil en 3 pasos | Agregar «Tomi» y recorrer los pasos | Todo con botones; solo el alias es obligatorio |
| 13 | (opcional) Planificación | Agenda y «Añadir Evento» | Hoy es un registro para el tutor; todavía no entra al modelo |

## 4. Qué evitar

- **«Confirmar que ocurrió» en PAC-A antes de terminar:** agrega una crisis al día
  y puede cambiar lo que se muestra después. Si se quiere mostrar, al final, o en PAC-B.
- **Recargar después de registrar no borra nada** (está en el backend), pero si se
  repite una toma, volver a correr `prepare_demo.sh` para empezar limpio.
- La estimación se reutiliza dentro de la misma hora si no cambian los datos: es
  normal que al volver a Evolución el número sea el mismo.
- No decir que la app **predice crisis** ni que **diagnostica**: estima un riesgo
  con cierta confianza y sugiere apoyos.
- Planificación y Mis Tickets no llegan al modelo ni al equipo de soporte (D6 y
  fuera de alcance): mostrarlos como parte de la experiencia, no como funciones
  conectadas.

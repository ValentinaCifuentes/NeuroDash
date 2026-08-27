# NeuraDash — Dashboard del Terapeuta
## NeuroHack 2026 · Desafío BLUBA

> **Objetivo:** definir qué variables, resultados y visualizaciones deben mostrarse en el dashboard profesional/terapéutico de NeuraDash, priorizando interpretación rápida, trazabilidad, personalización, explicabilidad y calidad de la información.

---

# 1. PRINCIPIO DE DISEÑO

La vista del tutor y la del terapeuta no deben mostrar lo mismo.

El tutor necesita responder rápidamente:

```text
¿Hay algo de qué preocuparme?
¿Por qué?
¿Qué puedo hacer ahora?
```

El terapeuta necesita:

```text
¿Qué patrón está detectando el sistema?
¿De dónde viene?
¿Qué cambió respecto del patrón habitual del niño?
¿Qué tan confiable es?
¿Qué antecedentes puedo revisar antes de decidir?
```

Por tanto, la vista profesional debe priorizar:

```text
RIESGO
+
CONFIANZA
+
TRAYECTORIA TEMPORAL
+
DESVIACIÓN DEL BASELINE
+
FACTORES EXPLICATIVOS
+
CALIDAD / FUENTE DE LOS DATOS
+
HISTORIAL DE EVENTOS
+
APOYOS PREVIAMENTE REGISTRADOS
```

---

# 2. ACLARACIÓN CRÍTICA: NO MOSTRAR “64% DE PROBABILIDAD”

Con el estado actual del proyecto no corresponde presentar el score del motor como una probabilidad clínica calibrada.

Los datos entregados por BLUBA son demasiado pequeños para justificar una probabilidad clínica real:

- 4 casos anonimizados;
- 102 registros diarios;
- 37 sesiones profesionales;
- 7 eventos explícitos de desregulación.

Por tanto, si el motor produce un valor numérico como `64`, debe mostrarse como:

```text
Índice de riesgo: 64 / 100
```

o:

```text
Índice demostrativo: 64 / 100
```

No:

```text
64% de probabilidad de crisis
```

La salida principal debe seguir siendo categórica:

```text
BAJO
MEDIO
ELEVADO
```

---

# 3. ESTRUCTURA GENERAL DEL DASHBOARD

El dashboard profesional debería contener seis bloques principales:

1. Riesgo + confianza + estado de datos.
2. Evolución temporal de 14 días.
3. Cambios respecto del baseline individual.
4. Factores que contribuyen a la estimación.
5. Calidad de la información y fuentes.
6. Historial de eventos y apoyos.

---

# 4. CABECERA: RIESGO + CONFIANZA + ESTADO DE DATOS

Ejemplo:

```text
Amelia Soto Neira
6–7 años · TEA
Perfil: Hipersensible auditivo · Evitador táctil
Última actualización: Hoy · 08:30

RIESGO PRÓXIMAS 24 H
ELEVADO

Índice demo: 64 / 100
Confianza: ALTA

Baseline: Operativo · 21 días
```

## Visual recomendada para riesgo

Usar una **barra segmentada horizontal**.

```text
BAJO              MEDIO             ELEVADO
───────|───────────────|████████████●
                                      64
```

Ventajas:

- lectura inmediata;
- menor ambigüedad que un velocímetro;
- ocupa menos espacio;
- permite comparar estados fácilmente;
- evita aparentar precisión clínica excesiva.

## Visual recomendada para confianza

No usar el mismo gráfico que riesgo.

Ejemplo:

```text
Confianza: ALTA
█████████░

Cobertura reciente       100%
Recencia                  Alta
Baseline                  Operativo
Fuentes disponibles       Tutor + profesional
```

La separación conceptual debe ser explícita:

```text
RIESGO ≠ CONFIANZA
```

Ejemplo:

```text
RIESGO: ELEVADO
CONFIANZA: BAJA
```

no es contradictorio.

Significa:

> existen señales preocupantes, pero la calidad o cantidad de información disponible no permite confiar demasiado en la estimación.

---

# 5. TIMELINE MULTIVARIABLE DE 14 DÍAS

Esta debería ser la visualización central del dashboard profesional.

## Ventana recomendada

Por defecto:

```text
14 días
```

Opcionalmente:

```text
7 días
14 días
30 días
```

## No usar

Un line chart con múltiples escalas numéricas superpuestas.

## Usar

Tracks temporales sincronizados.

Ejemplo:

```text
                 ÚLTIMOS 14 DÍAS
       13 14 15 16 17 18 19 20 21 22 23 24 25 HOY

Sueño   ●  ●  ◐  ◐  ◐  ●  ●  ◐  ◐  ◐  ●  ●  ◐  ◐
Despert ●  ●  ●  ▲  ▲  ●  ●  ▲  ▲  ▲  ●  ●  ▲  ▲
Regul.  ●  ●  ◐  ◐  ▲  ●  ◐  ▲  ◐  ◐  ●  ●  ◐  ◐
Eventos       │M          │S               │M
Profes.    ○        ▲            ○
Datos    ███ ███ ███ ███ ░░░ ███ ███ ███ ███ ...
```

Leyenda conceptual:

```text
● = dentro del patrón habitual
◐ = desviación moderada
▲ = desviación relevante
M = evento moderado
S = evento severo
○ = sesión profesional sin alerta destacada
░ = información ausente / baja cobertura
```

## Qué debe permitir interpretar

Ejemplo:

> No fue solamente una mala noche; existen cuatro días consecutivos de deterioro respecto del patrón habitual.

La timeline representa mejor la lógica central de NeuraDash:

```text
persistencia
+
recencia
+
tendencia
+
acumulación
```

---

# 6. VARIABLES A MOSTRAR EN LA TIMELINE

## Sueño

Variables derivadas:

```text
non_reparative_sleep_streak
sleep_quality_delta_baseline
sleep_trend_3d
sleep_trend_7d
```

Mostrar:

```text
Reparador
Interrumpido
Dificultad de conciliación
```

y, preferentemente, su desviación respecto del patrón habitual.

---

## Estado al despertar

Variable:

```text
wake_state_delta_baseline
```

Mostrar categorías como:

```text
Tranquilo/Alegre
Cansado/Con Sueño
Irritable/Llorando
```

---

## Regulación previa

Variable:

```text
previous_day_regulation
```

Importante:

No usar información del mismo día si todavía no estaba disponible al momento del forecast.

---

## Eventos recientes

Variables:

```text
event_count_1d
event_count_3d
event_count_7d
event_count_14d

max_event_intensity_3d
time_since_last_event
```

Los eventos deben aparecer claramente como hitos temporales.

---

## Alertas profesionales

Variable:

```text
professional_alert_recent
```

Mostrar:

```text
Última sesión
Nivel de alerta inicial
Nivel de alerta final
Recencia
```

---

# 7. BLOQUE “CAMBIOS VS BASELINE”

Este bloque debe responder:

> ¿Qué está ocurriendo distinto a lo habitual para este niño?

No comparar solamente con umbrales poblacionales.

## Visual recomendada

**Barras horizontales / bullet charts.**

Ejemplo:

```text
RESPECTO A SU PATRÓN HABITUAL

Sueño no reparador
Habitual     ███░░░░░░░  24%
Últimos 7 d  ███████░░░  71%
Cambio: +47 pp ↑

Despertar irritable
Habitual     ██░░░░░░░░  18%
Últimos 7 d  ██████░░░░  57%
Cambio: +39 pp ↑

Eventos moderados/severos
Habitual     ───────────
Últimos 7 d  ● ●
Cambio: ↑

Alerta profesional
Habitual     Óptimo
Última       Alto
Cambio: ↑
```

## Variables recomendadas

```text
non_reparative_sleep_streak
sleep_quality_delta_baseline
sleep_trend_3d
sleep_trend_7d
wake_state_delta_baseline

event_count_1d
event_count_3d
event_count_7d
event_count_14d

max_event_intensity_3d
time_since_last_event

previous_day_regulation
professional_alert_recent
```

## Principio

El baseline significa:

```text
habitual para este niño
```

No necesariamente:

```text
saludable
```

---

# 8. FACTORES QUE CONTRIBUYEN A LA ESTIMACIÓN

El profesional puede recibir mayor detalle que el tutor.

## Visual recomendada

**Barras horizontales ordenadas por contribución al índice demostrativo.**

Ejemplo:

```text
FACTORES DE ESTA ESTIMACIÓN

Eventos recientes        ██████████████    +24
Sueño persistente        █████████         +13
Estado al despertar      ███████           +10
Regulación previa        ██████             +8
Alerta profesional       ███                +4
GI                       █                  +1
```

## Etiqueta necesaria

Usar:

```text
Contribución al índice demostrativo
```

No:

```text
Probabilidad causada por...
```

## Drill-down recomendado

Al seleccionar un factor:

```text
Sueño persistente

3 de las últimas 4 noches:
Interrumpido

Patrón habitual:
Mayormente Reparador

Ventana analizada:
Últimos 4 días

Dirección:
↑ aumenta el índice
```

## No mostrar

```text
Causa principal: sueño
```

Sí mostrar:

```text
El sueño fue uno de los factores que más contribuyó a esta estimación.
```

---

# 9. NO USAR RADAR CHART COMO VISUAL PRINCIPAL

Ejemplo a evitar:

```text
Sueño       80
GI          20
Eventos     70
Sensorial   40
Rutina      55
```

Problemas:

- hace parecer comparables variables de naturaleza distinta;
- añade dificultad de lectura;
- puede inducir a pensar que los valores son clínicamente calibrados;
- aporta menos información temporal.

Para el terapeuta son más útiles:

```text
timeline
+
baseline
+
factores
```

---

# 10. CALIDAD DE INFORMACIÓN Y FUENTES

Este bloque permite que el profesional evalúe cuánto confiar en la estimación.

## Visual recomendada

Matriz compacta de cobertura.

| Fuente | Último dato | 24 h | 3 días | 7 días | Estado |
|---|---|---:|---:|---:|---|
| Tutor | Hoy 08:05 | ✓ | 100% | 86% | Actual |
| Profesional | Hace 3 días | — | ✓ | ✓ | Vigente |
| Eventos | Hace 2 días | ✓ | ✓ | ✓ | Actual |
| Colegio | Hace 5 días | — | — | ✓ | Antiguo |

Versión compacta:

```text
CALIDAD DE INFORMACIÓN

Tutor        ●●●●●  Hoy
Profesional  ●●●○○  Hace 3 días
Eventos      ●●●●○  Hace 2 días
Colegio      ●○○○○  Hace 5 días

Cobertura 7 días: 82%
Baseline: 21 observaciones · Operativo
```

## Variables de confianza

```text
day_coverage_3d
day_coverage_7d
hours_since_last_daily_record
baseline_maturity
historical_source_support
```

## Principio crítico

```text
día sin registro
≠
día normal
```

El missingness debe influir principalmente en:

```text
CONFIANZA
```

y eventualmente producir:

```text
ABSTENCIÓN
```

---

# 11. ABSTENCIÓN

Si la información es insuficiente, el sistema no debe forzar una estimación.

Ejemplo:

```text
INFORMACIÓN INSUFICIENTE

No es posible generar una estimación confiable en este momento.

Cobertura últimos 3 días:
33%

Último registro tutor:
Hace 72 horas

Dato prioritario pendiente:
Calidad del sueño reciente
```

No mostrar:

```text
RIESGO: 51
CONFIANZA: 18
```

si los datos no permiten una estimación defendible.

---

# 12. MULTI-INFORMANTE

Familia, profesionales y establecimiento educacional pueden observar contextos distintos.

No hacer:

```text
promedio familia + colegio + terapeuta
```

sin distinguir procedencia.

Sí mostrar:

```text
Familia:
Irritabilidad elevada

Profesional:
Nivel de alerta óptimo

Interpretación:
Diferencia entre contextos
```

Esto puede ser información relevante, no necesariamente un error.

---

# 13. HISTORIAL DE EVENTOS Y APOYOS

Este bloque debería conectar:

```text
qué ocurrió
+
en qué contexto
+
qué apoyo se aplicó
+
qué resultado tuvo
```

## Visual recomendada

Tabla compacta.

| Fecha | Evento/contexto | Intensidad | Detonante registrado | Apoyo aplicado | Resultado |
|---|---|---|---|---|---|
| 24 ago | Sobrecarga sensorial | Moderada | Ruido | Espacio tranquilo | Efectivo |
| 18 ago | Transición | Severa | Cambio de actividad | Anticipación visual | Parcial |
| 11 ago | Sobrecarga sensorial | Moderada | Sirena | Audífonos | Efectivo |

## Tarjetas de apoyo

Ejemplo:

```text
Anticipación visual
Último uso: 18 ago
Resultado registrado: Parcial

Espacio de regulación
Último uso: 24 ago
Resultado registrado: Efectivo
```

## No calcular todavía

```text
92% de efectividad
```

si existen muy pocas observaciones.

---

# 14. PERFIL SENSORIAL

En el dashboard profesional debe verse con más detalle que en el tutor.

Ejemplo:

```text
PERFIL SENSORIAL

Hipersensible auditivo
Evitador táctil
```

Después:

```text
CONTEXTO RECIENTE RELEVANTE

Ruido elevado registrado          ↑
Historial de dificultad con ruido ✓
Exposición táctil inusual          —
```

## Regla central

```text
perfil sensorial
≠
riesgo permanente
```

La lógica correcta es:

```text
perfil
×
exposición actual
×
historial individual
→
relevancia contextual
```

Ejemplo:

```text
Perfil auditivo relevante
+
exposición acústica reciente
+
historial de episodios asociados a ruido
→
mayor relevancia explicativa
```

No:

```text
Hipersensible auditivo
→ +20 puntos automáticamente
```

---

# 15. VARIABLES Y VISUAL RECOMENDADA

| Resultado / variable | Uso | Mejor visual |
|---|---|---|
| Riesgo próximas 24 h | Resultado principal | Barra segmentada horizontal |
| Índice demostrativo | Granularidad profesional | Número `X/100` junto al riesgo |
| Confianza | Calidad de estimación | Badge + barra de calidad |
| Cobertura reciente | Confianza | Barra / porcentaje |
| Baseline maturity | Confianza | Badge |
| Sueño 14 d | Tendencia | Track temporal |
| Estado al despertar | Tendencia | Track temporal |
| Regulación previa | Contexto | Track temporal |
| Eventos | Historia reciente | Marcadores en timeline |
| Severidad evento | Contexto histórico | Código ordinal / etiqueta |
| Alertas profesionales | Contexto | Track temporal |
| Cambio vs baseline | Personalización | Bullet chart |
| Top factores | Explicabilidad | Barras horizontales |
| Fuente del dato | Trazabilidad | Matriz de cobertura |
| Missingness | Confianza / abstención | Tarjeta de calidad |
| Perfil sensorial | Personalización | Badge + contexto |
| Apoyos históricos | Acción | Tabla / tarjetas |
| Resultado de apoyos | Historial | Etiqueta categórica |

---

# 16. LAYOUT RECOMENDADO

```text
┌────────────────────────────────────────────────────────────────────┐
│ AMELIA SOTO NEIRA                     Actualizado hoy · 08:30      │
│ TEA · 6–7 años · Hipersensible auditivo / Evitador táctil         │
├───────────────────────────────┬────────────────────────────────────┤
│ RIESGO PRÓXIMAS 24 H          │ CONFIANZA                         │
│                               │                                    │
│ ELEVADO                       │ ALTA                               │
│ Índice demo 64/100            │ █████████░                         │
│ Bajo ── Medio ───── ● Alto    │ Cobertura 82% · Baseline operativo│
├───────────────────────────────┴────────────────────────────────────┤
│ EVOLUCIÓN · ÚLTIMOS 14 DÍAS                                       │
│                                                                    │
│ Sueño      ● ● ● ◐ ◐ ▲ ▲ ● ...                                   │
│ Despertar  ● ● ◐ ◐ ▲ ▲ ▲ ● ...                                   │
│ Regulación ● ● ● ◐ ▲ ◐ ▲ ● ...                                   │
│ Eventos            │M      │S                                      │
│ Profesional    ○        ▲                                          │
├─────────────────────────────────┬──────────────────────────────────┤
│ CAMBIOS VS BASELINE             │ FACTORES DE LA ESTIMACIÓN       │
│                                 │                                  │
│ Sueño       +47 pp ↑            │ Eventos recientes      +24      │
│ Despertar   +39 pp ↑            │ Sueño persistente      +13      │
│ Eventos     ↑                    │ Estado despertar       +10      │
│ Alerta prof. Alto ↑             │ Regulación previa       +8      │
├─────────────────────────────────┼──────────────────────────────────┤
│ CALIDAD DE DATOS                │ DATOS FALTANTES                  │
│ Tutor       ●●●●● Hoy           │ Colegio · hace 5 días            │
│ Profesional ●●●○○ 3 días        │ Estado actual · pendiente        │
│ Colegio     ●○○○○ 5 días        │                                  │
├─────────────────────────────────┴──────────────────────────────────┤
│ HISTORIAL DE EVENTOS Y APOYOS                                     │
│ Fecha · evento · intensidad · contexto · estrategia · resultado   │
└────────────────────────────────────────────────────────────────────┘
```

---

# 17. DIFERENCIA ENTRE TUTOR Y TERAPEUTA

## Tutor

```text
Riesgo
↓
Por qué
↓
Qué hacer
```

## Terapeuta

```text
Riesgo
↓
Confianza
↓
Trayectoria temporal
↓
Desviación del baseline
↓
Factores
↓
Calidad y fuentes
↓
Eventos
↓
Apoyos
```

---

# 18. QUÉ NO PONDRÍA EN EL DASHBOARD

Evitar:

- pie charts;
- donut charts de riesgo;
- radar charts;
- múltiples velocímetros;
- 15 tarjetas KPI;
- “64% de probabilidad clínica”;
- predicción de severidad futura si el motor no la estima;
- ranking de niños por riesgo;
- correlaciones presentadas como causas;
- SHAP como pantalla principal;
- promedio de familia/colegio/profesional sin distinguir fuente;
- exceso de variables estáticas;
- dashboards con apariencia de BI genérico.

---

# 19. MUST HAVE PARA EL MVP

Si hay que recortar por tiempo, proteger:

```text
1. Riesgo próximas 24 h
2. Confianza
3. Timeline de 14 días
4. Cambios vs baseline
5. Top factores
6. Missingness / calidad de datos
7. Apoyo histórico
```

Todo lo demás puede considerarse secundario.

---

# 20. CONCLUSIÓN

La vista profesional de NeuraDash no debe parecer un dashboard genérico de BI.

Debe responder:

> **¿Qué está cambiando en este niño, cómo ha evolucionado durante los últimos días, qué tan confiable es la información disponible y qué antecedentes registrados pueden ayudar al profesional a decidir?**

El diferencial debe mantenerse en:

```text
MEMORIA TEMPORAL
+
BASELINE INDIVIDUAL
+
RIESGO ≠ CONFIANZA
+
ABSTENCIÓN
+
EXPLICACIÓN
+
MULTI-INFORMANTE
+
HISTORIAL DE APOYOS
+
PERFIL SENSORIAL CONTEXTUALIZADO
```

Ese enfoque es más coherente con el problema real de BLUBA que intentar maximizar la cantidad de gráficos o presentar una “IA clínica” que los datos actuales todavía no permiten validar.

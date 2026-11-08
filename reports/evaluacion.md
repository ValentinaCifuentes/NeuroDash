# Evaluación de la propuesta de valor

Generado: 2026-11-08T03:46:43.113956+00:00

> Datos sintéticos. Esta evaluación valida el pipeline y la metodología; no constituye rendimiento clínico.

> Las figuras están en `reports/figures/` y en el informe HTML `reports/evaluacion-propuesta-valor.html`.

## Resultados por sujeto (out-of-fold)

Las columnas de precision, recall y F1 usan el umbral 0.5 del clasificador. Las métricas de producto (umbrales 0.3/0.7) están más abajo.

| Sujeto | n | crisis | prevalencia | precision | recall | F1 | ROC-AUC | PR-AUC | Brier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PAC-A | 56 | 11 | 0.196 | 0.444 | 0.364 | 0.400 | 0.717 | 0.492 | 0.158 |
| PAC-B | 56 | 19 | 0.339 | 0.500 | 0.158 | 0.240 | 0.747 | 0.580 | 0.263 |

### Comparación con baselines

| Sujeto | Baseline | accuracy | precision | recall | F1 | ROC-AUC | PR-AUC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PAC-A | clase mayoritaria | 0.804 | 0.000 | 0.000 | 0.000 | 0.500 | 0.196 |
| PAC-A | prevalencia | 0.804 | 0.000 | 0.000 | 0.000 | 0.210 | 0.162 |
| PAC-A | persistencia 24 h | 0.768 | 0.417 | 0.455 | 0.435 | 0.649 | 0.297 |
| PAC-B | clase mayoritaria | 0.661 | 0.000 | 0.000 | 0.000 | 0.500 | 0.339 |
| PAC-B | prevalencia | 0.661 | 0.000 | 0.000 | 0.000 | 0.500 | 0.359 |
| PAC-B | persistencia 24 h | 0.661 | 0.500 | 0.526 | 0.513 | 0.628 | 0.424 |

### Métricas de producto y carga de alertas

| Sujeto | cobertura | abstención | alerta HIGH | recall HIGH | FA/semana HIGH | alerta MEDIA+ | recall MEDIA+ | FA/semana MEDIA+ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PAC-A | 1.000 | 0.000 | 0.089 | 0.273 | 0.250 | 0.250 | 0.545 | 1.000 |
| PAC-B | 1.000 | 0.000 | 0.107 | 0.158 | 0.375 | 0.179 | 0.263 | 0.625 |

### Abstención en arranque en frío

El sistema prefiere no estimar antes que inventar un número cuando la línea base todavía no es suficientemente madura.

| Sujeto | Días de historial | Confianza | Se abstiene | Motivo |
| --- | --- | --- | --- | --- |
| PAC-C | 2 | HIGH | sí | Insufficient baseline maturity (2 days). Minimum required is 3 days. |

### Puntos de operación (out-of-fold)

| Sujeto | Punto | umbral | alertas/semana | recall | precision | F1 | FA/semana |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PAC-A | HIGH actual | 0.700 | 0.625 | 0.273 | 0.600 | 0.375 | 0.250 |
| PAC-A | MEDIA+ actual | 0.300 | 1.750 | 0.545 | 0.429 | 0.480 | 1.000 |
| PAC-A | mejor F1 | 0.300 | 1.750 | 0.545 | 0.429 | 0.480 | 1.000 |
| PAC-A | máx. recall con ≤1 FA/semana | 0.300 | 1.750 | 0.545 | 0.429 | 0.480 | 1.000 |
| PAC-B | HIGH actual | 0.700 | 0.750 | 0.158 | 0.500 | 0.240 | 0.375 |
| PAC-B | MEDIA+ actual | 0.300 | 1.250 | 0.263 | 0.500 | 0.345 | 0.625 |
| PAC-B | mejor F1 | 0.050 | 3.500 | 0.789 | 0.536 | 0.638 | 1.625 |
| PAC-B | máx. recall con ≤1 FA/semana | 0.250 | 1.375 | 0.316 | 0.545 | 0.400 | 0.625 |

Los puntos «mejor F1» y «máx. recall con presupuesto» son exploratorios: se calculan sobre las predicciones out-of-fold y sirven para discutir el trade-off, no para fijar el umbral final sin validación anidada.

### Resumen entre folds

La recall y las falsas alarmas se calculan con el punto de operación MEDIA+ actual (umbral bajo). La AUC y el Brier son independientes del umbral.

| Sujeto | recall MEDIA+ (mediana) | recall MEDIA+ (mín) | recall MEDIA+ (máx) | FA/semana MEDIA+ (mediana) | ROC-AUC (mediana) | PR-AUC (mediana) | Brier (mediana) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PAC-A | 0.550 | 0.000 | 1.000 | 1.000 | 0.333 | 0.488 | 0.081 |
| PAC-B | 0.000 | 0.000 | 0.750 | 0.500 | 0.750 | 0.810 | 0.266 |

### Variables con mayor peso

| Sujeto | Variable | coef. medio | desv. | consistencia de signo |
| --- | --- | --- | --- | --- |
| PAC-A | record_count_7d | -0.955 | 0.027 | 1.000 |
| PAC-A | strategy_count_mean_3d | 0.629 | 0.182 | 1.000 |
| PAC-A | feeding_difficulty_missing_1d | -0.605 | 0.093 | 1.000 |
| PAC-A | transition_difficulty_mean_3d | -0.591 | 0.133 | 1.000 |
| PAC-A | day_regulation_level_num_mean_1d | -0.497 | 0.075 | 1.000 |
| PAC-A | start_autonomy_level_delta_baseline | 0.457 | 0.178 | 1.000 |
| PAC-A | feeding_difficulty_delta_baseline | 0.428 | 0.118 | 1.000 |
| PAC-A | feeding_difficulty_mean_1d | 0.420 | 0.120 | 1.000 |
| PAC-A | planned_stressful_event_8h | 0.419 | 0.049 | 1.000 |
| PAC-A | gi_level_mean_3d | -0.413 | 0.087 | 1.000 |
| PAC-B | max_intensity_mean_1d | 0.691 | 0.232 | 1.000 |
| PAC-B | trigger_count_delta_baseline | -0.683 | 0.365 | 1.000 |
| PAC-B | gi_level_delta_baseline | -0.647 | 0.203 | 1.000 |
| PAC-B | sensory_diet_done_missing_1d | -0.516 | 0.083 | 1.000 |
| PAC-B | sensory_diet_done_mean_1d | -0.462 | 0.119 | 1.000 |
| PAC-B | sensory_diet_done_delta_baseline | -0.418 | 0.143 | 1.000 |
| PAC-B | trigger_count_mean_1d | -0.405 | 0.193 | 1.000 |
| PAC-B | feeding_difficulty_mean_1d | 0.386 | 0.046 | 1.000 |
| PAC-B | feeding_difficulty_delta_baseline | 0.382 | 0.100 | 1.000 |
| PAC-B | start_autonomy_level_delta_baseline | 0.361 | 0.150 | 1.000 |

La consistencia de signo indica en qué proporción de folds el coeficiente mantuvo el mismo signo. Los coeficientes muestran asociación, no causalidad.

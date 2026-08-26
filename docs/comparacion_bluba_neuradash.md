# Comparación de funcionalidades — BLUBA original vs. NeuraDash

Basado en la app original de BLUBA y el Source of Truth de NeuraDash (`NeuraDash_Source_of_Truth_Contexto_Maestro_NeuroHack_2026_CONSISTENTE.md`).

| Funcionalidad original BLUBA | Estado vs. NeuraDash | Detalle |
|---|---|---|
| Bitácora Diaria — sueño, despertar, medicación, gastrointestinal | Ya existente (insumo) | Consumido directamente como variables CORE (§9.1) |
| Bitácora Diaria — pestaña Historial | Ya existente | Sin cambios propuestos |
| Evento: Desregulación (intensidad, hora, disparador, estrategia) | Ya existente (insumo) | Coincide con variables CORE de eventos (§9.1) |
| Evento: Alimentación | Ya existente | Sin mención en el Source of Truth |
| Evento: Transición | Ya existente | Sin mención en el Source of Truth |
| Evento: Dieta Sensorial | Ya existente | Sin mención directa; conceptualmente cercana al "perfil sensorial contextual" (§11) pero no absorbida |
| Registro Rápido (botón +) | Relacionado, no duplicado | Pariente conceptual del micro-check-in adaptativo (§21), pero este último es dirigido por datos faltantes, no un botón siempre disponible |
| Sesiones — parámetros, alerta, observaciones | Ya existente (insumo) | Coincide con variables CORE de sesión (§9.1) |
| Sesiones — asistencia, pagos, visibilidad al tutor | Ya existente | Sin relación con NeuraDash |
| Ficha Inicial | Ya existente | Complementada (no reemplazada) por el Onboarding, que es nuevo (§20) |
| Evolución | Mejora propuesta | Pasa de reporte retrospectivo a vista con riesgo prospectivo, confianza y factores (§32.3) |
| Red de Profesionales | Ya existente | Sin relación con NeuraDash |
| Soporte Técnico (Mis Tickets) | Ya existente | Sin relación con NeuraDash |
| Onboarding / cuestionario inicial | **Nueva** | Reduce cold start del modelo, inicializa baseline (§20) |
| Baseline individual | **Nueva** | Compara al niño con su propio historial, no solo umbral poblacional (§10) |
| Motor predictivo (Personal Risk Model) | **Nueva** | Modelo de ML entrenado por usuario, riesgo a 24h (§12) |
| Risk ≠ Confidence | **Nueva** | Separación explícita de ambas variables (§16) |
| Missingness y abstención | **Nueva** | El sistema puede declarar "datos insuficientes" (§17) |
| Explicabilidad (Explanation Builder / SHAP) | **Nueva** | Traduce el modelo a lenguaje humano (§18) |
| Support Selector | **Nueva** | Sugiere apoyos proactivamente, no solo los registra (§19) |
| Ventanas temporales (1/3/7/14 días) | **Nueva** | Features derivadas de tendencia y recencia (§9.2) |
| Eventos futuros / calendario | **Nueva** — Roadmap | No entra en el MVP (§22) |
| NeuraDash CONNECT (wearables) | **Nueva** — Roadmap | Opcional (§25) |
| NeuraDash SENSE (sensores ambientales) | **Nueva** — Roadmap | Opcional (§26) |

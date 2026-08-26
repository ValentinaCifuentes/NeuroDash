/**
 * Contratos tipados del frontend.
 *
 * Espejo exacto de los schemas Pydantic del backend
 * (`backend/app/schemas.py` + `engine/schemas.py`).
 * Si cambia el contrato, cambia este archivo primero.
 *
 * Referencia: Arquitectura técnica §4 (modelo de datos),
 * §5 (contrato API) y §5 "Prediction Contract v2".
 */

/* ============================================================
   1. Entidades BLUBA (ancladas a los CSV entregados)
   ============================================================ */

/** `1_casos_anonimizados.csv` */
export interface Subject {
  subject_id: string;                 // id_caso            → "PAC-002"
  display_name: string;               // solo UI; no viaja al motor
  initials: string;                   // app bar
  age_range: string;                  // rango_edad         → "6-7 años"
  diagnosis: string;                  // diagnostico_principal
  sensory_profile: string;            // perfil_sensorial_predominante
}

/** `4_seguimiento_diario_tutor.csv` — un registro por consultante y día */
export interface DailyRecord {
  record_id?: string;                 // id_registro_diario  → "REG-014"
  subject_id: string;                 // id_caso
  date: string;                       // fecha ISO           → "2026-08-26"
  sleep_quality: SleepQuality | null;         // calidad_sueno
  wake_mode: WakeMode | null;                 // modo_despertar
  /**
   * autonomia_inicio_dia.
   *
   * Extensión al CSV de BLUBA: la columna no existe en
   * `4_seguimiento_diario_tutor.csv`. Se captura en la mañana, así que sí
   * es utilizable como feature del mismo día (a diferencia de
   * `day_regulation_level`).
   */
  start_autonomy: StartAutonomy | null;
  medication_adherence: MedicationAdherence | null; // adherencia_medicacion
  gi_status: GiStatus | null;                 // estado_gastrointestinal
  /**
   * nivel_regulacion_general_dia.
   *
   * VARIABLE PELIGROSA (Source of Truth §6.3): se completa al cierre del
   * día, así que no puede alimentar la predicción de ese mismo día.
   * Por eso NO vive en el formulario de estado basal matinal: se captura
   * en el cierre de jornada y el motor solo la consume desde T-1.
   */
  day_regulation_level?: DayRegulationLevel | null;
}

/** `5_eventos_desregulacion_tutor.csv` */
export interface DysregulationEvent {
  event_id?: string;                  // id_evento           → "EVT-008"
  subject_id: string;                 // id_caso
  occurred_at: string;                // fecha_hora ISO
  event_type: EventType;              // tipo_evento
  intensity_band: IntensityBand;      // intensidad          → "Moderada (4-7)"
  intensity_value: number;            // 1..10 — precisión añadida por el slider
  trigger: string | null;             // detonante_gatillante
  strategy_applied: string | null;    // estrategia_calma_aplicada
  strategy_outcome: StrategyOutcome | null; // resultado_estrategia
  /**
   * Escala cualitativa propia de la categoría, tal como la eligió el tutor
   * ("Adecuada", "Con ayuda", "Parcial"…). Se guarda además de
   * `intensity_band` porque la banda es una traducción nuestra: el motor
   * debe poder auditar qué vio realmente la persona.
   *
   * `null` en desregulación, donde el dato primario es el slider 1-10.
   */
  qualitative_outcome: string | null;
  /** Solo Dieta Sensorial: actividad_realizada. Sin columna en el CSV. */
  sensory_activity: string | null;
  /** Observaciones libres del tutor. Nunca alimenta features. */
  notes: string | null;
  /** true cuando se guardó por la ruta rápida, sin detalle clínico */
  quick_capture: boolean;
}

/* --- Vocabularios cerrados. Los valores son los literales del CSV. --- */

export type SleepQuality =
  | 'Reparador'
  | 'Interrumpido'
  | 'Dificultad de Conciliación';

export type WakeMode =
  | 'Tranquilo/Alegre'
  | 'Cansado/Con Sueño'
  | 'Irritable/Llorando';

export type StartAutonomy =
  | 'Por sí solo'
  | 'Con alarma'
  | 'Con insistencia';

export type MedicationAdherence = 'Sí' | 'No' | 'No Aplica';

export type GiStatus = 'Normal' | 'Estreñimiento' | 'Diarrea';

export type DayRegulationLevel =
  | 'Excelente'
  | 'Estable con Apoyo'
  | 'Desregulación Frecuente';

export type EventType =
  | 'Sobrecarga Sensorial'
  | 'Desregulación Emocional'
  | 'Transición de Actividad'
  | 'Alimentación'
  | 'Dieta Sensorial';

export type IntensityBand = 'Leve (1-3)' | 'Moderada (4-7)' | 'Severa (8-10)';

export type StrategyOutcome =
  | 'Regulación Exitosa'
  | 'Regulación Parcial'
  | 'Sin Regulación';

/** Categorías del sheet de registro. Resuelven a `EventType`. */
export type LogCategory = 'alimentacion' | 'desregulacion' | 'transicion' | 'sensorial';

/* ============================================================
   2. Timeline — GET /api/v1/subjects/{id}/timeline
   ============================================================ */

export type TimelineKind = 'daily_record' | 'event';

export interface TimelineEntry {
  entry_id: string;
  kind: TimelineKind;
  /** ISO. El backend ya aplicó cutoff sobre `as_of`. */
  timestamp: string;
  title: string;
  detail: string | null;
  /** Color semántico ya resuelto por el backend; el front no interpreta clínica. */
  semantic: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  payload: DailyRecord | DysregulationEvent;
}

export interface TimelineResponse {
  subject_id: string;
  as_of: string;
  days: number;
  entries: TimelineEntry[];
}

/* ============================================================
   3. Prediction Contract v2 — POST /api/v1/predictions
   ============================================================ */

export type RiskLevel = 'LOW' | 'MODERATE' | 'ELEVATED';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
export type FactorDirection = 'up' | 'down';

export interface PredictionFactor {
  code: string;
  label: string;
  comparison: string;
  direction: FactorDirection;
  window: string;
}

export interface MissingDataItem {
  code: string;
  label: string;
  impact: string;
}

export interface SupportItem {
  support_id: string;
  source: 'historical_support' | 'program_objective' | 'sensory_profile';
  label: string;
  detail?: string | null;
}

export interface DataProvenance {
  contains_synthetic_data: boolean;
  origins: string[];
}

export interface TechnicalMetadata {
  engine: string;
  training_strategy_version: string;
  explainer: string | null;
  confidence_ruleset_version: string;
  feature_schema_version: string;
}

export interface Prediction {
  contract_version: '2.0';
  prediction_id: string;
  subject_id: string;
  as_of: string;
  horizon: 'next_24h';

  risk_level: RiskLevel;
  model_score: number;

  model_version: string;
  model_family: string;

  confidence_level: ConfidenceLevel;

  /** `INSUFFICIENT` no es un error HTTP: llega como 200 con abstain=true. */
  abstain: boolean;
  abstention_reason: string | null;

  factors: PredictionFactor[];
  missing: MissingDataItem[];
  priority_data_request: string | null;
  support: SupportItem[];

  data_provenance: DataProvenance;
  technical_metadata: TechnicalMetadata;
}

export interface PredictionRequest {
  subject_id: string;
  as_of: string;
  horizon: 'next_24h';
}

/* ============================================================
   4. Errores
   ============================================================ */

export interface ApiError {
  status: number;
  code: string;
  /** Mensaje ya redactado para el tutor: causa + salida, sin jerga. */
  message: string;
}

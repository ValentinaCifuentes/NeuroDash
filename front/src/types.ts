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
   1. Entidades de dominio (ancladas a los CSV de origen)
   ============================================================ */

/** `1_casos_anonimizados.csv` */
export interface Subject {
  subject_id: string;                 // id_caso            → "PAC-002"
  display_name: string;               // solo UI; no viaja al motor
  initials: string;                   // app bar
  age_range: string;                  // rango_edad         → "6-7 años"
  diagnosis: string;                  // diagnostico_principal
  sensory_profile: string;            // perfil_sensorial_predominante
  timezone?: string;
  cold_start?: boolean;
  provenance?: { source: string; synthetic: boolean };
}

export interface SubjectOnboardingInput {
  display_name: string;
  timezone: string;
  baseline: Record<string, string>;
  provenance: { source: string; synthetic: boolean };
}

export interface SubjectListResponse {
  contract_version: '2.0';
  subjects: Subject[];
}

/** `4_seguimiento_diario_tutor.csv` — un registro por infante y día */
export interface DailyRecord {
  record_id?: string;                 // id_registro_diario  → "REG-014"
  subject_id: string;                 // id_caso
  date: string;                       // fecha ISO           → "2026-08-26"
  sleep_quality: SleepQuality | null;         // calidad_sueno
  wake_mode: WakeMode | null;                 // modo_despertar
  /**
   * autonomia_inicio_dia.
   *
   * Extensión al CSV de origen: la columna no existe en
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
  /**
   * Conteos que el backend recalcula al guardar cada evento del día
   * (`_refresh_daily_event_counts`). Solo vienen en lecturas, nunca se envían.
   */
  event_count?: number;
  dysregulation_count?: number;
  max_intensity?: number;
  /* --- Contexto del día («¿Pasó algo distinto hoy?»). null o vacío = sin responder. --- */
  sleep_hours_range?: string | null;
  early_signs?: string[];
  physical_discomfort?: string[];
  routine_change?: string | null;
  school_attendance?: string | null;
  /**
   * Clave de reintento (P2): la misma para todos los intentos de un mismo
   * guardado, así una respuesta perdida no duplica el registro.
   */
  idempotency_key?: string;
}

/** `5_eventos_desregulacion_tutor.csv` */
export interface DysregulationEvent {
  event_id?: string;                  // id_evento           → "EVT-008"
  subject_id: string;                 // id_caso
  occurred_at: string;                // fecha_hora ISO
  event_type: EventType;              // tipo_evento
  intensity_band: IntensityBand;      // intensidad          → "Moderada (4-7)"
  intensity_value: number;            // 1..10 — precisión añadida por el slider
  /** detonante_gatillante. Catálogo cerrado (D5) + el texto de «Otro». */
  trigger: string[] | null;
  /** estrategia_calma_aplicada (Desregulación). Catálogo cerrado (D5) + el texto de «Otro». */
  strategy_applied: string[] | null;
  /** Apoyo utilizado en una Transición (una opción). */
  support_used: string | null;
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
  /** Clave de reintento (P2), igual que en `DailyRecord`. */
  idempotency_key?: string;
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
  /** true si el campo cuenta para la confianza (`core_fields`); false si es opcional. */
  is_core?: boolean;
}

export interface SupportItem {
  support_id: string;
  source: 'historical_support' | 'program_objective' | 'sensory_profile' | 'validated_catalog' | 'insufficient_data';
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
  /** Caregiver-safe Contract v2 projection; technical model scores never enter the UI. */
  contract_version: '2';
  prediction_id: string;
  subject_id: string;
  prediction_cutoff: string;
  horizon_hours: number;
  risk: string | null;
  confidence: ConfidenceLevel;
  abstained: boolean;
  factors: PredictionFactor[];
  missingness: MissingDataItem[];
  supports: SupportItem[];
  provenance: Record<string, unknown>;
  versions: Record<string, string>;
}

export interface PredictionRequest {
  subject_id: string;
  prediction_cutoff: string;
}

export interface OutcomeConfirmation {
  prediction_id: string;
  actual_outcome: boolean;
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

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, string>;
}

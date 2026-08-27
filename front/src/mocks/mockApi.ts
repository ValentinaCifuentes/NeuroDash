/**
 * ⚠️  FIXTURE DE UI — NO ES EL MOTOR.
 *
 * Este módulo existe para que el frontend se pueda desarrollar y demostrar
 * sin backend levantado. Devuelve objetos que cumplen el mismo contrato,
 * nada más.
 *
 * NO contiene el pipeline de features, ni baseline, ni modelo, ni SHAP.
 * En la demo real, `VITE_API_BASE` apunta a FastAPI y este archivo queda
 * fuera del camino: la predicción sale de `models/PAC-XXX/model_vN.joblib`.
 *
 * El `data_provenance` de cada respuesta mockeada lo declara explícitamente
 * con `engine: "ui_fixture"` para que sea imposible confundirlos en pantalla.
 *
 * Semilla: `data/bluba/*.csv` (PAC-002, julio 2026).
 */

import type {
  DailyRecord,
  DysregulationEvent,
  Prediction,
  PredictionRequest,
  ProfessionalSession,
  ProfessionalSessionDraft,
  Subject,
  SubjectOnboardingInput,
  TimelineEntry,
  TimelineResponse,
} from '../types';
import { CATEGORY_BY_ID, formatTime, todayIso } from '../domain/catalog';
import { createSubjectId, subjectInitials } from '../domain/subjectIdentity';

const LATENCY = 420;

function delay<T>(value: T, ms = LATENCY): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/* --- Sujeto: fila PAC-002 de 1_casos_anonimizados.csv --- */
const SUBJECTS: Record<string, Subject> = {
  'PAC-002': {
    subject_id: 'PAC-002',
    display_name: 'Amelia Soto Neira',
    initials: 'FS',
    age_range: '6-7 años',
    diagnosis: 'Trastorno del Espectro Autista (TEA)',
    sensory_profile: 'Hipersensible Auditivo y Evitador Táctil',
  },
};

/* --- Almacén en memoria. Se pierde al recargar; es intencional. --- */
const dailyRecords: DailyRecord[] = [];
const events: DysregulationEvent[] = [];
let seq = 100;

const sessions: ProfessionalSession[] = [];

/* ============================================================
   Semilla longitudinal de 30 días
   ============================================================

   Existe para que el mapa de calor y el seguimiento tengan forma en la
   demo de UI. Es determinista (LCG con semilla fija), así que dos cargas
   producen el mismo historial y las capturas son reproducibles.

   No representa a ningún niño y no entrena nada: en la demo real el
   historial sale de `data/demo_profiles/PAC-A/history.csv` y equivalentes.
   ============================================================ */

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function seedHistory(subjectId: string) {
  const rand = seededRandom(20260826);
  const sleepOptions: DailyRecord['sleep_quality'][] = [
    'Reparador',
    'Reparador',
    'Interrumpido',
    'Dificultad de Conciliación',
  ];
  const types = Object.values(CATEGORY_BY_ID);

  // De hace 29 días hasta ayer: hoy lo llena la persona en la demo.
  for (let back = 29; back >= 1; back--) {
    const day = new Date();
    day.setDate(day.getDate() - back);
    day.setHours(7, 30, 0, 0);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate(),
    ).padStart(2, '0')}`;

    // Un 15% de días sin registro: los huecos son parte de lo que se muestra.
    if (rand() > 0.15) {
      const sleep = sleepOptions[Math.floor(rand() * sleepOptions.length)] ?? 'Reparador';
      dailyRecords.push({
        record_id: `REG-S${back}`,
        subject_id: subjectId,
        date,
        sleep_quality: sleep,
        wake_mode: rand() > 0.5 ? 'Tranquilo/Alegre' : 'Cansado/Con Sueño',
        start_autonomy: rand() > 0.6 ? 'Por sí solo' : 'Con insistencia',
        medication_adherence: rand() > 0.2 ? 'Sí' : 'No',
        gi_status: rand() > 0.8 ? 'Estreñimiento' : 'Normal',
      });
    }

    // Distribución sesgada a pocos eventos, con algún día cargado.
    const roll = rand();
    const count = roll > 0.93 ? 5 : roll > 0.8 ? 3 : roll > 0.45 ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const cat = types[Math.floor(rand() * types.length)] ?? types[0]!;
      const intensity = 1 + Math.floor(rand() * 10);
      const at = new Date(day);
      at.setHours(9 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0);
      events.push({
        event_id: `EVT-S${back}-${i}`,
        subject_id: subjectId,
        occurred_at: at.toISOString(),
        event_type: cat.eventType,
        intensity_band: intensity <= 3 ? 'Leve (1-3)' : intensity <= 7 ? 'Moderada (4-7)' : 'Severa (8-10)',
        intensity_value: intensity,
        qualitative_outcome: null,
        trigger: null,
        strategy_applied: null,
        strategy_outcome: null,
        sensory_activity: null,
        notes: null,
        quick_capture: true,
      });
    }
  }

  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 4);
  lastWeek.setHours(15, 0, 0, 0);
  sessions.push({
    session_id: 'SES-001',
    subject_id: subjectId,
    occurred_at: lastWeek.toISOString(),
    professional: 'Pamela Neira Neira',
    consultation_reason: 'Evaluación',
    modality: 'Presencial',
    duration_minutes: 45,
    attendance: 'Presente',
    paid: false,
    status: 'Atendida',
    alert_level: 'Medio',
    objectives: 'Objetivos de la sesión: reforzar las vocales y el saludo.',
    activities: 'Actividades realizadas: juego con vocales y saludar a sus compañeros.',
    observations: 'Buena disposición durante toda la sesión.',
    visible_to_tutor: true,
    active: true,
  });
}

seedHistory('PAC-002');

export function getSessions(subjectId: string): Promise<ProfessionalSession[]> {
  const list = sessions
    .filter((s) => s.subject_id === subjectId && s.active)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return delay(list, 300);
}

export function saveSession(session: ProfessionalSessionDraft): Promise<ProfessionalSession> {
  const { internal_notes: _internalNotes, ...projection } = session;
  const stored: ProfessionalSession = {
    ...projection,
    session_id: session.session_id ?? `SES-${++seq}`,
  };
  const i = sessions.findIndex((s) => s.session_id === stored.session_id);
  if (i >= 0) sessions[i] = stored;
  else sessions.push(stored);
  return delay(stored);
}

export function getSubject(subjectId: string): Promise<Subject> {
  const subject = SUBJECTS[subjectId];
  if (!subject) {
    return Promise.reject({
      status: 404,
      code: 'subject_not_found',
      message: 'No encontramos a este consultante. Vuelve al listado e inténtalo otra vez.',
    });
  }
  return delay(subject, 260);
}

export function listSubjects(): Promise<Subject[]> {
  return delay(Object.values(SUBJECTS), 260);
}

export function onboardSubject(input: SubjectOnboardingInput): Promise<Subject> {
  let subjectId: string;
  try {
    subjectId = createSubjectId(input.display_name);
  } catch (error) {
    return Promise.reject({ status: 422, code: 'validation_error', message: (error as Error).message });
  }
  const subject: Subject = {
    subject_id: subjectId,
    display_name: input.display_name.trim(),
    initials: subjectInitials(input.display_name),
    age_range: '',
    diagnosis: '',
    sensory_profile: input.baseline.sensory_profile ?? '',
    timezone: input.timezone,
    cold_start: true,
    provenance: { ...input.provenance, synthetic: true },
  };
  SUBJECTS[subjectId] = subject;
  return delay(subject);
}

export function saveDailyRecord(record: DailyRecord): Promise<DailyRecord> {
  const stored: DailyRecord = { ...record, record_id: `REG-${++seq}` };
  const i = dailyRecords.findIndex(
    (r) => r.subject_id === record.subject_id && r.date === record.date,
  );
  if (i >= 0) dailyRecords[i] = stored;
  else dailyRecords.push(stored);
  return delay(stored);
}

export function saveEvent(event: DysregulationEvent): Promise<DysregulationEvent> {
  const stored: DysregulationEvent = { ...event, event_id: `EVT-${++seq}` };
  events.push(stored);
  return delay(stored);
}

export function getTimeline(
  subjectId: string,
  asOf: string,
  days: number,
): Promise<TimelineResponse> {
  const cutoff = new Date(asOf).getTime();
  const from = cutoff - days * 24 * 60 * 60 * 1000;
  const entries: TimelineEntry[] = [];

  for (const r of dailyRecords) {
    if (r.subject_id !== subjectId) continue;
    const ts = new Date(`${r.date}T07:30:00`).getTime();
    if (ts < from || ts > cutoff) continue; // el backend real también aplica cutoff
    entries.push({
      entry_id: r.record_id ?? r.date,
      kind: 'daily_record',
      timestamp: new Date(ts).toISOString(),
      title: 'Estado basal',
      detail: [
        r.sleep_quality && `Sueño: ${r.sleep_quality}`,
        r.wake_mode && `Despertar: ${r.wake_mode}`,
        r.start_autonomy && `Inicio del día: ${r.start_autonomy}`,
        r.gi_status && `Digestión: ${r.gi_status}`,
        r.medication_adherence && `Medicación: ${r.medication_adherence}`,
      ]
        .filter(Boolean)
        .join(' · '),
      semantic: r.gi_status === 'Normal' ? 'success' : 'warning',
      payload: r,
    });
  }

  for (const e of events) {
    if (e.subject_id !== subjectId) continue;
    const ts = new Date(e.occurred_at).getTime();
    if (ts < from || ts > cutoff) continue;
    const cat = Object.values(CATEGORY_BY_ID).find((c) => c.eventType === e.event_type);
    entries.push({
      entry_id: e.event_id ?? e.occurred_at,
      kind: 'event',
      timestamp: e.occurred_at,
      title: e.event_type,
      detail: [
        // Las categorías con escala cualitativa muestran la palabra que
        // eligió el tutor, no el 1-10 que derivamos para el motor.
        e.qualitative_outcome ?? `Intensidad ${e.intensity_value} de 10`,
        e.sensory_activity && `Actividad: ${e.sensory_activity}`,
        e.trigger && `Disparador: ${e.trigger}`,
        e.strategy_applied && `Apoyo: ${e.strategy_applied}`,
        e.strategy_outcome && `Resultado: ${e.strategy_outcome}`,
        e.notes,
      ]
        .filter(Boolean)
        .join(' · '),
      semantic: cat?.semantic ?? 'neutral',
      payload: e,
    });
  }

  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return delay({ subject_id: subjectId, as_of: asOf, days, entries }, 320);
}

/**
 * Estimación de ejemplo.
 *
 * Cambia de forma con la cobertura de datos de la sesión — no para simular
 * un modelo, sino para poder ver en pantalla los tres estados que el
 * contrato permite: estimación normal, confianza baja y abstención por
 * información insuficiente (`INSUFFICIENT` llega como HTTP 200).
 */
export function getPrediction(req: PredictionRequest): Promise<Prediction> {
  // Prediction cutoffs are instants, but daily records use the tutor's local
  // calendar date. Comparing with the UTC date made today's record disappear
  // after the local evening in Chile.
  const cutoffDate = new Date(req.prediction_cutoff);
  const cutoffLocalDate = Number.isNaN(cutoffDate.getTime())
    ? todayIso()
    : `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(
        cutoffDate.getDate(),
      ).padStart(2, '0')}`;
  const todaysRecord = dailyRecords.find(
    (r) => r.subject_id === req.subject_id && r.date === cutoffLocalDate,
  );
  const todaysEvents = events.filter((e) => e.subject_id === req.subject_id);
  const worst = Math.max(0, ...todaysEvents.map((e) => e.intensity_value));

  const provenance = {
    contains_synthetic_data: true,
    origins: ['ui_fixture', 'BLUBA_CSV_schema'],
  };
  const technical = {
    engine: 'ui_fixture',
    training_strategy_version: 'n/a',
    explainer: null,
    confidence_ruleset_version: 'n/a',
    feature_schema_version: '0.1',
  };
  const base = {
    contract_version: '2' as const,
    prediction_id: `pred-fixture-${++seq}`,
    subject_id: req.subject_id,
    prediction_cutoff: req.prediction_cutoff,
    horizon_hours: 24,
    provenance: { ...provenance, engine: technical.engine },
    versions: { model: 'ui-fixture', contract: '2' },
  };

  /* Sin registro del día → abstención dura. */
  if (!todaysRecord) {
    return delay({
      ...base,
      risk: null,
      confidence: 'INSUFFICIENT',
      abstained: true,
      factors: [],
      missingness: [
        {
          code: 'daily_record_today',
          label: 'Estado basal de hoy',
          impact: 'Sin sueño ni digestión de hoy no se puede estimar el día.',
        },
      ],
      supports: [],
    } satisfies Prediction);
  }

  const pushers = [];
  if (todaysRecord.sleep_quality === 'Dificultad de Conciliación') {
    pushers.push({
      code: 'sleep_deviation',
      label: 'Descanso nocturno',
      comparison: 'Noche muy distinta de su patrón habitual',
      direction: 'up' as const,
      window: '1d',
    });
  }
  if (todaysRecord.gi_status && todaysRecord.gi_status !== 'Normal') {
    pushers.push({
      code: 'gi_status',
      label: 'Estado gastrointestinal',
      comparison: `${todaysRecord.gi_status} registrado hoy`,
      direction: 'up' as const,
      window: '1d',
    });
  }
  if (worst >= 8) {
    pushers.push({
      code: 'recent_event_load',
      label: 'Eventos recientes',
      comparison: '1 episodio severo en las últimas horas',
      direction: 'up' as const,
      window: '1d',
    });
  }
  if (todaysRecord.sleep_quality === 'Reparador') {
    pushers.push({
      code: 'sleep_deviation',
      label: 'Descanso nocturno',
      comparison: 'Noche dentro de su rango habitual',
      direction: 'down' as const,
      window: '1d',
    });
  }

  const ups = pushers.filter((f) => f.direction === 'up').length;
  const score = Math.min(0.92, 0.18 + ups * 0.22 + (worst >= 8 ? 0.12 : 0));

  return delay({
    ...base,
    risk: score >= 0.6 ? 'ELEVATED' : score >= 0.35 ? 'MODERATE' : 'LOW',
    confidence: todaysEvents.length > 0 ? 'MEDIUM' : 'LOW',
    abstained: false,
    factors: pushers.slice(0, 3),
    missingness:
      todaysRecord.medication_adherence === null
        ? [
            {
              code: 'medication_adherence',
              label: 'Adherencia a la medicación',
              impact: 'Sin este dato la estimación pierde precisión.',
            },
          ]
        : [],
    supports: [
      {
        support_id: 'SUP-003',
        source: 'historical_support',
        label: 'Audífonos atenuadores de ruido',
        detail: `Funcionó en un episodio previo (${formatTime('2026-07-06T08:45:00')}).`,
      },
      {
        support_id: 'SUP-007',
        source: 'sensory_profile',
        label: 'Anticipar cambios con apoyo visual',
        detail: 'Coherente con su perfil hipersensible auditivo.',
      },
    ],
  } satisfies Prediction);
}

export function confirmPredictionOutcome(
  predictionId: string,
  actualOutcome: boolean,
  _idempotencyKey: string,
): Promise<{ prediction_id: string; actual_outcome: boolean }> {
  return delay({ prediction_id: predictionId, actual_outcome: actualOutcome });
}

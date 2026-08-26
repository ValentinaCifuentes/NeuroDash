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
  Subject,
  TimelineEntry,
  TimelineResponse,
} from '../types';
import { CATEGORY_BY_ID, formatTime } from '../domain/catalog';

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
        `Intensidad ${e.intensity_value} de 10`,
        e.trigger && `Disparador: ${e.trigger}`,
        e.strategy_applied && `Apoyo: ${e.strategy_applied}`,
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
  const todaysRecord = dailyRecords.find(
    (r) => r.subject_id === req.subject_id && r.date === req.as_of.slice(0, 10),
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
    contract_version: '2.0' as const,
    prediction_id: `pred-fixture-${++seq}`,
    subject_id: req.subject_id,
    as_of: req.as_of,
    horizon: 'next_24h' as const,
    model_version: 'ui-fixture',
    model_family: 'none',
    data_provenance: provenance,
    technical_metadata: technical,
  };

  /* Sin registro del día → abstención dura. */
  if (!todaysRecord) {
    return delay({
      ...base,
      risk_level: 'LOW',
      model_score: 0,
      confidence_level: 'INSUFFICIENT',
      abstain: true,
      abstention_reason: 'daily_record_missing',
      factors: [],
      missing: [
        {
          code: 'daily_record_today',
          label: 'Estado basal de hoy',
          impact: 'Sin sueño ni digestión de hoy no se puede estimar el día.',
        },
      ],
      priority_data_request: 'Registra el estado basal de hoy para activar la estimación.',
      support: [],
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
    risk_level: score >= 0.6 ? 'ELEVATED' : score >= 0.35 ? 'MODERATE' : 'LOW',
    model_score: Number(score.toFixed(2)),
    confidence_level: todaysEvents.length > 0 ? 'MEDIUM' : 'LOW',
    abstain: false,
    abstention_reason: null,
    factors: pushers.slice(0, 3),
    missing:
      todaysRecord.medication_adherence === null
        ? [
            {
              code: 'medication_adherence',
              label: 'Adherencia a la medicación',
              impact: 'Sin este dato la estimación pierde precisión.',
            },
          ]
        : [],
    priority_data_request:
      todaysEvents.length === 0
        ? 'Registrar los episodios del día mejora la confianza de mañana.'
        : null,
    support: [
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

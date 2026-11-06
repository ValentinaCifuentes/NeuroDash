/**
 * Backend de mentira para el modo sin servidor (`VITE_API_BASE` vacío). Es
 * secundario: sirve para trabajar el front sin levantar FastAPI.
 *
 * ⚠️ NO es el motor. Responde con el mismo JSON que FastAPI (mismas rutas, mismas
 * claves) y `api.ts` lo pasa por los mismos adaptadores que la API real, así la
 * interfaz no distingue un modo del otro. Las demos salen de la demo real
 * (`scripts/export_mock_fixture.py` → `demo-fixture.json`):
 *
 * - PAC-A riesgo elevado · PAC-B riesgo bajo · PAC-C sin estimación (2 días);
 * - horizonte de 8 h, perfiles completos, apoyos y línea de tiempo del backend.
 *
 * Las estimaciones son las que calculó el motor al exportar: lo que se registra
 * aquí aparece en el historial y en Seguimiento, pero no cambia la estimación.
 * Un infante nuevo no tiene historial y siempre queda sin estimación, como en
 * el backend. Todo vive en memoria: se pierde al recargar.
 */

import type { ApiError } from '../types';
import { createSubjectId, subjectInitials } from '../domain/subjectIdentity';
import fixture from './demo-fixture.json';
import { newId } from '../domain/ids';

type Json = Record<string, any>;

/** Pausa por pedido, para que la carga se vea como con red. Las pruebas la bajan a 0. */
let latency = 260;
const DAY_MS = 86_400_000;
const DYSREGULATION = 'Desregulación Emocional';
/** Igual que `EVENT_SCALE_ENCODINGS` del backend. */
const EVENT_SCALES: Record<string, [string, Record<string, number>]> = {
  'Transición de Actividad': ['transition_difficulty', { Fácil: 0, 'Con ayuda': 1, Difícil: 2 }],
  Alimentación: ['feeding_difficulty', { Adecuada: 0, Regular: 1, Dificultosa: 2 }],
  'Dieta Sensorial': ['sensory_diet_done', { Completa: 1, Parcial: 0.5, 'No realizada': 0 }],
};

/* ============================================================
   Fechas: la demo termina siempre «ayer»
   ============================================================ */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/;

/** Corre una fecha ISO `days` días sin tocar la hora ni el desfase escritos. */
export function shiftIsoDate(value: string, days: number): string {
  const match = ISO_DATE.exec(value);
  if (!match || days === 0) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${date.toISOString().slice(0, 10)}${match[4] ?? ''}`;
}

function shiftDeep<T>(value: T, days: number): T {
  if (typeof value === 'string') return shiftIsoDate(value, days) as T;
  if (Array.isArray(value)) return value.map((item) => shiftDeep(item, days)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shiftDeep(item, days)])) as T;
  }
  return value;
}

/** Días entre la mañana del fixture y hoy (local). */
function daysSinceAnchor(now: Date): number {
  const anchor = ISO_DATE.exec(fixture.anchor)!;
  const anchorDay = Date.UTC(Number(anchor[1]), Number(anchor[2]) - 1, Number(anchor[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - anchorDay) / DAY_MS);
}

/* ============================================================
   Estado en memoria
   ============================================================ */

interface Store {
  profiles: Record<string, Json>;
  records: Record<string, Json[]>;
  occurrences: Record<string, Json[]>;
  planned_events: Record<string, Json[]>;
  predictions: Record<string, Json>;
  keys: Map<string, Json>;
}

let store: Store | null = null;

function state(): Store {
  if (store) return store;
  const shift = daysSinceAnchor(new Date());
  const timeline = shiftDeep(fixture.timeline as Record<string, Json[]>, shift);
  store = {
    profiles: structuredClone(fixture.subjects as Record<string, Json>),
    records: {},
    occurrences: {},
    planned_events: {},
    predictions: shiftDeep(fixture.predictions as Record<string, Json>, shift),
    keys: new Map(),
  };
  for (const [subjectId, entries] of Object.entries(timeline)) {
    store.records[subjectId] = entries.filter((entry) => entry.kind === 'daily_record').map((entry) => entry.payload);
    store.occurrences[subjectId] = entries.filter((entry) => entry.kind === 'event').map((entry) => entry.payload);
  }
  // Eventos planificados de las demos (ejemplos del prototipo), con fechas relativas a hoy.
  const now = new Date();
  for (const [subjectId, profile] of Object.entries(store.profiles)) {
    if (profile.provenance?.synthetic) {
      store.planned_events[subjectId] = demoPlannedEvents(subjectId, now);
    }
  }
  return store;
}

/** Ejemplos del prototipo, solo para los infantes demo (nunca para uno real). */
function demoPlannedEvents(subjectId: string, now: Date): Json[] {
  const sunday = (7 - now.getDay()) % 7 || 7;
  const saturday = sunday === 1 ? 7 : sunday - 1;
  const at = (days: number, hours: number, minutes = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  };
  return [
    { planned_event_id: 'demo-1', subject_id: subjectId, title: 'Cita con el Dentista', starts_at: at(1, 15, 30), category: 'Salud', expectation: 'Desagradable' },
    { planned_event_id: 'demo-2', subject_id: subjectId, title: 'Visita a la Abuela', starts_at: at(saturday, 12), category: 'Social', expectation: 'Agradable' },
    { planned_event_id: 'demo-3', subject_id: subjectId, title: 'Cumpleaños de Martín (Mucho ruido)', starts_at: at(sunday, 16), category: 'Social', expectation: 'Estresante' },
  ];
}

/** Solo para pruebas: vuelve al fixture recién cargado. */
export function resetMockBackend(): void {
  store = null;
}

/** Solo para pruebas: sin pausa simulada. */
export function setMockLatency(ms: number): void {
  latency = ms;
}

/* ============================================================
   Rutas (las mismas de backend/app/routes)
   ============================================================ */

function fail(status: number, code: string, message: string): never {
  throw { status, code, message } satisfies ApiError;
}

function profileOf(subjectId: string): Json {
  return state().profiles[subjectId] ?? fail(404, 'subject_not_found', 'No encontramos a este infante. Vuelve al listado e inténtalo otra vez.');
}

const listItem = (profile: Json) => ({
  contract_version: '2.0',
  subject_id: profile.subject_id,
  display_name: profile.display_name,
  initials: profile.initials ?? subjectInitials(profile.display_name),
  timezone: profile.timezone,
  cold_start: !state().records[profile.subject_id]?.length,
  provisional_baseline: {},
  provenance: profile.provenance,
});

const localDate = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const hexId = () => newId().replace(/-/g, '');

/** Una misma clave de reintento devuelve lo ya guardado (P2), como el backend. */
function once(key: string | undefined, save: () => Json): Json {
  const s = state();
  if (key && s.keys.has(key)) return s.keys.get(key)!;
  const saved = save();
  if (key) s.keys.set(key, saved);
  return saved;
}

function onboard(body: Json): Json {
  let subjectId: string;
  try {
    subjectId = createSubjectId(body.display_name ?? '');
  } catch (error) {
    fail(422, 'validation_error', (error as Error).message);
  }
  const profile = {
    contract_version: '2.0',
    subject_id: subjectId,
    display_name: String(body.display_name).trim(),
    initials: subjectInitials(body.display_name),
    timezone: body.timezone,
    baseline: body.baseline ?? {},
    provenance: body.provenance,
    habitual_context: body.habitual_context ?? {},
    sensory_context: body.sensory_context ?? {},
    historical_supports: body.historical_supports ?? [],
    authorized_tutor_ids: body.authorized_tutor_ids ?? [],
  };
  const s = state();
  s.profiles[subjectId] = profile;
  s.records[subjectId] ??= [];
  s.occurrences[subjectId] ??= [];
  return { ...profile, cold_start: true, provisional_baseline: {} };
}

/** Solo el texto: la interfaz lee `raw` (el número es cosa del backend real). */
function saveDailyRecord(subjectId: string, body: Json): Json {
  profileOf(subjectId);
  return once(body.idempotency_key, () => {
    const { occurred_at, idempotency_key, provenance: _provenance, ...answers } = body;
    const raw = Object.fromEntries(
      Object.entries(answers).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined)),
    );
    const record = {
      record_id: hexId(),
      subject_id: subjectId,
      date: localDate(occurred_at),
      source_timestamp: occurred_at,
      availability_timestamp: occurred_at,
      prediction_availability: 'immediate',
      idempotency_key,
      raw,
    };
    state().records[subjectId].push(record);
    return record;
  });
}

function saveEvent(subjectId: string, body: Json): Json {
  const profile = profileOf(subjectId);
  return once(body.idempotency_key, () => {
    const { provenance: _provenance, ...fields } = body;
    const event: Json = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined)),
    );
    event.event_id = hexId();
    event.subject_id = subjectId;
    event.source_timestamp = body.occurred_at;
    event.availability_timestamp = body.occurred_at;
    if (body.event_type === DYSREGULATION) {
      event.severity = body.intensity_value >= 8 ? 'severe' : body.intensity_value >= 4 ? 'moderate' : 'mild';
    }
    state().occurrences[subjectId].push(event);
    refreshDayCounts(subjectId, body.occurred_at);
    rememberEffective(profile, body);
    return event;
  });
}

/** Igual que `_refresh_daily_event_counts`: conteos y escalas del día en su registro. */
function refreshDayCounts(subjectId: string, occurredAt: string): void {
  const s = state();
  const day = localDate(occurredAt);
  const today = s.occurrences[subjectId].filter((event) => localDate(event.source_timestamp) === day);
  const counts: Json = {
    event_count: today.length,
    dysregulation_count: today.filter((event) => event.event_type === DYSREGULATION).length,
    max_intensity: Math.max(0, ...today.map((event) => Number(event.intensity_value) || 0)),
  };
  for (const [eventType, [field, scale]] of Object.entries(EVENT_SCALES)) {
    const values = today
      .filter((event) => event.event_type === eventType && event.qualitative_outcome in scale)
      .map((event) => scale[event.qualitative_outcome]);
    if (values.length > 0) counts[field] = Math.max(...values);
  }
  const target = s.records[subjectId].find((record) => record.date === day);
  if (target) Object.assign(target, counts);
  else {
    s.records[subjectId].push({
      record_id: hexId(),
      subject_id: subjectId,
      date: day,
      source_timestamp: occurredAt,
      availability_timestamp: occurredAt,
      prediction_availability: 'immediate',
      ...counts,
    });
  }
}

/** Igual que `_remember_effective_supports`: lo que funcionó queda en el perfil. */
function rememberEffective(profile: Json, body: Json): void {
  if (body.strategy_outcome !== 'Regulación Exitosa') return;
  const applied = [...(body.strategy_applied ?? []), body.support_used, body.sensory_activity]
    .filter((text): text is string => typeof text === 'string' && Boolean(text.trim()))
    .map((text) => text.trim())
    .filter((text) => !['Otro', 'Otra', 'Ninguno'].includes(text));
  profile.historical_supports ??= [];
  for (const text of applied) {
    const known = profile.historical_supports.find(
      (support: Json) => String(support.description ?? '').replace(/\.$/, '').toLowerCase() === text.toLowerCase(),
    );
    if (known) known.effective = true;
    else profile.historical_supports.push({ id: `sup_evt_${hexId().slice(0, 8)}`, description: text, type: 'historical', effective: true });
  }
}

/** Igual que `POST /planned-events`: guarda el evento planificado en memoria. */
function savePlannedEvent(subjectId: string, body: Json): Json {
  profileOf(subjectId);
  const event: Json = {
    planned_event_id: hexId(),
    subject_id: subjectId,
    title: body.title,
    starts_at: body.starts_at,
    category: body.category ?? null,
    expectation: body.expectation ?? null,
  };
  state().planned_events[subjectId] ??= [];
  state().planned_events[subjectId].push(event);
  return event;
}

function timeline(subjectId: string, params: URLSearchParams): Json {
  profileOf(subjectId);
  const s = state();
  const asOf = params.get('as_of') ?? new Date().toISOString();
  const days = Number(params.get('days') ?? 7);
  const end = Date.parse(asOf);
  const start = end - days * DAY_MS;
  const inWindow = (iso: string) => Date.parse(iso) > start && Date.parse(iso) <= end;
  const entries = [
    ...s.records[subjectId]
      .filter((record) => inWindow(record.source_timestamp))
      .map((record) => ({
        entry_id: record.record_id ?? record.id,
        kind: 'daily_record',
        timestamp: record.source_timestamp,
        title: 'Daily record',
        detail: null,
        semantic: 'neutral',
        payload: record,
      })),
    ...s.occurrences[subjectId]
      .filter((event) => inWindow(event.source_timestamp))
      .map((event) => ({
        entry_id: event.event_id ?? event.id,
        kind: 'event',
        timestamp: event.source_timestamp,
        title: event.event_type ?? 'Crisis confirmada',
        detail: null,
        semantic: 'neutral',
        payload: event,
      })),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return { subject_id: subjectId, as_of: asOf, days, entries };
}

/** Apoyo «le sirvió antes», con la forma de `_effective_history_recommendations`. */
const effectiveSupport = (support: Json) => ({
  id: `previous_effective_${support.id}`,
  description: support.description,
  type: 'historical',
  source: 'historical_support',
  category: support.category ?? 'general',
  case_id: 'previously_effective_similar_context',
  evidence_bounded: true,
  rationale: 'Le sirvió antes en situaciones parecidas.',
  priority: 1,
});

function prediction(body: Json): Json {
  const profile = profileOf(body.subject_id);
  const s = state();
  // Un infante nuevo, como en el backend, no tiene historial: sin estimación.
  const template = structuredClone(s.predictions[body.subject_id] ?? s.predictions['PAC-C']);
  const known = new Set(template.supports.map((support: Json) => String(support.description).toLowerCase()));
  const own = (profile.historical_supports ?? [])
    .filter((support: Json) => support.effective && !known.has(String(support.description).toLowerCase()))
    .map(effectiveSupport);
  const supports = s.predictions[body.subject_id]
    ? [...own, ...template.supports]
    : [...own, ...template.supports.filter((support: Json) => support.source !== 'historical_support')];
  return {
    ...template,
    prediction_id: hexId(),
    subject_id: body.subject_id,
    prediction_cutoff: body.prediction_cutoff,
    supports,
  };
}

/* ============================================================
   Punto de entrada: lo llama `request()` de api.ts en modo mock
   ============================================================ */

export async function mockRequest(path: string, init?: RequestInit): Promise<unknown> {
  const url = new URL(path, 'http://mock.local');
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const parts = url.pathname.replace(/^\/api\/v1\//, '').split('/');

  const respond = (): unknown => {
    if (parts[0] === 'subjects') {
      const [, subjectId, action] = parts;
      if (!subjectId && method === 'GET') {
        return { contract_version: '2.0', subjects: Object.values(state().profiles).map(listItem) };
      }
      if (!subjectId && method === 'POST') return onboard(body);
      if (subjectId && !action && method === 'GET') return profileOf(subjectId);
      if (action === 'timeline') return timeline(subjectId, url.searchParams);
      if (action === 'daily-records' && method === 'POST') return saveDailyRecord(subjectId, body);
      if (action === 'events' && method === 'POST') return saveEvent(subjectId, body);
      if (action === 'planned-events' && method === 'GET') return state().planned_events[subjectId] ?? [];
      if (action === 'planned-events' && method === 'POST') return savePlannedEvent(subjectId, body);
    }
    if (parts[0] === 'predictions') {
      const [, predictionId, action] = parts;
      if (!predictionId && method === 'POST') return prediction(body);
      if (action === 'outcome' && method === 'POST') {
        return { prediction_id: predictionId, actual_outcome: body.actual_outcome };
      }
    }
    return fail(404, 'not_found', `El modo sin servidor no tiene la ruta ${method} ${url.pathname}.`);
  };

  await new Promise((resolve) => setTimeout(resolve, latency));
  // Copia: la pantalla no puede cambiar el estado guardado por accidente.
  return structuredClone(respond());
}

/**
 * Cliente HTTP contra la API de NeuraDash CORE.
 *
 * Regla de arquitectura (D2): el frontend jamás depende del algoritmo.
 * Solo conoce estos endpoints y el Prediction Contract v2.
 *
 *   GET  /api/v1/subjects/{id}
 *   GET  /api/v1/subjects/{id}/timeline?as_of=...&days=...
 *   POST /api/v1/subjects/{id}/daily-records
 *   POST /api/v1/subjects/{id}/events
 *   GET  /api/v1/subjects/{id}/sessions
 *   PUT  /api/v1/subjects/{id}/sessions/{session_id}
 *   POST /api/v1/subjects/{id}/sessions
 *   POST /api/v1/predictions
 *   POST /api/v1/demo/profiles/{profile_id}/predict
 *
 * Si `VITE_API_BASE` no está definido, se usa `mocks/mockApi` para que la
 * UI corra sola durante el desarrollo del frontend. El mock respeta el
 * mismo contrato: cambiar de uno a otro no toca ningún componente.
 */

import type {
  ConfidenceLevel,
  DailyRecord,
  DysregulationEvent,
  FactorDirection,
  Prediction,
  PredictionRequest,
  ProfessionalSession,
  ProfessionalSessionDraft,
  SupportItem,
  Subject,
  TimelineEntry,
  TimelineResponse,
  ApiError,
  ApiErrorEnvelope,
  OutcomeConfirmation,
  SubjectListResponse,
  SubjectOnboardingInput,
  SessionWrite,
} from './types';
import * as mock from './mocks/mockApi';
export { createSubjectId, subjectInitials } from './domain/subjectIdentity';

const BASE = import.meta.env.VITE_API_BASE ?? '';
export const USING_MOCK = BASE === '';

export function mapApiError(status: number, envelope: ApiErrorEnvelope): ApiError {
  return { status, code: envelope.code, message: envelope.message };
}

export function mapSessionProjection(session: ProfessionalSessionDraft): ProfessionalSession {
  const { internal_notes: _internalNotes, ...projection } = session;
  return projection;
}

export function createSessionWrite(
  session: ProfessionalSessionDraft,
  idempotencyKey: string,
): SessionWrite {
  const { session_id: _sessionId, subject_id: _subjectId, ...write } = session;
  return {
    ...write,
    contract_version: '2.0',
    idempotency_key: idempotencyKey,
    provenance: { source: 'frontend_session', synthetic: false },
  };
}

export type ActorRole = 'tutor' | 'system';

export const DEFAULT_ACTOR_ID = 'tutor-demo';

/**
 * Identidad con la que el front escribe en el backend (`get_care_actor`).
 *
 * La autenticación queda fuera de alcance (D2): el actor es fijo y se define
 * al compilar con `VITE_ACTOR_ID` / `VITE_ACTOR_ROLE`. Sin configurar, se usa
 * `tutor-demo` con rol `tutor`. El backend solo acepta `tutor` o `system`.
 */
export function getActorHeaders(env: Record<string, string | undefined> = import.meta.env): {
  'X-Actor-Id': string;
  'X-Actor-Role': ActorRole;
} {
  const role = env.VITE_ACTOR_ROLE || 'tutor';
  if (role !== 'tutor' && role !== 'system') {
    throw new Error(`VITE_ACTOR_ROLE debe ser "tutor" o "system" (recibido: "${role}").`);
  }
  return { 'X-Actor-Id': env.VITE_ACTOR_ID || DEFAULT_ACTOR_ID, 'X-Actor-Role': role };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw {
      status: 0,
      code: 'network_error',
      message: 'No se pudo conectar. Revisa tu conexión e inténtalo otra vez.',
    } satisfies ApiError;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw mapApiError(res.status, {
      code: body.code ?? 'unknown_error',
      message: body.message ?? 'No se pudo completar la acción. Inténtalo otra vez.',
    });
  }

  return (await res.json()) as T;
}

export function getSubject(subjectId: string): Promise<Subject> {
  if (USING_MOCK) return mock.getSubject(subjectId);
  return request<BackendSubject>(`/api/v1/subjects/${subjectId}`).then(adaptSubject);
}

export function listSubjects(): Promise<Subject[]> {
  if (USING_MOCK) return mock.listSubjects();
  return request<SubjectListResponse>('/api/v1/subjects').then((response) => response.subjects);
}

export function onboardSubject(input: SubjectOnboardingInput): Promise<Subject> {
  if (USING_MOCK) return mock.onboardSubject(input);
  // Quien crea el perfil queda autorizado para confirmar sus resultados (`require_subject_access`).
  const body = { ...input, authorized_tutor_ids: [getActorHeaders()['X-Actor-Id']] };
  return request<Subject>('/api/v1/subjects', { method: 'POST', body: JSON.stringify(body) });
}

export function getTimeline(
  subjectId: string,
  asOf: string,
  days = 1,
): Promise<TimelineResponse> {
  if (USING_MOCK) return mock.getTimeline(subjectId, asOf, days);
  const qs = new URLSearchParams({ as_of: asOf, days: String(days) });
  return request<BackendTimelineResponse>(`/api/v1/subjects/${subjectId}/timeline?${qs}`).then(
    adaptTimelineResponse,
  );
}

/**
 * ISO con el desfase local (`2026-11-02T22:15:00-03:00`) en vez de UTC (`…Z`).
 * El backend toma la fecha del registro diario de `occurred_at.date()`: en UTC,
 * un registro hecho en Chile después de las 21:00 caería en el día siguiente.
 */
export function toLocalIsoString(date: Date): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

/** Campos que el backend exige en toda escritura de cuidado (`CareRecordWrite`, `EventWrite`). */
export type CareWriteMeta = {
  occurred_at: string;
  idempotency_key: string;
  provenance: { source: 'tutor_app'; synthetic: false };
};

export function buildCareWrite(occurredAt: Date, idempotencyKey: string = crypto.randomUUID()): CareWriteMeta {
  return {
    occurred_at: toLocalIsoString(occurredAt),
    idempotency_key: idempotencyKey,
    provenance: { source: 'tutor_app', synthetic: false },
  };
}

/** Cuerpo de `POST /daily-records`: solo los textos de la Bitácora; el backend los codifica. */
export function buildDailyRecordWrite(record: DailyRecord, now: Date = new Date(), idempotencyKey?: string) {
  return {
    ...buildCareWrite(now, idempotencyKey),
    sleep_quality: record.sleep_quality,
    wake_mode: record.wake_mode,
    start_autonomy: record.start_autonomy,
    medication_adherence: record.medication_adherence,
    gi_status: record.gi_status,
    day_regulation_level: record.day_regulation_level ?? null,
  };
}

/**
 * Cuerpo de `POST /events`. Viaja el evento completo: hoy el backend solo
 * guarda `event_type` e `intensity_value` y descarta el resto sin error; el
 * detalle se conservará cuando se amplíe `EventWrite` [PCD Fase 2].
 */
export function buildEventWrite(event: DysregulationEvent, idempotencyKey?: string) {
  const { subject_id: _subjectId, event_id: _eventId, occurred_at, ...fields } = event;
  return { ...fields, ...buildCareWrite(new Date(occurred_at), idempotencyKey) };
}

export function saveDailyRecord(record: DailyRecord): Promise<DailyRecord> {
  if (USING_MOCK) return mock.saveDailyRecord(record);
  return request<Record<string, unknown>>(`/api/v1/subjects/${record.subject_id}/daily-records`, {
    method: 'POST',
    headers: getActorHeaders(),
    body: JSON.stringify(buildDailyRecordWrite(record)),
  }).then(adaptDailyRecordPayload);
}

export function saveEvent(event: DysregulationEvent): Promise<DysregulationEvent> {
  if (USING_MOCK) return mock.saveEvent(event);
  return request<DysregulationEvent>(`/api/v1/subjects/${event.subject_id}/events`, {
    method: 'POST',
    headers: getActorHeaders(),
    body: JSON.stringify(buildEventWrite(event)),
  });
}

export function getSessions(subjectId: string): Promise<ProfessionalSession[]> {
  if (USING_MOCK) return mock.getSessions(subjectId);
  return request<ProfessionalSessionDraft[]>(`/api/v1/subjects/${subjectId}/sessions`, {
    headers: getActorHeaders(),
  }).then((sessions) => sessions.map(mapSessionProjection));
}

/** Creates a professional session using a stable, caller-provided replay identity. */
export function saveSession(session: ProfessionalSessionDraft): Promise<ProfessionalSession> {
  if (USING_MOCK) return mock.saveSession(session);
  const base = `/api/v1/subjects/${session.subject_id}/sessions`;
  const idempotencyKey = session.session_id ?? crypto.randomUUID();
  return request<ProfessionalSessionDraft>(base, {
    method: 'POST',
    headers: getActorHeaders(),
    body: JSON.stringify(createSessionWrite(session, idempotencyKey)),
  }).then(mapSessionProjection);
}

/**
 * El cliente nunca manda features calculadas (Arquitectura §5.3).
 * Solo sujeto, momento de corte y horizonte.
 */
export function getPrediction(req: PredictionRequest): Promise<Prediction> {
  if (USING_MOCK) return mock.getPrediction(req);
  return request<BackendPrediction>('/api/v1/predictions', {
    method: 'POST',
    body: JSON.stringify({
      subject_id: req.subject_id,
      prediction_cutoff: req.prediction_cutoff,
    }),
  }).then(adaptPrediction);
}

type BackendSubject = Partial<Subject> & {
  subject_id: string;
  sensory_context?: Record<string, unknown>;
};

/** `GET /subjects/{id}/timeline` (`routes/subjects.py › get_subject_timeline`). */
export type BackendTimelineResponse = {
  subject_id: string;
  as_of: string;
  days: number;
  entries: BackendTimelineEntry[];
};

export type BackendTimelineEntry = {
  entry_id: string;
  kind: 'daily_record' | 'event';
  timestamp: string;
  title: string;
  detail: string | null;
  semantic: TimelineEntry['semantic'];
  payload: Record<string, unknown>;
};

/** `PredictionContractV2` (`backend/app/schemas.py`). */
export type BackendPrediction = {
  contract_version: string;
  /** Id con el que el backend guarda la predicción (`predictions/{id}.json`). */
  prediction_id: string;
  subject_id: string;
  prediction_cutoff: string;
  horizon_hours: number;
  risk: string | null;
  model_score: number | null;
  confidence: string;
  abstained: boolean;
  factors: BackendFactor[];
  missingness: BackendMissingness[];
  supports: BackendSupport[];
  provenance: {
    excluded_from_core?: boolean;
    lineage?: Record<string, unknown> | null;
  };
  versions: Record<string, string>;
};

type BackendFactor = {
  factor_name?: string;
  feature?: string;
  contribution?: number;
  description?: string;
};

type BackendMissingness = {
  field?: string;
  window?: number | string;
  missing?: boolean;
};

type BackendSupport = {
  id?: string;
  description?: string;
  source?: SupportItem['source'];
  category?: string;
  case_id?: string;
  rationale?: string;
};

function adaptSubject(subject: BackendSubject): Subject {
  const sensoryProfile =
    subject.sensory_profile ??
    String(subject.sensory_context?.sensory_profile ?? 'Perfil sensorial no registrado');
  return {
    subject_id: subject.subject_id,
    display_name: subject.display_name ?? `Bluba ${subject.subject_id}`,
    initials: subject.initials ?? initialsFromId(subject.subject_id),
    age_range: subject.age_range ?? 'Edad no registrada',
    diagnosis: subject.diagnosis ?? 'Sin diagnóstico mostrado en esta vista',
    sensory_profile: sensoryProfile,
  };
}

export function adaptTimelineResponse(response: BackendTimelineResponse): TimelineResponse {
  return {
    subject_id: response.subject_id,
    as_of: response.as_of,
    days: response.days,
    entries: response.entries.map(adaptTimelineEntry),
  };
}

/**
 * El backend ya clasifica cada entrada (`kind`) y separa el dato guardado en
 * `payload`. Un registro diario también puede traer `event_count`, así que el
 * tipo nunca se infiere de los campos.
 */
function adaptTimelineEntry(entry: BackendTimelineEntry): TimelineEntry {
  if (entry.kind === 'daily_record') {
    const record = adaptDailyRecordPayload(entry.payload);
    return {
      entry_id: entry.entry_id,
      kind: 'daily_record',
      timestamp: entry.timestamp,
      title: 'Registro diario',
      detail: summarizeDailyRecord(record),
      semantic: 'info',
      payload: record,
    };
  }
  const event = entry.payload as unknown as DysregulationEvent & { severity?: string };
  return {
    entry_id: entry.entry_id,
    kind: 'event',
    timestamp: entry.timestamp,
    title: event.event_type ?? 'Evento registrado',
    detail: summarizeEvent(event),
    semantic: 'warning',
    payload: event,
  };
}

/**
 * El backend guarda cada respuesta de la Bitácora dos veces: el número que usa
 * el modelo en la raíz (`sleep_quality: 8`) y el texto que eligió el tutor en
 * `raw` (`raw.sleep_quality: "Reparador"`). La interfaz trabaja con el texto,
 * así que aquí se reconstruye el `DailyRecord` desde `raw`.
 */
function adaptDailyRecordPayload(payload: Record<string, unknown>): DailyRecord {
  const raw = (payload.raw ?? {}) as Partial<Record<keyof DailyRecord, string>>;
  const count = (value: unknown) => (typeof value === 'number' ? value : undefined);
  return {
    record_id: payload.record_id as string | undefined,
    subject_id: String(payload.subject_id ?? ''),
    date: String(payload.date ?? ''),
    sleep_quality: (raw.sleep_quality ?? null) as DailyRecord['sleep_quality'],
    wake_mode: (raw.wake_mode ?? null) as DailyRecord['wake_mode'],
    start_autonomy: (raw.start_autonomy ?? null) as DailyRecord['start_autonomy'],
    medication_adherence: (raw.medication_adherence ?? null) as DailyRecord['medication_adherence'],
    gi_status: (raw.gi_status ?? null) as DailyRecord['gi_status'],
    day_regulation_level: (raw.day_regulation_level ?? null) as DailyRecord['day_regulation_level'],
    event_count: count(payload.event_count),
    dysregulation_count: count(payload.dysregulation_count),
    max_intensity: count(payload.max_intensity),
  };
}

/**
 * El `prediction_id` siempre viene del backend: «Confirmar que ocurrió» lo usa
 * para encontrar la predicción guardada, así que un id armado en el front
 * nunca la encontraría.
 */
export function adaptPrediction(prediction: BackendPrediction): Prediction {
  return {
    contract_version: '2',
    prediction_id: prediction.prediction_id,
    subject_id: prediction.subject_id,
    prediction_cutoff: prediction.prediction_cutoff,
    horizon_hours: prediction.horizon_hours,
    risk: adaptRisk(prediction.risk),
    confidence: adaptConfidence(prediction.confidence),
    abstained: prediction.abstained,
    factors: prediction.factors.map(adaptFactor),
    missingness: prediction.missingness.filter((item) => item.missing).map(adaptMissingness),
    supports: prediction.supports.map(adaptSupport),
    provenance: prediction.provenance,
    versions: prediction.versions,
  };
}

function adaptRisk(risk: string | null): Prediction['risk'] {
  if (risk === 'HIGH' || risk === 'ELEVATED') return 'ELEVATED';
  if (risk === 'MEDIUM' || risk === 'MODERATE') return 'MODERATE';
  if (risk === 'LOW') return 'LOW';
  return null;
}

function adaptConfidence(confidence: string): ConfidenceLevel {
  if (confidence === 'HIGH' || confidence === 'MEDIUM' || confidence === 'LOW' || confidence === 'INSUFFICIENT') {
    return confidence;
  }
  return 'INSUFFICIENT';
}

function adaptFactor(factor: BackendFactor) {
  const contribution = Number(factor.contribution ?? 0);
  const direction: FactorDirection = contribution >= 0 ? 'up' : 'down';
  return {
    code: factor.feature ?? factor.factor_name ?? 'factor',
    label: factor.factor_name ?? 'Factor observado',
    comparison: factor.description ?? 'Asociación observada en el historial reciente.',
    direction,
    window: inferWindow(factor.feature ?? factor.factor_name ?? ''),
  };
}

function adaptMissingness(item: BackendMissingness) {
  const field = String(item.field ?? 'dato');
  const window = item.window ? ` en ventana ${item.window}` : '';
  return {
    code: `${field}-${item.window ?? 'unknown'}`,
    label: humanize(field),
    impact: `Falta información reciente${window}; la estimación puede tener menor respaldo.`,
  };
}

function adaptSupport(support: BackendSupport): SupportItem {
  return {
    support_id: String(support.id ?? support.case_id ?? 'support'),
    source: support.source ?? 'validated_catalog',
    label: support.description ?? 'Apoyo contextual disponible',
    detail: support.rationale ?? support.category ?? null,
  };
}

/**
 * Ventana de un factor según su nombre de variable (`FEATURE_VARIABLE_NAMES` en
 * `engine/explanation.py`): `…_un_dia`, `…_dos_dias`, `…_tres_dias`, etc. Las
 * desviaciones frente a la línea base no tienen ventana y quedan como `actual`.
 */
const WINDOW_BY_SUFFIX: Array<[string, string]> = [
  ['_catorce_dias', '14d'],
  ['_siete_dias', '7d'],
  ['_tres_dias', '3d'],
  ['_dos_dias', '2d'],
  ['_un_dia', '1d'],
];

function inferWindow(value: string): string {
  return WINDOW_BY_SUFFIX.find(([suffix]) => value.endsWith(suffix))?.[1] ?? 'actual';
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function initialsFromId(subjectId: string): string {
  return subjectId
    .split(/[-_\s]+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const SEVERITY_LABEL: Record<string, string> = { mild: 'leve', moderate: 'moderada', severe: 'severa' };

function joinParts(parts: Array<string | null | undefined | false>): string | null {
  const present = parts.filter(Boolean);
  return present.length > 0 ? present.join(' · ') : null;
}

function summarizeDailyRecord(record: DailyRecord): string | null {
  const events = record.event_count
    ? `Eventos del día: ${record.event_count}` +
      (record.dysregulation_count ? ` (${record.dysregulation_count} de desregulación)` : '') +
      (record.max_intensity ? ` · Intensidad máx.: ${record.max_intensity}/10` : '')
    : null;
  return joinParts([
    record.sleep_quality && `Sueño: ${record.sleep_quality}`,
    record.wake_mode && `Despertar: ${record.wake_mode}`,
    record.start_autonomy && `Inicio del día: ${record.start_autonomy}`,
    record.gi_status && `Digestión: ${record.gi_status}`,
    record.medication_adherence && `Medicación: ${record.medication_adherence}`,
    record.day_regulation_level && `Regulación del día: ${record.day_regulation_level}`,
    events,
  ]);
}

function summarizeEvent(event: DysregulationEvent & { severity?: string }): string | null {
  return joinParts([
    typeof event.intensity_value === 'number' && `Intensidad: ${event.intensity_value}/10`,
    event.severity && `Gravedad: ${SEVERITY_LABEL[event.severity] ?? event.severity}`,
  ]);
}

/** Confirms an observed outcome with a caller-generated replay identity. */
export function confirmPredictionOutcome(
  predictionId: string,
  actualOutcome: boolean,
  idempotencyKey: string,
): Promise<OutcomeConfirmation> {
  if (USING_MOCK) return mock.confirmPredictionOutcome(predictionId, actualOutcome, idempotencyKey);
  return request<OutcomeConfirmation>(`/api/v1/predictions/${predictionId}/outcome`, {
    method: 'POST',
    headers: getActorHeaders(),
    body: JSON.stringify({
      actual_outcome: actualOutcome,
      idempotency_key: idempotencyKey,
      provenance: { source: 'frontend_outcome', synthetic: false },
    }),
  });
}

export function simulateTelemetry(subjectId: string, profile: 'estable' | 'riesgo_acumulado' | 'datos_insuficientes'): Promise<{ status: string; stored_count: number; message: string }> {
  if (USING_MOCK) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'ok',
          stored_count: 50,
          message: 'Simulated burst for profile ' + profile,
        });
      }, 1500);
    });
  }
  
  return request<{ status: string; stored_count: number; message: string }>('/api/v1/telemetry/simulate', {
    method: 'POST',
    body: JSON.stringify({ subject_id: subjectId, profile, seed: Math.floor(Math.random() * 1000) }),
  });
}

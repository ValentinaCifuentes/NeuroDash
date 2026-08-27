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
  RiskLevel,
  SupportItem,
  Subject,
  TimelineEntry,
  TimelineResponse,
  ApiError,
  ApiErrorEnvelope,
  OutcomeConfirmation,
  SubjectListResponse,
  SubjectOnboardingInput,
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

export function getSessionActorHeaders(env: Record<string, string | undefined> = import.meta.env): {
  'X-Actor-Id': string;
  'X-Actor-Role': 'professional';
} {
  if (!env.VITE_ACTOR_ID || env.VITE_ACTOR_ROLE !== 'professional') {
    throw new Error('A professional actor must be configured to access sessions.');
  }
  return { 'X-Actor-Id': env.VITE_ACTOR_ID, 'X-Actor-Role': 'professional' };
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
  return request<Subject>('/api/v1/subjects', { method: 'POST', body: JSON.stringify(input) });
}

export function getTimeline(
  subjectId: string,
  asOf: string,
  days = 1,
): Promise<TimelineResponse> {
  if (USING_MOCK) return mock.getTimeline(subjectId, asOf, days);
  const qs = new URLSearchParams({ as_of: asOf, days: String(days) });
  return request<BackendTimelineEntry[]>(`/api/v1/subjects/${subjectId}/timeline?${qs}`).then((entries) => ({
    subject_id: subjectId,
    as_of: asOf,
    days,
    entries: entries.map(adaptTimelineEntry),
  }));
}

export function saveDailyRecord(record: DailyRecord): Promise<DailyRecord> {
  if (USING_MOCK) return mock.saveDailyRecord(record);
  return request<DailyRecord>(`/api/v1/subjects/${record.subject_id}/daily-records`, {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

export function saveEvent(event: DysregulationEvent): Promise<DysregulationEvent> {
  if (USING_MOCK) return mock.saveEvent(event);
  return request<DysregulationEvent>(`/api/v1/subjects/${event.subject_id}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export function getSessions(subjectId: string): Promise<ProfessionalSession[]> {
  if (USING_MOCK) return mock.getSessions(subjectId);
  return request<ProfessionalSessionDraft[]>(`/api/v1/subjects/${subjectId}/sessions`, {
    headers: getSessionActorHeaders(),
  }).then((sessions) => sessions.map(mapSessionProjection));
}

/** Creates a professional session using a stable, caller-provided replay identity. */
export function saveSession(session: ProfessionalSessionDraft): Promise<ProfessionalSession> {
  if (USING_MOCK) return mock.saveSession(session);
  const base = `/api/v1/subjects/${session.subject_id}/sessions`;
  const idempotencyKey = session.session_id ?? crypto.randomUUID();
  return request<ProfessionalSessionDraft>(base, {
    method: 'POST',
    headers: getSessionActorHeaders(),
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
      prediction_cutoff: req.as_of,
    }),
  }).then((prediction) => adaptPrediction(prediction, req));
}

type BackendSubject = Partial<Subject> & {
  subject_id: string;
  sensory_context?: Record<string, unknown>;
};

type BackendTimelineEntry = Record<string, unknown>;

type BackendPrediction = {
  contract_version: string;
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

function adaptTimelineEntry(entry: BackendTimelineEntry, index: number): TimelineEntry {
  const timestamp = String(entry.source_timestamp ?? entry.availability_timestamp ?? new Date().toISOString());
  const kind = 'event_count' in entry ? 'daily_record' : 'event';
  return {
    entry_id: String(entry.id ?? `entry-${index}`),
    kind,
    timestamp,
    title: kind === 'daily_record' ? 'Registro diario' : 'Evento registrado',
    detail: summarizeTimelineEntry(entry),
    semantic: kind === 'daily_record' ? 'info' : 'warning',
    payload: entry as unknown as DailyRecord | DysregulationEvent,
  };
}

function adaptPrediction(prediction: BackendPrediction, req: PredictionRequest): Prediction {
  return {
    contract_version: '2.0',
    prediction_id: `${prediction.subject_id}-${prediction.prediction_cutoff}`,
    subject_id: prediction.subject_id,
    as_of: prediction.prediction_cutoff,
    horizon: req.horizon,
    risk_level: adaptRisk(prediction.risk),
    model_score: prediction.model_score ?? 0,
    model_version: prediction.versions.model_version ?? 'none',
    model_family: 'backend-core',
    confidence_level: adaptConfidence(prediction.confidence),
    abstain: prediction.abstained,
    abstention_reason: prediction.abstained ? 'insufficient_context' : null,
    factors: prediction.factors.map(adaptFactor),
    missing: prediction.missingness.filter((item) => item.missing).map(adaptMissingness),
    priority_data_request: buildPriorityDataRequest(prediction.missingness),
    support: prediction.supports.map(adaptSupport),
    data_provenance: {
      contains_synthetic_data: Boolean(prediction.provenance.lineage),
      origins: prediction.provenance.excluded_from_core ? ['backend_core', 'school_records_excluded'] : ['backend_core'],
    },
    technical_metadata: {
      engine: 'backend-core',
      training_strategy_version: prediction.versions.policy_hash ?? 'default',
      explainer: prediction.factors.length > 0 ? 'backend_explainer' : null,
      confidence_ruleset_version: prediction.versions.policy_hash ?? 'default',
      feature_schema_version: prediction.versions.code_version ?? '0.1.0',
    },
  };
}

function adaptRisk(risk: string | null): RiskLevel {
  if (risk === 'ELEVATED' || risk === 'MODERATE' || risk === 'LOW') return risk;
  return 'LOW';
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

function buildPriorityDataRequest(missingness: BackendMissingness[]): string | null {
  const missing = missingness.find((item) => item.missing);
  if (!missing?.field) return null;
  return `Completar ${humanize(String(missing.field)).toLowerCase()} mejora la contextualización.`;
}

function inferWindow(value: string): string {
  if (value.includes('catorce')) return '14d';
  if (value.includes('siete')) return '7d';
  if (value.includes('tres')) return '3d';
  if (value.includes('ultimo') || value.includes('último')) return '1d';
  return 'actual';
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

function summarizeTimelineEntry(entry: BackendTimelineEntry): string | null {
  const parts = [
    entry.sleep_quality !== undefined ? `Sueño: ${entry.sleep_quality}` : null,
    entry.wake_state !== undefined ? `Despertar: ${entry.wake_state}` : null,
    entry.event_count !== undefined ? `Eventos: ${entry.event_count}` : null,
    entry.severity !== undefined ? `Severidad: ${entry.severity}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
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
    headers: getSessionActorHeaders(),
    body: JSON.stringify({
      actual_outcome: actualOutcome,
      idempotency_key: idempotencyKey,
      provenance: { source: 'frontend_outcome', synthetic: false },
    }),
  });
}

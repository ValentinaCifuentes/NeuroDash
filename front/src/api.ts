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
  DailyRecord,
  DysregulationEvent,
  Prediction,
  PredictionRequest,
  ProfessionalSession,
  Subject,
  TimelineResponse,
  ApiError,
  ApiErrorEnvelope,
  PredictionAdapterResponse,
  PredictionView,
  SubjectListResponse,
  SubjectOnboardingInput,
} from './types';
import * as mock from './mocks/mockApi';

const BASE = import.meta.env.VITE_API_BASE ?? '';
export const USING_MOCK = BASE === '';

export function mapApiError(status: number, envelope: ApiErrorEnvelope): ApiError {
  return { status, code: envelope.code, message: envelope.message };
}

export function mapPredictionResponse(prediction: PredictionAdapterResponse): PredictionView {
  return {
    prediction_id: prediction.prediction_id,
    subject_id: prediction.subject_id,
    risk_level: prediction.risk_level,
    confidence_level: prediction.confidence_level,
    abstain: prediction.abstain,
    abstention_reason: prediction.abstention_reason,
    synthetic: prediction.data_provenance.contains_synthetic_data,
    provenance: prediction.data_provenance.origins,
  };
}

export function createSubjectId(displayName: string): string {
  const subjectId = displayName
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (!subjectId) throw new Error('A subject name is required');
  return subjectId;
}

export function subjectInitials(displayName: string): string {
  return displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
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
  return request<Subject>(`/api/v1/subjects/${subjectId}`);
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
  return request<TimelineResponse>(`/api/v1/subjects/${subjectId}/timeline?${qs}`);
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
  return request<ProfessionalSession[]>(`/api/v1/subjects/${subjectId}/sessions`);
}

/** Crea o actualiza según traiga `session_id`. */
export function saveSession(session: ProfessionalSession): Promise<ProfessionalSession> {
  if (USING_MOCK) return mock.saveSession(session);
  const base = `/api/v1/subjects/${session.subject_id}/sessions`;
  return request<ProfessionalSession>(
    session.session_id ? `${base}/${session.session_id}` : base,
    { method: session.session_id ? 'PUT' : 'POST', body: JSON.stringify(session) },
  );
}

/**
 * El cliente nunca manda features calculadas (Arquitectura §5.3).
 * Solo sujeto, momento de corte y horizonte.
 */
export function getPrediction(req: PredictionRequest): Promise<Prediction> {
  if (USING_MOCK) return mock.getPrediction(req);
  return request<Prediction>('/api/v1/predictions', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

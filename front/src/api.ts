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
  Subject,
  TimelineResponse,
  ApiError,
} from './types';
import * as mock from './mocks/mockApi';

const BASE = import.meta.env.VITE_API_BASE ?? '';
export const USING_MOCK = BASE === '';

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
    throw {
      status: res.status,
      code: body.code ?? 'unknown_error',
      message: body.message ?? 'No se pudo completar la acción. Inténtalo otra vez.',
    } satisfies ApiError;
  }

  return (await res.json()) as T;
}

export function getSubject(subjectId: string): Promise<Subject> {
  if (USING_MOCK) return mock.getSubject(subjectId);
  return request<Subject>(`/api/v1/subjects/${subjectId}`);
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

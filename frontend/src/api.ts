import { PredictionContractV2 } from "./types";

export interface SubjectProfile {
  subject_id: string;
  timezone: string;
  sensory_context: Record<string, any>;
  habitual_context: Record<string, any>;
  historical_supports: Array<Record<string, any>>;
}

export interface OnboardResponse {
  subject_id: string;
  timezone: string;
  cold_start: boolean;
  provisional_baseline: Record<string, any>;
}

export interface TimelineRecord {
  source_timestamp: string;
  availability_timestamp: string;
  record_type: string;
  value: any;
  [key: string]: any;
}

export interface RetrainResponse {
  promoted: boolean;
  audit_record: Record<string, any>;
}

const BASE_URL = "";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  async onboardSubject(req: {
    subject_id: string;
    timezone: string;
    sensory_context?: Record<string, any>;
    habitual_context?: Record<string, any>;
    historical_supports?: Array<Record<string, any>>;
  }): Promise<OnboardResponse> {
    const res = await fetch(`${BASE_URL}/api/v1/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    return handleResponse<OnboardResponse>(res);
  },

  async getSubject(subjectId: string): Promise<SubjectProfile> {
    const res = await fetch(`${BASE_URL}/api/v1/subjects/${encodeURIComponent(subjectId)}`);
    return handleResponse<SubjectProfile>(res);
  },

  async getTimeline(
    subjectId: string,
    asOf: string,
    days: number = 7
  ): Promise<TimelineRecord[]> {
    const query = new URLSearchParams({ as_of: asOf, days: String(days) }).toString();
    const res = await fetch(
      `${BASE_URL}/api/v1/subjects/${encodeURIComponent(subjectId)}/timeline?${query}`
    );
    return handleResponse<TimelineRecord[]>(res);
  },

  async createPrediction(req: {
    subject_id: string;
    prediction_cutoff: string;
    school_records?: Array<Record<string, any>> | null;
  }): Promise<PredictionContractV2> {
    const res = await fetch(`${BASE_URL}/api/v1/predictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    return handleResponse<PredictionContractV2>(res);
  },

  async confirmOutcome(
    predictionId: string,
    req: { actual_outcome: boolean }
  ): Promise<{ status: string; message: string }> {
    const res = await fetch(
      `${BASE_URL}/api/v1/predictions/${encodeURIComponent(predictionId)}/outcome`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }
    );
    return handleResponse<{ status: string; message: string }>(res);
  },

  async demoPredict(
    subjectId: string,
    req: { prediction_cutoff: string }
  ): Promise<PredictionContractV2> {
    const res = await fetch(
      `${BASE_URL}/api/v1/demo/profiles/${encodeURIComponent(subjectId)}/predict`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }
    );
    return handleResponse<PredictionContractV2>(res);
  },

  async demoRetrain(subjectId: string): Promise<RetrainResponse> {
    const res = await fetch(
      `${BASE_URL}/api/v1/demo/profiles/${encodeURIComponent(subjectId)}/retrain`,
      {
        method: "POST",
      }
    );
    return handleResponse<RetrainResponse>(res);
  },
};

import { describe, expect, it } from 'vitest';

import { mapApiError, mapPredictionResponse } from './api';
import { getPrediction } from './mocks/mockApi';

describe('contract adapter', () => {
  it('keeps risk, confidence, and provenance while omitting model score', () => {
    const view = mapPredictionResponse({
      contract_version: '2.0',
      prediction_id: 'prediction-1',
      subject_id: 'subject-1',
      as_of: '2026-08-26T12:00:00Z',
      horizon: 'next_24h',
      risk_level: 'ELEVATED',
      confidence_level: 'LOW',
      abstain: false,
      abstention_reason: null,
      data_provenance: { contains_synthetic_data: false, origins: ['care_api'] },
      model_score: 0.89,
    });

    expect(view).toEqual({
      prediction_id: 'prediction-1',
      subject_id: 'subject-1',
      risk_level: 'ELEVATED',
      confidence_level: 'LOW',
      abstain: false,
      abstention_reason: null,
      synthetic: false,
      provenance: ['care_api'],
    });
  });

  it('maps a stable error envelope without exposing unknown details', () => {
    expect(mapApiError(422, {
      code: 'validation_error',
      message: 'Request validation failed.',
      details: { occurred_at: 'timezone-aware' },
    })).toEqual({ status: 422, code: 'validation_error', message: 'Request validation failed.' });
  });

  it('maps synthetic mock responses through the same safe view contract', async () => {
    const prediction = await getPrediction({
      subject_id: 'PAC-002',
      as_of: '2026-08-26T12:00:00Z',
      horizon: 'next_24h',
    });

    expect(mapPredictionResponse(prediction)).toMatchObject({
      risk_level: 'LOW',
      confidence_level: 'INSUFFICIENT',
      abstain: true,
      synthetic: true,
      provenance: ['ui_fixture', 'BLUBA_CSV_schema'],
    });
  });
});

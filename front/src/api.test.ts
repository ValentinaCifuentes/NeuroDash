import { describe, expect, it } from 'vitest';

import { mapApiError } from './api';
import { getPrediction } from './mocks/mockApi';

describe('contract adapter', () => {
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
      prediction_cutoff: '2026-08-26T12:00:00Z',
    });

    expect(prediction).toMatchObject({ risk: null, confidence: 'INSUFFICIENT', abstained: true });
    expect(prediction).not.toHaveProperty('model_score');
  });
});

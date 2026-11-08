import { describe, expect, it } from 'vitest';

import { mapApiError } from './api';

describe('contract adapter', () => {
  it('maps a stable error envelope without exposing unknown details', () => {
    expect(mapApiError(422, {
      code: 'validation_error',
      message: 'Request validation failed.',
      details: { occurred_at: 'timezone-aware' },
    })).toEqual({ status: 422, code: 'validation_error', message: 'Request validation failed.' });
  });
});

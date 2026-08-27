import { describe, expect, it } from 'vitest';

import { createSessionWrite, getSessionActorHeaders, mapSessionProjection } from './api';
import type { ProfessionalSession } from './types';

const session: ProfessionalSession = {
  session_id: 'session-1',
  subject_id: 'subject-1',
  occurred_at: '2026-08-26T10:00:00-04:00',
  professional: 'Dr. Rivera',
  consultation_reason: 'Control',
  modality: 'Presencial',
  duration_minutes: 45,
  attendance: 'Presente',
  paid: false,
  status: 'Atendida',
  alert_level: 'Medio',
  objectives: 'Practice transitions',
  activities: null,
  observations: 'Shared observation',
  visible_to_tutor: true,
  active: true,
};

describe('session transport adapter', () => {
  it('redacts internal notes from a server projection while retaining shared fields', () => {
    expect(mapSessionProjection({ ...session, internal_notes: 'Private clinical note' })).toEqual(session);
  });

  it('creates a replay-safe professional write that retains private notes only for the server', () => {
    const write = createSessionWrite({ ...session, internal_notes: 'Private clinical note' }, 'request-1');

    expect(write).toMatchObject({
      contract_version: '2.0',
      idempotency_key: 'request-1',
      provenance: { source: 'frontend_session', synthetic: false },
      professional: 'Dr. Rivera',
      internal_notes: 'Private clinical note',
    });
    expect(write).not.toHaveProperty('session_id');
  });

  it('sends the configured professional actor context at the server trust boundary', () => {
    expect(getSessionActorHeaders({ VITE_ACTOR_ID: 'professional-1', VITE_ACTOR_ROLE: 'professional' }))
      .toEqual({ 'X-Actor-Id': 'professional-1', 'X-Actor-Role': 'professional' });
  });
});

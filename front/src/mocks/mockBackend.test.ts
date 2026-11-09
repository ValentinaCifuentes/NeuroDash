import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shiftIsoDate } from './mockBackend';

/** `api.ts` en modo sin servidor: mismas funciones y adaptadores que contra FastAPI. */
async function mockApi() {
  vi.stubEnv('VITE_API_BASE', '');
  vi.resetModules();
  const api = await import('../api');
  (await import('./mockBackend')).resetMockBackend();
  return api;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 11, 10, 9, 0)); // 10 dic: un mes después del fixture
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('mock backend (I9)', () => {
  it('lists the three demos with their profile, like the real backend', async () => {
    const api = await mockApi();

    const subjects = await api.listSubjects();
    const pacA = await api.getSubject('PAC-A');

    expect(subjects.map((subject) => subject.subject_id)).toEqual(['PAC-A', 'PAC-B', 'PAC-C']);
    expect(subjects.every((subject) => subject.provenance?.synthetic)).toBe(true);
    expect(pacA.habitual_context).toMatchObject({ age_range: '6 a 8 años', neurodivergence: 'TEA' });
  });

  it('shows the same states as the real demo, with the 8 h horizon from the contract', async () => {
    const api = await mockApi();
    const cutoff = new Date().toISOString();

    const [a, b, c] = await Promise.all(
      ['PAC-A', 'PAC-B', 'PAC-C'].map((subject_id) => api.getPrediction({ subject_id, prediction_cutoff: cutoff })),
    );

    // PAC-A abre en moderado: su Mi Día de hoy (07:45) trae una mala noche.
    expect([a.risk, b.risk, c.risk]).toEqual(['MODERATE', 'LOW', null]);
    expect(c.abstained).toBe(true);
    expect(a.horizon_hours).toBe(8);
    expect(a.factors.some((factor) => factor.summary?.includes('que de costumbre'))).toBe(true);
  });

  it('moves the history so the demo always ends yesterday', async () => {
    const api = await mockApi();

    const { entries } = await api.getTimeline('PAC-A', new Date().toISOString(), 2);

    expect(entries.some((entry) => entry.kind === 'daily_record' && entry.timestamp.startsWith('2026-12-09'))).toBe(true);
  });

  it('keeps what the tutor writes, as text in raw, and reuses the retry key', async () => {
    const api = await mockApi();
    const record = {
      subject_id: 'PAC-B', date: '2026-12-10', sleep_quality: 'Interrumpido' as const, wake_mode: 'Cansado/Con Sueño' as const,
      start_autonomy: null, medication_adherence: null, gi_status: null, idempotency_key: 'same-key',
    };

    await api.saveDailyRecord(record);
    await api.saveDailyRecord(record);
    const { entries } = await api.getTimeline('PAC-B', new Date().toISOString(), 1);

    // La ventana de 24 h también trae el registro demo de ayer y el Mi Día demo de esta mañana.
    const today = entries.filter(
      (entry) => entry.kind === 'daily_record' && entry.timestamp.startsWith('2026-12-10')
        && 'sleep_quality' in entry.payload && entry.payload.sleep_quality === 'Interrumpido',
    );
    expect(today).toHaveLength(1);
    expect(today[0].payload).toMatchObject({ sleep_quality: 'Interrumpido', wake_mode: 'Cansado/Con Sueño', medication_adherence: null });
  });

  it('starts a new subject without an estimate but with the supports from its profile', async () => {
    const api = await mockApi();

    const tomi = await api.onboardSubject({
      display_name: 'Tomi', timezone: 'America/Santiago', baseline: {},
      provenance: { source: 'caregiver_onboarding', synthetic: false },
      historical_supports: [{ id: 'sup_x', description: 'Espacio seguro', type: 'historical', effective: true }],
    });
    const prediction = await api.getPrediction({ subject_id: tomi.subject_id, prediction_cutoff: new Date().toISOString() });

    expect(prediction.abstained).toBe(true);
    expect(prediction.supports.filter((item) => item.source === 'historical_support').map((item) => item.label)).toEqual(['Espacio seguro']);
  });

  it('remembers a strategy that worked, as the backend does', async () => {
    const api = await mockApi();

    await api.saveEvent({
      subject_id: 'PAC-C', occurred_at: new Date().toISOString(), event_type: 'Desregulación Emocional',
      intensity_band: 'Moderada (4-7)', intensity_value: 6, trigger: null, strategy_applied: ['Audífonos'], support_used: null,
      strategy_outcome: 'Regulación Exitosa', qualitative_outcome: null, sensory_activity: null, notes: null, quick_capture: false,
    });
    const prediction = await api.getPrediction({ subject_id: 'PAC-C', prediction_cutoff: new Date().toISOString() });

    expect(prediction.supports.map((item) => item.label)).toContain('Audífonos');
  });

  it('answers unknown subjects with the same error the screens already handle', async () => {
    const api = await mockApi();

    await expect(api.getSubject('nadie')).rejects.toMatchObject({ status: 404, code: 'subject_not_found' });
  });

  it('keeps planned events and returns them like the backend', async () => {
    const api = await mockApi();

    await api.savePlannedEvent({
      subject_id: 'PAC-B', title: 'Cita médica', starts_at: new Date().toISOString(),
      category: 'Salud', expectation: 'Estresante',
    });

    const listed = await api.listPlannedEvents('PAC-B');
    expect(listed.some((item) => item.title === 'Cita médica' && item.expectation === 'Estresante')).toBe(true);
  });
});

describe('shiftIsoDate', () => {
  it('moves the day and keeps the written time and offset', () => {
    expect(shiftIsoDate('2026-11-02T12:00:00-03:00', 38)).toBe('2026-12-10T12:00:00-03:00');
    expect(shiftIsoDate('2026-12-30', 3)).toBe('2027-01-02');
    expect(shiftIsoDate('Interrumpido', 3)).toBe('Interrumpido');
  });
});

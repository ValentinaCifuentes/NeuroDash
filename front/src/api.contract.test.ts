import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adaptTimelineResponse,
  buildDailyRecordWrite,
  buildEventWrite,
  getActorHeaders,
  toLocalIsoString,
  adaptPrediction,
  type BackendPrediction,
  type BackendTimelineResponse,
} from './api';
import PREDICTION_FIXTURE from './test/fixtures/prediction-contract.json';
import type { DailyRecord, DysregulationEvent } from './types';

/** Forma real de `GET /subjects/{id}/timeline` (`routes/subjects.py › get_subject_timeline`). */
const TIMELINE_FIXTURE: BackendTimelineResponse = {
  subject_id: 'pac-real',
  as_of: '2026-11-02T20:00:00+00:00',
  days: 1,
  entries: [
    {
      entry_id: 'evt-1',
      kind: 'event',
      timestamp: '2026-11-02T15:30:00+00:00',
      title: 'Desregulación Emocional',
      detail: null,
      semantic: 'neutral',
      payload: {
        event_id: 'evt-1',
        event_type: 'Desregulación Emocional',
        intensity_value: 6,
        severity: 'moderate',
        source_timestamp: '2026-11-02T15:30:00+00:00',
      },
    },
    {
      entry_id: 'rec-1',
      kind: 'daily_record',
      timestamp: '2026-11-02T11:00:00+00:00',
      title: 'Daily record',
      detail: null,
      semantic: 'neutral',
      payload: {
        record_id: 'rec-1',
        date: '2026-11-02',
        sleep_quality: 8,
        wake_state: 2,
        event_count: 1,
        dysregulation_count: 1,
        max_intensity: 6,
        raw: { sleep_quality: 'Reparador', wake_mode: 'Tranquilo/Alegre' },
      },
    },
  ],
};

describe('timeline contract (I1, I6)', () => {
  it('reads the entries from the response envelope', () => {
    const timeline = adaptTimelineResponse(TIMELINE_FIXTURE);

    expect(timeline).toMatchObject({ subject_id: 'pac-real', days: 1 });
    expect(timeline.entries.map((entry) => entry.entry_id)).toEqual(['evt-1', 'rec-1']);
  });

  it('uses the kind sent by the backend even when a daily record carries event counts', () => {
    const [event, record] = adaptTimelineResponse(TIMELINE_FIXTURE).entries;

    expect(event).toMatchObject({ kind: 'event', title: 'Desregulación Emocional' });
    expect(record).toMatchObject({ kind: 'daily_record', title: 'Registro diario' });
    expect(record.payload).toMatchObject({ record_id: 'rec-1', event_count: 1 });
  });
});

describe('timeline readable texts (I8)', () => {
  it('rebuilds the daily record with the texts the tutor chose, not the model numbers', () => {
    const [, record] = adaptTimelineResponse(TIMELINE_FIXTURE).entries;

    expect(record.payload).toMatchObject({
      sleep_quality: 'Reparador',
      wake_mode: 'Tranquilo/Alegre',
      start_autonomy: null,
      dysregulation_count: 1,
      max_intensity: 6,
    });
    expect(record.detail).toBe(
      'Sueño: Reparador · Despertar: Tranquilo/Alegre · Eventos del día: 1 (1 de desregulación) · Intensidad máx.: 6/10',
    );
    expect(record.detail).not.toContain('Sueño: 8');
  });

  it('titles a confirmed crisis (no event_type) with the title the backend sends', () => {
    const timeline = adaptTimelineResponse({
      ...TIMELINE_FIXTURE,
      // Forma real: ocurrencia que crea record_prediction_outcome (ml/promotion.py).
      entries: [{
        entry_id: 'occ_pred-1', kind: 'event', timestamp: '2026-11-02T16:00:00+00:00',
        title: 'Crisis confirmada', detail: null, semantic: 'neutral',
        payload: {
          id: 'occ_pred-1', subject_id: 'PAC-A', severity: 'moderate',
          source_timestamp: '2026-11-02T16:00:00+00:00', availability_timestamp: '2026-11-02T16:00:00+00:00',
        },
      }],
    });

    expect(timeline.entries[0]).toMatchObject({ title: 'Crisis confirmada', detail: 'Gravedad: moderada' });
  });

  it('summarizes an event with its intensity and severity in Spanish', () => {
    const [event] = adaptTimelineResponse(TIMELINE_FIXTURE).entries;

    expect(event.detail).toBe('Intensidad: 6/10 · Gravedad: moderada');
  });

  it('leaves a counts-only record (created by the backend for an event) without basal texts', () => {
    const timeline = adaptTimelineResponse({
      ...TIMELINE_FIXTURE,
      entries: [{
        ...TIMELINE_FIXTURE.entries[1],
        payload: { record_id: 'rec-2', date: '2026-11-02', event_count: 2, dysregulation_count: 0, max_intensity: 3 },
      }],
    });

    expect(timeline.entries[0].payload).toMatchObject({ sleep_quality: null, wake_mode: null });
    expect(timeline.entries[0].detail).toBe('Eventos del día: 2 · Intensidad máx.: 3/10');
  });
});

describe('care write payloads (I2)', () => {
  const record: DailyRecord = {
    subject_id: 'pac-real',
    date: '2026-11-02',
    sleep_quality: 'Reparador',
    wake_mode: 'Cansado/Con Sueño',
    start_autonomy: 'Con alarma',
    medication_adherence: 'No Aplica',
    gi_status: 'Normal',
  };

  const event: DysregulationEvent = {
    event_id: 'local-1',
    subject_id: 'pac-real',
    occurred_at: '2026-11-02T18:30:00.000Z',
    event_type: 'Desregulación Emocional',
    intensity_band: 'Moderada (4-7)',
    intensity_value: 6,
    trigger: ['Ruidos'],
    strategy_applied: null,
    support_used: null,
    strategy_outcome: null,
    qualitative_outcome: null,
    sensory_activity: null,
    notes: null,
    quick_capture: false,
  };

  it('formats timestamps with the local offset so the backend keeps the local day', () => {
    const date = new Date(2026, 10, 2, 22, 15, 0);
    const iso = toLocalIsoString(date);

    expect(iso).toMatch(/^2026-11-02T22:15:00[+-]\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(date.getTime());
  });

  it('sends the fields CareRecordWrite requires plus the Bitácora texts', () => {
    const body = buildDailyRecordWrite(record, new Date(2026, 10, 2, 8, 0, 0), 'key-1');

    expect(body).toEqual({
      occurred_at: toLocalIsoString(new Date(2026, 10, 2, 8, 0, 0)),
      idempotency_key: 'key-1',
      provenance: { source: 'tutor_app', synthetic: false },
      sleep_quality: 'Reparador',
      wake_mode: 'Cansado/Con Sueño',
      start_autonomy: 'Con alarma',
      medication_adherence: 'No Aplica',
      gi_status: 'Normal',
      day_regulation_level: null,
      sleep_hours_range: null,
      early_signs: null,
      physical_discomfort: null,
      routine_change: null,
      school_attendance: null,
    });
  });

  it('sends the day context and leaves unanswered questions as null', () => {
    const body = buildDailyRecordWrite(
      { ...record, sleep_hours_range: '7 a 9 h', early_signs: ['Ninguna'], physical_discomfort: [], routine_change: 'Visita' },
      undefined,
      'key-ctx',
    );

    expect(body).toMatchObject({
      sleep_hours_range: '7 a 9 h',
      early_signs: ['Ninguna'],
      physical_discomfort: null,
      routine_change: 'Visita',
      school_attendance: null,
    });
  });

  it('reuses the record key so a retried save is not duplicated', () => {
    const body = buildDailyRecordWrite({ ...record, idempotency_key: 'kept' });

    expect(body.idempotency_key).toBe('kept');
  });

  it('generates a fresh idempotency key for each write when none is given', () => {
    const first = buildDailyRecordWrite(record);
    const second = buildDailyRecordWrite(record);

    expect(first.idempotency_key).toBeTruthy();
    expect(first.idempotency_key).not.toBe(second.idempotency_key);
  });

  it('sends the event with the fields EventWrite requires and keeps the same instant', () => {
    const body = buildEventWrite(event, 'key-2');

    expect(body).toMatchObject({
      idempotency_key: 'key-2',
      provenance: { source: 'tutor_app', synthetic: false },
      event_type: 'Desregulación Emocional',
      intensity_value: 6,
      trigger: ['Ruidos'],
    });
    expect(new Date(body.occurred_at).toISOString()).toBe(event.occurred_at);
    expect(body).not.toHaveProperty('subject_id');
    expect(body).not.toHaveProperty('event_id');
  });

  it('reuses the event key so a retried event is not counted twice (P2)', () => {
    expect(buildEventWrite({ ...event, idempotency_key: 'kept-evt' }).idempotency_key).toBe('kept-evt');
  });
});

describe('actor headers (I3, I4)', () => {
  it('defaults to the fixed demo tutor when nothing is configured', () => {
    expect(getActorHeaders({})).toEqual({ 'X-Actor-Id': 'tutor-demo', 'X-Actor-Role': 'tutor' });
  });

  it('uses the configured actor', () => {
    expect(getActorHeaders({ VITE_ACTOR_ID: 'tutor-7', VITE_ACTOR_ROLE: 'system' }))
      .toEqual({ 'X-Actor-Id': 'tutor-7', 'X-Actor-Role': 'system' });
  });

  it('rejects a role the backend would refuse', () => {
    expect(() => getActorHeaders({ VITE_ACTOR_ROLE: 'professional' })).toThrow('VITE_ACTOR_ROLE');
  });
});

describe('requests against the real API carry the tutor actor (I3, I4)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function loadRealApi() {
    vi.stubEnv('VITE_API_BASE', 'http://api.test');
    vi.stubEnv('VITE_ACTOR_ID', 'tutor-7');
    vi.stubEnv('VITE_ACTOR_ROLE', 'tutor');
    // Cuerpo mínimo válido para cualquier escritura (la creación de perfil devuelve al menos subject_id).
    const fetchMock = vi.fn(async () => new Response('{"subject_id":"alex"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const api = await import('./api');
    expect(api.USING_MOCK).toBe(false);
    const call = (i: number) => {
      const [url, init] = fetchMock.mock.calls[i] as unknown as [string, RequestInit];
      return { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    };
    return { api, call };
  }

  const tutorHeaders = { 'X-Actor-Id': 'tutor-7', 'X-Actor-Role': 'tutor' };

  it('sends the actor when saving a daily record, an event and an outcome', async () => {
    const { api, call } = await loadRealApi();

    await api.saveDailyRecord({
      subject_id: 'pac-real', date: '2026-11-02', sleep_quality: 'Reparador', wake_mode: null,
      start_autonomy: null, medication_adherence: 'Sí', gi_status: 'Normal',
    });
    await api.saveEvent({
      subject_id: 'pac-real', occurred_at: '2026-11-02T18:30:00.000Z', event_type: 'Alimentación',
      intensity_band: 'Leve (1-3)', intensity_value: 2, trigger: null, strategy_applied: null, support_used: null,
      strategy_outcome: null, qualitative_outcome: 'Adecuada', sensory_activity: null, notes: null,
      quick_capture: true,
    });
    await api.confirmPredictionOutcome('pred-1', true, 'key-3');

    expect(call(0).url).toBe('http://api.test/api/v1/subjects/pac-real/daily-records');
    expect(call(1).url).toBe('http://api.test/api/v1/subjects/pac-real/events');
    expect(call(2).url).toBe('http://api.test/api/v1/predictions/pred-1/outcome');
    for (const i of [0, 1, 2]) expect(call(i).headers).toMatchObject(tutorHeaders);
  });

  it('authorizes the creating tutor on a new subject', async () => {
    const { api, call } = await loadRealApi();

    await api.onboardSubject({
      display_name: 'Alex', timezone: 'America/Santiago', baseline: {},
      provenance: { source: 'caregiver_onboarding', synthetic: false },
    });

    expect(call(0).body.authorized_tutor_ids).toEqual(['tutor-7']);
  });
});

describe('prediction id round trip (I4)', () => {
  const contract = {
    contract_version: '2',
    prediction_id: '3f2a9c0d4b7e4e1f9a6b2c8d0e1f2a3b',
    subject_id: 'PAC-A',
    prediction_cutoff: '2026-11-02T12:00:00+00:00',
    horizon_hours: 8,
    risk: 'ELEVATED',
    model_score: 0.71,
    confidence: 'MEDIUM',
    abstained: false,
    factors: [],
    missingness: [],
    supports: [],
    provenance: {},
    versions: { model_version: '1' },
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('keeps the id generated by the backend instead of building one', async () => {
    const { adaptPrediction } = await import('./api');

    expect(adaptPrediction(contract).prediction_id).toBe('3f2a9c0d4b7e4e1f9a6b2c8d0e1f2a3b');
  });

  it('confirms the outcome against the same prediction the backend stored', async () => {
    vi.stubEnv('VITE_API_BASE', 'http://api.test');
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/predictions') ? contract : {}), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const api = await import('./api');

    const prediction = await api.getPrediction({ subject_id: 'PAC-A', prediction_cutoff: contract.prediction_cutoff });
    await api.confirmPredictionOutcome(prediction.prediction_id, true, 'key-4');

    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://api.test/api/v1/predictions/3f2a9c0d4b7e4e1f9a6b2c8d0e1f2a3b/outcome',
    );
  });
});

describe('factors and missingness from a real engine contract (I7)', () => {
  // Generado con `python scripts/export_contract_fixture.py`: predicción real de PAC-A
  // con los factores de todas las familias de variables que nombra el motor.
  const fixture = PREDICTION_FIXTURE as unknown as BackendPrediction;

  it('maps every factor to a readable Spanish label, its variable code and a direction', () => {
    const prediction = adaptPrediction(fixture);

    expect(prediction.factors).toHaveLength(fixture.factors.length);
    for (const factor of prediction.factors) {
      expect(factor.label).not.toBe('Factor observado');
      expect(factor.label).not.toMatch(/_/);
      expect(factor.code).toMatch(/^[a-z_]+$/);
      expect(factor.comparison).toMatch(/^La variable reciente /);
    }
    expect(new Set(prediction.factors.map((factor) => factor.direction))).toEqual(new Set(['up', 'down']));
  });

  it('covers the new variable families of the encoded Bitácora and events', () => {
    const codes = adaptPrediction(fixture).factors.map((factor) => factor.code);

    for (const family of ['autonomia_inicio_dia', 'medicacion', 'digestion', 'regulacion_dia', 'desregulaciones', 'intensidad_maxima']) {
      expect(codes.some((code) => code.includes(family))).toBe(true);
    }
  });

  it('infers the window from the variable name, including the one-day window', () => {
    const windowOf = (code: string) => adaptPrediction(fixture).factors.find((factor) => factor.code === code)?.window;

    expect(windowOf('calidad_sueno_promedio_un_dia')).toBe('1d');
    expect(windowOf('conteo_registros_dos_dias')).toBe('2d');
    expect(windowOf('intensidad_maxima_promedio_tres_dias')).toBe('3d');
    expect(windowOf('desregulaciones_promedio_siete_dias')).toBe('7d');
    expect(windowOf('estado_despertar_promedio_catorce_dias')).toBe('14d');
    expect(windowOf('desviacion_digestion_linea_base')).toBe('actual');
  });

  it('reads the missingness keys the engine sends and keeps only the missing ones', () => {
    for (const item of fixture.missingness) {
      expect(Object.keys(item).sort()).toEqual(['field', 'missing', 'window']);
    }
    const withGap = {
      ...fixture,
      missingness: [...fixture.missingness, { window: 7, field: 'sleep_quality', missing: true }],
    };

    const missing = adaptPrediction(withGap).missingness;

    expect(missing.map((item) => item.code)).toContain('sleep_quality');
  });

  it('shows each missing field once, in Spanish, with its widest gap (P10)', () => {
    const gaps = [1, 3, 7].map((window) => ({ window, field: 'sleep_quality', missing: true }));
    const prediction = adaptPrediction({
      ...fixture,
      missingness: [...gaps, { window: 14, field: 'sleep_quality', missing: false }],
    });

    expect(prediction.missingness).toEqual([{
      code: 'sleep_quality',
      label: 'Calidad del sueño',
      impact: 'Sin registros en los últimos 7 días. Cuenta para la confianza de la estimación.',
      is_core: true,
    }]);
  });

  it('lists the fields that count for confidence first and marks the optional ones', () => {
    const prediction = adaptPrediction({
      ...fixture,
      missingness: [
        { window: 1, field: 'medication_taken', missing: true },
        { window: 1, field: 'wake_state', missing: true },
        { window: 3, field: 'new_engine_field', missing: true },
      ],
    });

    expect(prediction.missingness.map((item) => [item.label, item.is_core])).toEqual([
      ['Estado al despertar', true],
      ['Medicación', false],
      ['New engine field', false],
    ]);
    expect(prediction.missingness[1].impact).toBe(
      'Sin registros en el último día. Es opcional: ayuda a la lectura, pero no baja la confianza.',
    );
  });

  it('has a Spanish label for every field the engine reports', () => {
    const labels = adaptPrediction({
      ...fixture,
      missingness: fixture.missingness.map((item) => ({ ...item, missing: true })),
    }).missingness.map((item) => item.label);

    expect(labels).toHaveLength(new Set(fixture.missingness.map((item) => item.field)).size);
    for (const label of labels) expect(label).not.toMatch(/_|^[A-Z][a-z]+ [A-Z]/);
  });

  it('keeps the contract fields the screens rely on', () => {
    const prediction = adaptPrediction(fixture);

    expect(prediction).toMatchObject({ subject_id: 'PAC-A', horizon_hours: 8, abstained: false });
    expect(prediction.risk).not.toBeNull();
    expect(prediction.supports.every((support) => support.label && support.support_id)).toBe(true);
  });
});

describe('subject list from the real API (Fase 1 · paso 9)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('fills the profile fields the screens read, which the selection list does not send', async () => {
    vi.stubEnv('VITE_API_BASE', 'http://api.test');
    // Forma real de `GET /subjects` (`OnboardSubjectResponse`): sin edad, diagnóstico ni perfil sensorial.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      contract_version: '2.0',
      subjects: [{
        contract_version: '2.0', subject_id: 'PAC-A', display_name: 'PAC-A', initials: 'P',
        timezone: 'America/New_York', cold_start: true, provisional_baseline: {},
        provenance: { source: 'synthetic_demo', synthetic: true },
      }],
    }), { status: 200 })));
    vi.resetModules();
    const api = await import('./api');

    const [subject] = await api.listSubjects();

    expect(subject).toMatchObject({
      subject_id: 'PAC-A',
      age_range: 'Edad no registrada',
      diagnosis: expect.any(String),
      sensory_profile: expect.any(String),
      timezone: 'America/New_York',
      provenance: { synthetic: true },
    });
  });
});

describe('subject initials for the avatar', () => {
  it('derives two initials when the backend sends one for a hyphenated alias', async () => {
    const { adaptSubjectForTest } = await import('./api');
    expect(adaptSubjectForTest({ subject_id: 'PAC-A', display_name: 'PAC-A', initials: 'P' }).initials).toBe('PA');
    expect(adaptSubjectForTest({ subject_id: 'alex', display_name: 'Alex Rivera', initials: 'AR' }).initials).toBe('AR');
  });
});

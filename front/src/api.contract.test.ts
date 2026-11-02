import { describe, expect, it } from 'vitest';

import {
  adaptTimelineResponse,
  buildDailyRecordWrite,
  buildEventWrite,
  toLocalIsoString,
  type BackendTimelineResponse,
} from './api';
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
    trigger: 'Ruido',
    strategy_applied: null,
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
    });
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
      trigger: 'Ruido',
    });
    expect(new Date(body.occurred_at).toISOString()).toBe(event.occurred_at);
    expect(body).not.toHaveProperty('subject_id');
    expect(body).not.toHaveProperty('event_id');
  });
});

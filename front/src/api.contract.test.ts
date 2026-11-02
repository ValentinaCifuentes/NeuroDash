import { describe, expect, it } from 'vitest';

import { adaptTimelineResponse, type BackendTimelineResponse } from './api';

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

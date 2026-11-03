import { describe, expect, it } from 'vitest';

import type { TimelineEntry } from '../types';
import { historyRow, todayRows } from './history';

const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0).toISOString();

function basal(day: number, hour: number, payload: Record<string, unknown>): TimelineEntry {
  return {
    entry_id: `rec-${day}-${hour}`, kind: 'daily_record', timestamp: at(day, hour), title: 'Registro diario', detail: null, semantic: 'info',
    payload: { subject_id: 's', date: '', sleep_quality: null, wake_mode: null, start_autonomy: null, medication_adherence: null, gi_status: null, ...payload },
  } as TimelineEntry;
}

function event(day: number, hour: number, payload: Record<string, unknown>, title = 'Evento'): TimelineEntry {
  return {
    entry_id: `evt-${day}-${hour}`, kind: 'event', timestamp: at(day, hour), title, detail: null, semantic: 'warning', payload,
  } as unknown as TimelineEntry;
}

describe('Historial de Hoy', () => {
  it('summarizes the basal state with the words the tutor chose', () => {
    const row = historyRow(basal(3, 8, { sleep_quality: 'Reparador', wake_mode: 'Irritable/Llorando' }));

    expect(row.title).toBe('Estado basal');
    expect(row.summary).toBe('Sueño reparador · Despertar irritable / llorando');
  });

  it('names each event by its category and keeps the intensity band and quick capture', () => {
    const row = historyRow(event(3, 11, { event_type: 'Desregulación Emocional', intensity_value: 5, quick_capture: true }));

    expect(row.title).toBe('Desregulación');
    expect(row.icon).toBe('bolt');
    expect(row.summary).toBe('Moderada (4-7) · Registro rápido');
  });

  it('prefers the category scale and the strategy when the event has them', () => {
    const row = historyRow(
      event(3, 13, { event_type: 'Transición de Actividad', intensity_value: 5, qualitative_outcome: 'Con ayuda', support_used: 'Apoyo visual / pictogramas' }),
    );

    expect(row.title).toBe('Transición');
    expect(row.summary).toBe('Con ayuda · Apoyo visual / pictogramas');
  });

  it('lists the strategies applied in a dysregulation', () => {
    const row = historyRow(
      event(3, 12, { event_type: 'Desregulación Emocional', intensity_value: 8, strategy_applied: ['Espacio seguro', 'Audífonos'] }),
    );

    expect(row.summary).toBe('Severa (8-10) · Espacio seguro, Audífonos');
  });

  it('shows a confirmed crisis as a dysregulation and says where it came from (P8)', () => {
    const row = historyRow(event(3, 14, { event_type: 'Desregulación Emocional', severity: 'moderate', source: 'outcome_confirmation' }));

    expect(row.title).toBe('Desregulación');
    expect(row.summary).toBe('Confirmada desde la estimación');
  });

  it('keeps the backend title for a confirmed crisis without event type', () => {
    expect(historyRow(event(3, 9, { intensity_value: 8 }, 'Crisis confirmada')).title).toBe('Crisis confirmada');
  });

  it('shows only today, newest first, and hides counts-only records', () => {
    const rows = todayRows(
      [
        basal(2, 21, { sleep_quality: 'Interrumpido' }),
        basal(3, 8, { sleep_quality: 'Reparador' }),
        basal(3, 12, { event_count: 1 }),
        event(3, 11, { event_type: 'Alimentación', intensity_value: 2 }),
      ],
      '2026-11-03',
    );

    expect(rows.map((row) => row.title)).toEqual(['Alimentación', 'Estado basal']);
  });
});

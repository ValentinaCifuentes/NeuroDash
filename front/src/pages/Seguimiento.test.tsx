import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTimeline } from '../api';
import { buildDaySummaries, comparisonHeadline, localDay, weeklyComparison } from '../domain/aggregate';
import type { TimelineEntry } from '../types';
import { Seguimiento } from './Seguimiento';

vi.mock('../api', () => ({ getTimeline: vi.fn() }));

afterEach(cleanup);

const NOW = new Date(2026, 10, 3, 12, 0, 0); // 3 de noviembre de 2026, local

/** `day` de noviembre de 2026; con `month` se puede apuntar a octubre (9). */
function at(day: number, hour = 10, month = 10): string {
  return new Date(2026, month, day, hour, 0, 0).toISOString();
}

function record(day: number, payload: Record<string, unknown>, month = 10): TimelineEntry {
  return {
    entry_id: `rec-${month}-${day}`, kind: 'daily_record', timestamp: at(day, 10, month), title: 'Registro diario', detail: null, semantic: 'info',
    payload: { subject_id: 's', date: '', sleep_quality: null, wake_mode: null, start_autonomy: null, medication_adherence: null, gi_status: null, ...payload },
  } as TimelineEntry;
}

function event(day: number, intensity: number, hour = 15): TimelineEntry {
  return {
    entry_id: `evt-${day}-${hour}`, kind: 'event', timestamp: at(day, hour), title: 'Desregulación Emocional', detail: null, semantic: 'warning',
    payload: { event_type: 'Desregulación Emocional', intensity_value: intensity },
  } as unknown as TimelineEntry;
}

describe('buildDaySummaries', () => {
  it('does not count a counts-only record as a day with Bitácora (P1)', () => {
    const [day] = buildDaySummaries([record(3, { event_count: 2, max_intensity: 6 })], NOW, 1);

    expect(day.hasRecord).toBe(false);
    expect(day.eventCount).toBe(2);
    expect(day.maxIntensity).toBe(6);
  });

  it('takes the larger of the record counts and the event entries, without adding them twice', () => {
    const [day] = buildDaySummaries(
      [record(3, { sleep_quality: 'Reparador', event_count: 2, max_intensity: 6 }), event(3, 6), event(3, 4, 16)],
      NOW,
      1,
    );

    expect(day.hasRecord).toBe(true);
    expect(day.eventCount).toBe(2);
    expect(day.heat).toBe(1);
  });
});

describe('weeklyComparison', () => {
  it('compares this week with the previous one, per variable', () => {
    // 14 días = 21 oct … 3 nov: la semana anterior es 21–27 oct y esta, 28 oct – 3 nov.
    const entries = [
      record(25, { sleep_quality: 'Interrumpido' }, 9), // semana anterior: 1 noche para observar
      record(30, { sleep_quality: 'Dificultad de Conciliación' }, 9), // esta semana: 2
      record(2, { sleep_quality: 'Interrumpido' }),
    ];
    const days = buildDaySummaries(entries, NOW, 14);
    const sleep = weeklyComparison(days).find((item) => item.variable === 'sleep')!;

    expect(sleep.previousCount).toBe(1);
    expect(sleep.currentCount).toBe(2);
    expect(sleep.trend).toBe('up');
    expect(comparisonHeadline(weeklyComparison(days))).toBe('Sueño aumentó frente a la semana anterior');
  });
});

describe('Seguimiento', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.mocked(getTimeline).mockResolvedValue({
      subject_id: 's', as_of: NOW.toISOString(), days: 70,
      entries: [record(2, { sleep_quality: 'Interrumpido', wake_mode: 'Irritable/Llorando' }), event(2, 8), event(2, 5, 16), event(2, 4, 17)],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('shows the month calendar with today selected and each day labelled with its events in words', async () => {
    render(<Seguimiento subject={{ subject_id: 's', display_name: 'S', initials: 'S', age_range: '', diagnosis: '', sensory_profile: '' }} revision={0} />);

    const grid = await screen.findByRole('grid', { name: /Calendario del mes/ });
    expect(within(grid).getByRole('gridcell', { name: '3 de noviembre: sin registro' })).toHaveAttribute('aria-selected', 'true');
    expect(within(grid).getByRole('gridcell', { name: '2 de noviembre: 3 a 4 eventos' })).toHaveClass('nd-heat-2');
  });

  it('shows the detail of the day the tutor taps, with forms and readable texts', async () => {
    render(<Seguimiento subject={{ subject_id: 's', display_name: 'S', initials: 'S', age_range: '', diagnosis: '', sensory_profile: '' }} revision={0} />);

    fireEvent.click(await screen.findByRole('gridcell', { name: '2 de noviembre: 3 a 4 eventos' }));

    const detail = screen.getByRole('region', { name: /Lunes/ });
    expect(within(detail).getByText('Interrumpido')).toBeInTheDocument();
    expect(within(detail).getByText('Irritable / Llorando')).toBeInTheDocument();
    expect(within(detail).getByText('3 eventos · Máx. 8/10')).toBeInTheDocument();
    expect(within(detail).getByText('Día intenso')).toBeInTheDocument();
  });

  it('goes back to the previous month and selects its last logged day', async () => {
    vi.mocked(getTimeline).mockResolvedValueOnce({
      subject_id: 's', as_of: NOW.toISOString(), days: 70,
      entries: [record(30, { sleep_quality: 'Reparador' }, 9)],
    });
    render(<Seguimiento subject={{ subject_id: 's', display_name: 'S', initials: 'S', age_range: '', diagnosis: '', sensory_profile: '' }} revision={0} />);

    expect(await screen.findByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));

    expect(screen.getByRole('heading', { name: 'Octubre' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: '30 de octubre: sin eventos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
  });

  it('keeps the 14-day comparison closed, with a headline, until the tutor opens it', async () => {
    render(<Seguimiento subject={{ subject_id: 's', display_name: 'S', initials: 'S', age_range: '', diagnosis: '', sensory_profile: '' }} revision={0} />);

    const toggle = await screen.findByRole('button', { name: /Evolución de 14 días/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent(/aumentaron frente a la semana anterior|aumentó frente a la semana anterior/);

    fireEvent.click(toggle);
    expect(screen.getByText('Esta semana · 28 oct – 3 nov')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Eventos\. Esta semana: 1 días con eventos · semana anterior: 0/ })).toBeVisible();
  });
});

it('localDay keeps the local date', () => {
  expect(localDay(new Date(2026, 10, 3, 23, 30).toISOString())).toBe('2026-11-03');
});

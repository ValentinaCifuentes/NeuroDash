import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listPlannedEvents, savePlannedEvent } from '../api';
import { formatPlanDate, loadPlannedEvents } from '../domain/planning';
import type { PlannedEvent, Subject } from '../types';
import { Planificacion } from './Planificacion';

vi.mock('../api', () => ({
  listPlannedEvents: vi.fn(),
  savePlannedEvent: vi.fn(),
}));

const real = { subject_id: 'tomi', display_name: 'Tomi', provenance: { source: 'caregiver_onboarding', synthetic: false } } as Subject;

beforeEach(() => {
  vi.mocked(listPlannedEvents).mockReset();
  vi.mocked(savePlannedEvent).mockReset();
});
afterEach(cleanup);

describe('planning', () => {
  it('hides events from previous days and sorts the rest by date', async () => {
    const now = new Date(2026, 10, 3, 12);
    vi.mocked(listPlannedEvents).mockResolvedValue([
      { id: 'b', subject_id: 'tomi', title: 'Después', starts_at: new Date(2026, 10, 5, 9).toISOString(), category: null, expectation: null },
      { id: 'old', subject_id: 'tomi', title: 'Ayer', starts_at: new Date(2026, 10, 2, 9).toISOString(), category: null, expectation: null },
      { id: 'a', subject_id: 'tomi', title: 'Hoy temprano', starts_at: new Date(2026, 10, 3, 8).toISOString(), category: null, expectation: null },
    ]);

    expect((await loadPlannedEvents(real, now)).map((event) => event.title)).toEqual(['Hoy temprano', 'Después']);
  });

  it('reads dates the way a family says them', () => {
    const now = new Date(2026, 10, 3, 12); // martes
    expect(formatPlanDate(new Date(2026, 10, 3, 15, 30).toISOString(), now)).toBe('Hoy, 15:30');
    expect(formatPlanDate(new Date(2026, 10, 4, 15, 30).toISOString(), now)).toBe('Mañana, 15:30');
    expect(formatPlanDate(new Date(2026, 10, 7, 12).toISOString(), now)).toBe('Sábado, 12:00');
    expect(formatPlanDate(new Date(2026, 10, 20, 9).toISOString(), now)).toBe('20 nov, 09:00');
  });
});

describe('Planificacion', () => {
  it('shows an empty state for a real subject without events', async () => {
    vi.mocked(listPlannedEvents).mockResolvedValue([]);
    render(<Planificacion subject={real} />);

    expect(await screen.findByText('No hay eventos próximos')).toBeInTheDocument();
  });

  it('adds an event with chips, with nothing preselected, and keeps it on the list', async () => {
    const saved: PlannedEvent[] = [];
    vi.mocked(listPlannedEvents).mockImplementation(async () => [...saved]);
    vi.mocked(savePlannedEvent).mockImplementation(async (event) => {
      saved.push(event);
      return event;
    });
    const onSaved = vi.fn();

    render(<Planificacion subject={real} onSaved={onSaved} />);
    await screen.findByText('No hay eventos próximos');

    fireEvent.click(screen.getByRole('button', { name: /Añadir Nuevo Evento/ }));
    const dialog = screen.getByRole('dialog', { name: 'Añadir Evento' });
    const save = within(dialog).getByRole('button', { name: 'Guardar Evento' });

    expect(within(dialog).queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(save).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Nombre del Evento'), { target: { value: 'Control médico' } });
    fireEvent.change(within(dialog).getByLabelText('Hora'), { target: { value: '23:59' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Salud' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Estresante' }));
    fireEvent.click(save);

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Control médico', category: 'Salud', expectation: 'Estresante' }),
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Control médico' })).toBeInTheDocument();
    expect(screen.getByText('Impacto esperado: Estresante')).toBeInTheDocument();
  });
});

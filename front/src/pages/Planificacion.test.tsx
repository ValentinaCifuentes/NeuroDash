import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatPlanDate, loadPlannedEvents } from '../domain/planning';
import type { Subject } from '../types';
import { Planificacion } from './Planificacion';

const demo = { subject_id: 'PAC-A', display_name: 'PAC-A', provenance: { source: 'demo', synthetic: true } } as Subject;
const real = { subject_id: 'tomi', display_name: 'Tomi', provenance: { source: 'caregiver_onboarding', synthetic: false } } as Subject;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('planning store (D6 mock)', () => {
  it('seeds the prototype examples only for demo subjects', () => {
    expect(loadPlannedEvents(demo)).toHaveLength(3);
    expect(loadPlannedEvents(real)).toEqual([]);
  });

  it('hides events from previous days and sorts the rest by date', () => {
    const now = new Date(2026, 10, 3, 12);
    localStorage.setItem(
      'neurodash.planned.tomi',
      JSON.stringify([
        { id: 'b', subject_id: 'tomi', title: 'Después', starts_at: new Date(2026, 10, 5, 9).toISOString(), category: null, expectation: null },
        { id: 'old', subject_id: 'tomi', title: 'Ayer', starts_at: new Date(2026, 10, 2, 9).toISOString(), category: null, expectation: null },
        { id: 'a', subject_id: 'tomi', title: 'Hoy temprano', starts_at: new Date(2026, 10, 3, 8).toISOString(), category: null, expectation: null },
      ]),
    );

    expect(loadPlannedEvents(real, now).map((event) => event.title)).toEqual(['Hoy temprano', 'Después']);
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
  it('shows an empty state for a real subject without events', () => {
    render(<Planificacion subject={real} />);

    expect(screen.getByText('No hay eventos próximos')).toBeInTheDocument();
  });

  it('adds an event with chips, with nothing preselected, and keeps it after a reload', () => {
    const onSaved = vi.fn();
    render(<Planificacion subject={real} onSaved={onSaved} />);
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

    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ title: 'Control médico', category: 'Salud', expectation: 'Estresante' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Impacto esperado: Estresante')).toBeInTheDocument();

    cleanup();
    render(<Planificacion subject={real} />);
    expect(screen.getByRole('heading', { name: 'Control médico' })).toBeInTheDocument();
  });
});

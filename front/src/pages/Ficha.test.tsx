import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Subject } from '../types';
import { FichaInicial, MisTickets } from './Ficha';

afterEach(cleanup);

const tomi = {
  subject_id: 'tomi',
  display_name: 'Tomi',
  initials: 'TO',
  age_range: '',
  diagnosis: '',
  sensory_profile: '',
  habitual_context: { age_range: '6 a 8 años', early_signs: ['Se aísla'] },
  sensory_context: { auditory: 1 },
} as Subject;

describe('FichaInicial', () => {
  it('shows the profile and says plainly what was not registered', () => {
    render(<FichaInicial subject={tomi} onOpenTickets={() => undefined} />);
    const clinical = screen.getByRole('region', { name: 'Contexto clínico' });

    expect(within(clinical).getByText('6 a 8 años')).toBeInTheDocument();
    expect(within(clinical).getByText('Le molesta: sonidos')).toBeInTheDocument();
    expect(within(clinical).getAllByText('Sin registrar')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Su día a día' })).toHaveTextContent('Se aísla');
  });

  it('does not promise that the sensory profile feeds the estimation', () => {
    render(<FichaInicial subject={tomi} onOpenTickets={() => undefined} />);

    expect(screen.getByRole('note')).toHaveTextContent('Todavía no entran a la estimación.');
  });

  it('opens Mis Tickets from «Ayuda y soporte»', () => {
    const onOpenTickets = vi.fn();
    render(<FichaInicial subject={tomi} onOpenTickets={onOpenTickets} />);

    fireEvent.click(screen.getByRole('button', { name: /Mis Tickets/ }));

    expect(onOpenTickets).toHaveBeenCalled();
  });
});

describe('MisTickets', () => {
  it('labels support tickets as out of scope without a functional submission action', () => {
    render(<MisTickets />);

    // El título «Mis Tickets» lo pone PageHeader (ver BottomNav.test).
    expect(screen.getByText('Esta funcionalidad está fuera del alcance actual de NeuroDash.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

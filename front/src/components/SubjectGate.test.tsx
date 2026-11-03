import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubjectGate } from './SubjectGate';

const alex = { subject_id: 'alex-rivera', display_name: 'Alex Rivera', initials: 'AR', age_range: '', diagnosis: '', sensory_profile: '' };

describe('SubjectGate', () => {
  afterEach(cleanup);

  it('requires an explicit selection before continuing into care actions', () => {
    const selected: string[] = [];
    render(<SubjectGate subjects={[alex]} onSelect={(subject) => selected.push(subject.subject_id)} onOnboard={async () => undefined} />);

    expect(screen.getByRole('heading', { name: 'Selecciona al infante' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alex Rivera/ }));
    expect(selected).toEqual(['alex-rivera']);
  });

  it('creates a subject from the alias alone', async () => {
    const onOnboard = vi.fn().mockResolvedValue(undefined);
    render(<SubjectGate subjects={[]} onSelect={() => undefined} onOnboard={onOnboard} />);
    const save = screen.getByRole('button', { name: 'Guardar y seleccionar' });

    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nombre o alias del infante'), { target: { value: 'Tomi' } });
    fireEvent.click(save);

    expect(onOnboard).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Tomi' }));
    expect(onOnboard.mock.calls[0][0]).not.toHaveProperty('habitual_context');
  });

  it('announces a safe onboarding error without selecting a subject', async () => {
    render(<SubjectGate subjects={[]} onSelect={() => undefined} onOnboard={async () => { throw new Error('A subject name is required'); }} />);

    fireEvent.change(screen.getByLabelText('Nombre o alias del infante'), { target: { value: 'Tomi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seleccionar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A subject name is required');
  });

  it('opens the 3-step profile keeping the alias already typed', () => {
    render(<SubjectGate subjects={[]} onSelect={() => undefined} onOnboard={async () => undefined} />);

    fireEvent.change(screen.getByLabelText('Nombre o alias del infante'), { target: { value: 'Tomi' } });
    fireEvent.click(screen.getByRole('button', { name: /perfil en 3 pasos/ }));

    expect(screen.getByRole('heading', { name: 'Sobre quien vas a acompañar' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Alias' })).toHaveValue('Tomi');
  });
});

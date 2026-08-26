import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SubjectGate } from './SubjectGate';

describe('SubjectGate', () => {
  afterEach(cleanup);
  it('requires an explicit selection before continuing into care actions', () => {
    const selected: string[] = [];
    render(
      <SubjectGate
        subjects={[{ subject_id: 'alex-rivera', display_name: 'Alex Rivera', initials: 'AR', age_range: '', diagnosis: '', sensory_profile: '' }]}
        onSelect={(subject) => selected.push(subject.subject_id)}
        onOnboard={async () => undefined}
      />,
    );

    expect(screen.getByText('Selecciona un consultante')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alex Rivera' }));
    expect(selected).toEqual(['alex-rivera']);
  });

  it('announces a safe onboarding validation error without selecting a subject', async () => {
    render(<SubjectGate subjects={[]} onSelect={() => undefined} onOnboard={async () => { throw new Error('A subject name is required'); }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear consultante' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seleccionar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A subject name is required');
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SubjectOnboardingInput } from '../types';
import { Onboarding } from './Onboarding';

afterEach(cleanup);

function setup(onCreate = vi.fn().mockResolvedValue(undefined), onCancel = vi.fn()) {
  render(<Onboarding onCancel={onCancel} onCreate={onCreate} />);
  return { onCreate, onCancel };
}

const cta = () => screen.getByRole('button', { name: /Continuar|Crear perfil/ });
const sent = (onCreate: ReturnType<typeof vi.fn>) => onCreate.mock.calls[0][0] as SubjectOnboardingInput;
const choose = (group: RegExp, option: string) =>
  fireEvent.click(within(screen.getByRole('group', { name: group })).getByRole('checkbox', { name: option }));

describe('Onboarding', () => {
  it('needs only the alias to continue, and starts with nothing selected', () => {
    setup();

    expect(cta()).toBeDisabled();
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);

    fireEvent.change(screen.getByRole('textbox', { name: 'Alias' }), { target: { value: 'Tomi' } });

    expect(cta()).toBeEnabled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('walks the three steps and sends each answer to its destination', async () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Alias' }), { target: { value: 'Tomi' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Edad' })).getByRole('radio', { name: '6 a 8 años' }));
    choose(/¿Cómo se comunica\?/, 'No verbal');
    fireEvent.click(cta());

    expect(screen.getByRole('heading', { name: 'Cómo suelen ser sus crisis' })).toHaveFocus();
    choose(/Señales tempranas/, 'Se aísla');
    fireEvent.click(cta());

    choose(/estrategias que funcionan/, 'Espacio seguro');
    fireEvent.click(screen.getByRole('radio', { name: 'Sonidos: le molesta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(sent(onCreate)).toMatchObject({
      display_name: 'Tomi',
      habitual_context: { age_range: '6 a 8 años', communication: ['No verbal'], early_signs: ['Se aísla'] },
      sensory_context: { auditory: 1 },
      historical_supports: [{ id: 'sup_espacio_seguro', description: 'Espacio seguro', type: 'historical', effective: true }],
    });
    expect(sent(onCreate).habitual_context).not.toHaveProperty('neurodivergence');
  });

  it('creates the profile early with «Completar más tarde»', async () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Alias' }), { target: { value: 'Tomi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Completar más tarde' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(sent(onCreate)).not.toHaveProperty('sensory_context');
  });

  it('goes back a step, and from the first step back to the selection', () => {
    const { onCancel } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Alias' }), { target: { value: 'Tomi' } });
    fireEvent.click(cta());
    fireEvent.click(screen.getByRole('button', { name: 'Volver al paso anterior' }));

    expect(screen.getByRole('textbox', { name: 'Alias' })).toHaveValue('Tomi');
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la selección de infante' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows the error and lets the tutor retry', async () => {
    setup(vi.fn().mockRejectedValue({ message: 'No se pudo guardar.' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Alias' }), { target: { value: 'Tomi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Completar más tarde' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar.');
    expect(screen.getByRole('button', { name: 'Completar más tarde' })).toBeEnabled();
  });
});

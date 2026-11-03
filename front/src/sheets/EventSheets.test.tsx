import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DysregulationEvent, LogCategory } from '../types';
import { CategorySheet, EventSheet } from './EventSheets';

afterEach(cleanup);

function renderSheet(category: LogCategory, onSave = vi.fn().mockResolvedValue(true)) {
  render(<EventSheet category={category} subjectId="PAC-A" saving={false} onSave={onSave} onBack={vi.fn()} onClose={vi.fn()} />);
  return onSave;
}

const quickButton = () => screen.getByRole('button', { name: /Guardar ya/ });
const sent = (save: ReturnType<typeof vi.fn>, call = 0) => save.mock.calls[call][0] as DysregulationEvent;

describe('CategorySheet', () => {
  it('offers the four categories', () => {
    const onPick = vi.fn();
    render(<CategorySheet onPick={onPick} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Transición/ }));

    expect(screen.getAllByRole('button', { name: /Alimentación|Desregulación|Transición|Dieta Sensorial/ })).toHaveLength(4);
    expect(onPick).toHaveBeenCalledWith('transicion');
  });
});

describe('EventSheet', () => {
  it('starts with no scale chosen and waits for it before saving (P13)', () => {
    renderSheet('transicion');

    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(quickButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Con ayuda' }));

    expect(quickButton()).toBeEnabled();
  });

  it('asks for the intensity in a dysregulation and saves the chosen value', async () => {
    const save = renderSheet('desregulacion');
    const slider = screen.getByLabelText('Intensidad');

    expect(slider).toHaveAttribute('aria-valuetext', 'Sin elegir');
    expect(quickButton()).toBeDisabled();

    fireEvent.change(slider, { target: { value: '8' } });
    fireEvent.click(quickButton());

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(sent(save)).toMatchObject({ intensity_value: 8, intensity_band: 'Severa (8-10)', quick_capture: true, trigger: null });
  });

  it('counts a tap in the middle of the bar as choosing 5', () => {
    renderSheet('desregulacion');
    const slider = screen.getByLabelText('Intensidad');

    fireEvent.pointerUp(slider);

    expect(slider).toHaveAttribute('aria-valuetext', '5, moderado');
    expect(quickButton()).toBeEnabled();
  });

  it('saves triggers and strategies as chips, writing the «Otro» text in its place (D5)', async () => {
    const save = renderSheet('desregulacion');
    fireEvent.change(screen.getByLabelText('Intensidad'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /más detalles clínicos/ }));

    const triggers = screen.getByRole('group', { name: /Disparadores/ });
    fireEvent.click(within(triggers).getByRole('checkbox', { name: 'Ruidos' }));
    fireEvent.click(within(triggers).getByRole('checkbox', { name: 'Otro' }));
    fireEvent.change(screen.getByLabelText('¿Cuál otro disparador?'), { target: { value: 'Se cortó la luz' } });
    fireEvent.click(within(screen.getByRole('group', { name: /Estrategia aplicada/ })).getByRole('checkbox', { name: 'Espacio seguro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar registro' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(sent(save)).toMatchObject({
      trigger: ['Ruidos', 'Se cortó la luz'],
      strategy_applied: ['Espacio seguro'],
      strategy_outcome: null,
      quick_capture: false,
    });
  });

  it('sends the transition support on its own field and drops «Ninguno»', async () => {
    const save = renderSheet('transicion');
    fireEvent.click(screen.getByRole('radio', { name: 'Fácil' }));
    fireEvent.click(screen.getByRole('button', { name: /más detalles/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Ninguno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar registro' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(sent(save)).toMatchObject({ qualitative_outcome: 'Fácil', support_used: null, strategy_applied: null });
  });

  it('retries a failed save with the same key (P2)', async () => {
    const save = renderSheet('alimentacion', vi.fn().mockResolvedValue(false));
    fireEvent.click(screen.getByRole('radio', { name: 'Regular' }));

    fireEvent.click(quickButton());
    fireEvent.click(quickButton());

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(sent(save, 1).idempotency_key).toBe(sent(save, 0).idempotency_key);
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DailyRecord, Subject } from '../types';
import { BitacoraDiaria } from './BitacoraDiaria';

vi.mock('../api', () => ({ getTimeline: vi.fn().mockResolvedValue({ entries: [] }) }));

afterEach(cleanup);

const subject = { subject_id: 'PAC-A', display_name: 'PAC-A' } as Subject;

function setup(onSaveBasal = vi.fn().mockResolvedValue(true)) {
  render(<BitacoraDiaria subject={subject} revision={0} saving={false} onSaveBasal={onSaveBasal} onAddEvent={vi.fn()} />);
  return onSaveBasal;
}

const saveButton = () => screen.getByRole('button', { name: /Guardar Estado Basal/ });

function answerCore() {
  fireEvent.click(within(screen.getByRole('radiogroup', { name: /¿Cómo durmió anoche\?/ })).getByRole('radio', { name: /Reparador/ }));
  fireEvent.click(within(screen.getByRole('radiogroup', { name: /¿Cómo despertó/ })).getByRole('radio', { name: /Tranquilo/ }));
}

function sentRecord(save: ReturnType<typeof vi.fn>, call = 0): DailyRecord {
  return save.mock.calls[call][0] as DailyRecord;
}

describe('Bitácora · Mi Día', () => {
  it('starts with nothing selected (P13)', () => {
    setup();

    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(screen.getByRole('switch', { name: /medicamentos/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps saving disabled until sleep and wake are answered', () => {
    setup();

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(/Para guardar falta: sueño y despertar/)).toBeInTheDocument();

    answerCore();

    expect(saveButton()).toBeEnabled();
  });

  it('does not send medication or context the tutor did not answer', async () => {
    const save = setup();
    answerCore();
    fireEvent.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalled());
    const record = sentRecord(save);
    expect(record.sleep_quality).toBe('Reparador');
    expect(record.medication_adherence).toBeNull();
    expect(record.gi_status).toBeNull();
    expect(record.sleep_hours_range).toBeNull();
    expect(record.early_signs).toEqual([]);
  });

  it('sends medication once the switch or «No aplica» is touched', async () => {
    const save = setup();
    answerCore();
    fireEvent.click(screen.getByRole('button', { name: /No aplica para este infante/ }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(sentRecord(save).medication_adherence).toBe('No Aplica');
  });

  it('sends the day context, and «Ninguna» clears the other early signs', async () => {
    const save = setup();
    answerCore();
    const signs = screen.getByRole('group', { name: /señales tempranas/ });
    const [firstSign] = within(signs).getAllByRole('checkbox');
    fireEvent.click(firstSign);
    fireEvent.click(within(signs).getByRole('checkbox', { name: 'Ninguna' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /horas durmió/ })).getByRole('radio', { name: '7 a 9 h' }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(sentRecord(save)).toMatchObject({ sleep_hours_range: '7 a 9 h', early_signs: ['Ninguna'] });
  });

  it('offers the early signs of the profile when there are some (P24)', () => {
    render(
      <BitacoraDiaria
        subject={{ ...subject, habitual_context: { early_signs: ['Se aísla', 'Otra'] } }}
        revision={0}
        saving={false}
        onSaveBasal={vi.fn()}
      />,
    );
    const signs = screen.getByRole('group', { name: /señales tempranas/ });

    expect(within(signs).getAllByRole('checkbox').map((chip) => chip.textContent)).toEqual(['Se aísla', 'Ninguna']);
    expect(screen.getByText(/Las señales salen de su perfil/)).toBeInTheDocument();
  });

  it('retries a failed save with the same key and uses a new one after success (P2)', async () => {
    const save = setup(vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true));
    answerCore();

    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));

    const [first, second, third] = [0, 1, 2].map((i) => sentRecord(save, i).idempotency_key);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it('hides the form once the basal of today is saved', async () => {
    setup(vi.fn().mockResolvedValue(true));
    answerCore();
    fireEvent.click(saveButton());

    // El formulario desaparece y queda el «guardado».
    await screen.findByText('Guardado');
    expect(screen.queryByRole('button', { name: /Guardar Estado Basal/ })).not.toBeInTheDocument();
  });
});

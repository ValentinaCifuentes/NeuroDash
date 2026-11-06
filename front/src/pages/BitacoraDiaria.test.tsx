import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTimeline } from '../api';
import { todayIso } from '../domain/catalog';
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

  it('retries a failed save with the same key, and resets the form after success (P2)', async () => {
    const save = setup(vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true));
    answerCore();

    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));

    // El reintento reutiliza la misma clave (P2).
    expect(sentRecord(save, 0).idempotency_key).toBe(sentRecord(save, 1).idempotency_key);

    // El tercer intento funciona y reinicia el formulario (queda sin selección).
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0));
  });

  it('hides the fields already saved today, leaving only what is missing', async () => {
    vi.mocked(getTimeline).mockResolvedValue({
      subject_id: subject.subject_id,
      as_of: new Date().toISOString(),
      days: 1,
      entries: [
        {
          entry_id: 'r1',
          kind: 'daily_record',
          timestamp: new Date().toISOString(),
          title: 'Estado basal',
          detail: null,
          semantic: 'info',
          payload: {
            record_id: 'r1',
            subject_id: subject.subject_id,
            date: todayIso(),
            sleep_quality: 'Reparador',
            wake_mode: 'Tranquilo/Alegre',
            start_autonomy: 'Por sí solo',
            medication_adherence: null,
            gi_status: null,
          },
        },
      ],
    });
    render(<BitacoraDiaria subject={subject} revision={0} saving={false} onSaveBasal={vi.fn()} onAddEvent={vi.fn()} />);

    // Espera a que cargue la línea de tiempo y desaparezca lo ya guardado.
    await waitFor(() => expect(screen.queryByRole('radiogroup', { name: /¿Cómo durmió anoche\?/ })).not.toBeInTheDocument());

    // Lo ya guardado (descanso nocturno) no aparece; lo que falta sí.
    expect(screen.queryByRole('radiogroup', { name: /¿Cómo despertó/ })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /medicamentos/ })).toBeInTheDocument();
    // Y ya no se exige sueño/despertar para seguir guardando.
    expect(screen.queryByText(/Para guardar falta/)).not.toBeInTheDocument();
  });
});

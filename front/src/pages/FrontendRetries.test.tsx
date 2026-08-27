import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSessions, getTimeline } from '../api';
import type { ProfessionalSession } from '../types';
import { BitacoraDiaria } from './BitacoraDiaria';
import { Sesiones } from './Sesiones';

vi.mock('../api', () => ({ getSessions: vi.fn(), getTimeline: vi.fn(), saveSession: vi.fn() }));

afterEach(cleanup);

const subject = { subject_id: 'subject-1', display_name: 'Alex', initials: 'A', age_range: '', diagnosis: '', sensory_profile: '' };
const safeError = { status: 0, code: 'network_error', message: 'Try again safely.' };

describe('care and session retry boundaries', () => {
  it('announces a timeline failure and retries without losing the selected history view', async () => {
    vi.mocked(getTimeline).mockRejectedValueOnce(safeError).mockResolvedValueOnce({
      subject_id: subject.subject_id, as_of: '2026-08-26T12:00:00Z', days: 1, entries: [],
    });
    render(<BitacoraDiaria subject={subject} revision={0} saving={false} onSaveBasal={() => undefined} />);

    fireEvent.click(screen.getByRole('tab', { name: /Historial de Hoy/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again safely.');
    const retry = screen.getByRole('button', { name: 'Reintentar historial' });
    fireEvent.click(retry);

    await waitFor(() => expect(getTimeline).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Aún no hay registros de hoy')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Historial de Hoy/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('retries safe session failures and never renders a private note from an unsafe response', async () => {
    vi.mocked(getSessions).mockRejectedValueOnce(safeError).mockResolvedValueOnce([{
      session_id: 'session-1', subject_id: subject.subject_id, occurred_at: '2026-08-26T10:00:00Z',
      professional: 'Dr. Rivera', consultation_reason: 'Control', modality: 'Presencial', duration_minutes: 45,
      attendance: 'Presente', paid: false, status: 'Atendida', alert_level: 'Medio', objectives: 'Shared goal',
      activities: null, observations: null, visible_to_tutor: true, active: true, internal_notes: 'Private note',
    } as unknown as ProfessionalSession]);
    render(<Sesiones subject={subject} onSaved={() => undefined} onError={() => undefined} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again safely.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar sesiones' }));
    expect(await screen.findByText('Dr. Rivera')).toBeInTheDocument();
    expect(screen.queryByText('Private note')).not.toBeInTheDocument();
  });
});

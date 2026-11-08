import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTimeline } from '../api';
import { BitacoraDiaria } from './BitacoraDiaria';

vi.mock('../api', () => ({ getTimeline: vi.fn() }));

afterEach(cleanup);

const subject = { subject_id: 'subject-1', display_name: 'Alex', initials: 'A', age_range: '', diagnosis: '', sensory_profile: '' };
const safeError = { status: 0, code: 'network_error', message: 'Try again safely.' };

describe('care retry boundaries', () => {
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
});

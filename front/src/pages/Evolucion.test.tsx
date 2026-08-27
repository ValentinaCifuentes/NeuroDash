import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmPredictionOutcome, getPrediction } from '../api';
import { Evolucion } from './Evolucion';
import type { Prediction } from '../types';

vi.mock('../api', () => ({
  getPrediction: vi.fn(),
  confirmPredictionOutcome: vi.fn(),
}));

afterEach(cleanup);

const subject = {
  subject_id: 'subject-1', display_name: 'Alex', initials: 'A', age_range: '6-7', diagnosis: '', sensory_profile: '',
};

const prediction: Prediction = {
  contract_version: '2', prediction_id: 'prediction-1', subject_id: 'subject-1',
  prediction_cutoff: '2026-08-26T12:00:00Z', horizon_hours: 24, risk: 'ELEVATED', confidence: 'LOW',
  abstained: false, factors: [], missingness: [{ code: 'sleep', label: 'Sueño', impact: 'Falta información.' }], supports: [],
  provenance: { source: 'care_api', synthetic: false }, versions: { model: 'v2', contract: '2' },
};

describe('Evolucion', () => {
  it('renders separate safe prediction fields and confirms an outcome without exposing model score', async () => {
    vi.mocked(getPrediction).mockResolvedValue(prediction);
    vi.mocked(confirmPredictionOutcome).mockResolvedValue({ prediction_id: 'prediction-1', actual_outcome: true });

    render(<Evolucion subject={subject} revision={0} />);

    expect(await screen.findByText('Riesgo elevado')).toBeInTheDocument();
    expect(screen.getByText('Confianza baja')).toBeInTheDocument();
    expect(screen.getByText(/Corte:/)).toBeInTheDocument();
    expect(screen.getByText('Sueño.')).toBeInTheDocument();
    expect(screen.queryByText(/model_score|Puntaje del modelo/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar que ocurrió' }));
    await waitFor(() => expect(confirmPredictionOutcome).toHaveBeenCalledWith('prediction-1', true, expect.any(String)));
    expect(await screen.findByRole('status')).toHaveTextContent('Resultado confirmado');
  });

  it('shows an explicit abstention without an invented risk or outcome action', async () => {
    vi.mocked(getPrediction).mockResolvedValue({ ...prediction, risk: null, confidence: 'INSUFFICIENT', abstained: true });

    render(<Evolucion subject={subject} revision={0} />);

    expect(await screen.findByText('Todavía no hay estimación')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirmar que ocurrió/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Elevado')).not.toBeInTheDocument();
  });

  it('announces a safe prediction failure and retries from the focused action', async () => {
    vi.mocked(getPrediction).mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Try again safely.' })
      .mockResolvedValueOnce(prediction);
    render(<Evolucion subject={subject} revision={0} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again safely.');
    const retry = screen.getByRole('button', { name: 'Reintentar estimación' });
    expect(document.activeElement).toBe(retry);
    const callsBeforeRetry = vi.mocked(getPrediction).mock.calls.length;
    fireEvent.click(retry);

    await waitFor(() => expect(getPrediction).toHaveBeenCalledTimes(callsBeforeRetry + 1));
    expect(await screen.findByText('Riesgo elevado')).toBeInTheDocument();
  });
});

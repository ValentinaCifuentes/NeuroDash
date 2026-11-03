import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  abstained: false,
  factors: [{ code: 'estado_despertar_promedio_tres_dias', label: 'Estado al despertar en los últimos tres días', comparison: '', direction: 'up', window: '3d', baseline: 'above', trend: 'worse', summary: 'Despertó más irritable que de costumbre en los últimos tres días' }],
  missingness: [{ code: 'sleep_quality', label: 'Calidad del sueño', impact: 'Falta información.', is_core: true }],
  supports: [{ support_id: 'sup-1', source: 'historical_support', label: 'Manta con peso por la tarde', detail: 'Funcionó en días parecidos' }],
  provenance: { source: 'care_api', synthetic: false }, versions: { model: 'v2', contract: '2' },
};

describe('Evolucion', () => {
  it('shows the estimation card with risk and confidence as separate axes, and confirms an outcome', async () => {
    vi.mocked(getPrediction).mockResolvedValue(prediction);
    vi.mocked(confirmPredictionOutcome).mockResolvedValue({ prediction_id: 'prediction-1', actual_outcome: true });

    render(<Evolucion subject={subject} revision={0} />);

    const card = await screen.findByRole('region', { name: 'Conviene prestar atención hoy' });
    expect(within(card).getByText('Riesgo elevado')).toBeInTheDocument();
    expect(within(card).getByText('Confianza baja')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: /Índice demostrativo 80 de 100, riesgo elevado, confianza baja/ })).toBeInTheDocument();
    expect(screen.queryByText(/model_score|Puntaje del modelo/i)).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Confirmar que ocurrió' }));
    await waitFor(() => expect(confirmPredictionOutcome).toHaveBeenCalledWith('prediction-1', true, expect.any(String)));
    expect(await within(card).findByRole('status')).toHaveTextContent('Resultado confirmado');
  });

  it('keeps detail behind two rows and shows the supports in full', async () => {
    vi.mocked(getPrediction).mockResolvedValue(prediction);

    render(<Evolucion subject={subject} revision={0} />);

    const rows = await screen.findByRole('navigation', { name: 'Detalle de la estimación' });
    expect(within(rows).getByRole('button', { name: /Por qué aparece así.*Despertó más irritable que de costumbre/ })).toBeInTheDocument();
    expect(within(rows).getByRole('button', { name: /Puede mejorar la lectura.*Falta 1 dato que cuenta para la confianza/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Apoyos disponibles' })).toHaveTextContent('Manta con peso por la tarde');
  });

  it('opens «Por qué aparece así» with non-causal factors and the provenance note at the foot', async () => {
    vi.mocked(getPrediction).mockResolvedValue({ ...prediction, provenance: { subject_id: 'PAC-A', synthetic: true } });
    render(<Evolucion subject={subject} revision={0} />);

    fireEvent.click(await screen.findByRole('button', { name: /Por qué aparece así/ }));

    const sheet = screen.getByRole('dialog', { name: 'Señales recientes' });
    // P19: el factor se dice frente a lo habitual del infante, no con el nombre de la variable.
    expect(within(sheet).getByText('Despertó más irritable que de costumbre en los últimos tres días')).toBeInTheDocument();
    expect(within(sheet).queryByText('Estado al despertar en los últimos tres días')).not.toBeInTheDocument();
    expect(within(sheet).getByText('Aparece junto a más riesgo')).toBeInTheDocument();
    expect(within(sheet).getByText(/Estimación de demostración: usa datos sintéticos/)).toBeInTheDocument();
    expect(within(sheet).queryByText(/datos reales/i)).not.toBeInTheDocument();
  });

  it('keeps the variable name when the engine cannot compare it with the baseline', async () => {
    vi.mocked(getPrediction).mockResolvedValue({
      ...prediction,
      factors: [{ ...prediction.factors[0], baseline: null, trend: null, summary: null }],
    });
    render(<Evolucion subject={subject} revision={0} />);

    fireEvent.click(await screen.findByRole('button', { name: /Por qué aparece así/ }));

    const sheet = screen.getByRole('dialog', { name: 'Señales recientes' });
    expect(within(sheet).getByText('Estado al despertar en los últimos tres días')).toBeInTheDocument();
  });

  it('describes real data without naming another product', async () => {
    vi.mocked(getPrediction).mockResolvedValue(prediction);
    render(<Evolucion subject={subject} revision={0} />);

    fireEvent.click(await screen.findByRole('button', { name: /Por qué aparece así/ }));

    expect(screen.getByText(/Usa los datos registrados para este infante/)).toBeInTheDocument();
  });

  it('sends the tutor to the Bitácora from «Puede mejorar la lectura»', async () => {
    vi.mocked(getPrediction).mockResolvedValue(prediction);
    const onOpenBitacora = vi.fn();
    render(<Evolucion subject={subject} revision={0} onOpenBitacora={onOpenBitacora} />);

    fireEvent.click(await screen.findByRole('button', { name: /Puede mejorar la lectura/ }));
    const sheet = screen.getByRole('dialog', { name: 'Puede mejorar la lectura' });
    expect(within(sheet).getByText('Se registra en Bitácora · Mi Día')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Completar calidad del sueño' }));

    expect(onOpenBitacora).toHaveBeenCalled();
  });

  it('takes the horizon from the contract, not from a hardcoded 24 h', async () => {
    vi.mocked(getPrediction).mockResolvedValue({ ...prediction, horizon_hours: 8 });

    render(<Evolucion subject={subject} revision={0} />);

    expect(await screen.findByText('Próximas 8 horas')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Próximas 8 h' })).toBeInTheDocument();
    expect(screen.queryByText(/24/)).not.toBeInTheDocument();
  });

  it('shows an explicit abstention without an invented risk or outcome action', async () => {
    vi.mocked(getPrediction).mockResolvedValue({
      ...prediction,
      risk: null,
      confidence: 'INSUFFICIENT',
      abstained: true,
      supports: [
        ...prediction.supports,
        { support_id: 'insufficient', source: 'insufficient_data', label: 'No hay información suficiente para seleccionar un apoyo contextualizado.' },
      ],
    });

    render(<Evolucion subject={subject} revision={0} />);

    expect(await screen.findByText('Todavía no hay estimación')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirmar que ocurrió/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Riesgo elevado/)).not.toBeInTheDocument();
    // Como en screens/Final-Evolucion-Abstencion.html: solo la fila de datos y ningún factor.
    expect(screen.queryByRole('button', { name: /Por qué aparece así/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Puede mejorar la lectura/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Apoyos disponibles' })).not.toBeInTheDocument();
    // P23: lo que el tutor registró que le ayuda sigue a la vista; el aviso de falta de datos no se repite.
    const own = screen.getByRole('region', { name: 'Lo que le ayuda' });
    expect(own).toHaveTextContent('Manta con peso por la tarde');
    expect(own).not.toHaveTextContent('No hay información suficiente');
  });

  it('explains that more days of history are needed when it abstains with no missing field (PAC-C)', async () => {
    vi.mocked(getPrediction).mockResolvedValue({ ...prediction, risk: null, confidence: 'INSUFFICIENT', abstained: true, missingness: [] });
    render(<Evolucion subject={subject} revision={0} />);

    fireEvent.click(await screen.findByRole('button', { name: /Puede mejorar la lectura.*Hacen falta más días de registro/ }));

    const sheet = screen.getByRole('dialog', { name: 'Puede mejorar la lectura' });
    expect(within(sheet).getByText('Más días de registro')).toBeInTheDocument();
    expect(within(sheet).queryByText(/alcanza/)).not.toBeInTheDocument();
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

describe('factorFamily', () => {
  it('groups the windows and the baseline deviation of a variable under one family', async () => {
    const { factorFamily } = await import('../sheets/EstimationSheets');
    const codes = [
      'estado_despertar_promedio_un_dia',
      'estado_despertar_promedio_tres_dias',
      'desviacion_estado_despertar_linea_base',
    ];
    expect(new Set(codes.map(factorFamily))).toEqual(new Set(['estado_despertar']));
    expect(factorFamily('conteo_registros_siete_dias')).toBe('conteo_registros');
    expect(factorFamily('intensidad_maxima_promedio_catorce_dias')).toBe('intensidad_maxima');
  });
});

/**
 * Recorrido completo de la app (Fase 7 · paso 2).
 *
 * Cada pantalla tiene sus pruebas, pero por separado y con la API simulada a
 * mano. Aquí corre la app entera contra el modo sin servidor (`mockBackend`,
 * con las demos reales), como la usaría un tutor: si un cambio rompe el paso
 * de datos entre pantallas (lo guardado en Mi Día no llega al Historial, un
 * evento no cuenta en Seguimiento…), esta prueba lo detecta.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import App from './App';
import { USING_MOCK } from './api';
import { resetMockBackend, setMockLatency } from './mocks/mockBackend';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  resetMockBackend();
  setMockLatency(0);
});

afterEach(cleanup);

const nav = (name: string) => fireEvent.click(screen.getByRole('link', { name }));
const tab = (name: RegExp | string) => fireEvent.click(screen.getByRole('tab', { name }));
const choose = (group: RegExp, option: RegExp | string) =>
  fireEvent.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: option }));

describe('a tutor day with PAC-A, end to end', () => {
  it('runs against the serverless mode (no VITE_API_BASE in tests)', () => {
    expect(USING_MOCK).toBe(true);
  });

  it('goes from the estimate to the Bitácora, the Historial, Seguimiento and the Ficha', async () => {
    render(<App />);

    // 1 · Selección → Evolución: la estimación real de la demo.
    fireEvent.click(await screen.findByRole('button', { name: /PAC-A/ }));
    expect(await screen.findByText('Riesgo moderado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Por qué aparece así.*que de costumbre/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Apoyos disponibles' })).toHaveTextContent('Manta con peso en la tarde');

    // 2 · Bitácora · Mi Día: guardar el estado basal.
    nav('Bitácora');
    expect(window.location.hash).toBe('#bitacora');
    const save = screen.getByRole('button', { name: /Guardar Estado Basal/ });
    expect(save).toBeDisabled();
    choose(/¿Cómo durmió anoche\?/, 'Interrumpido');
    choose(/¿Cómo despertó/, /Irritable/);
    fireEvent.click(save);
    expect(await screen.findByText('Estado basal guardado')).toBeInTheDocument();

    // 3 · Registrar un evento con el «+»: Transición con ayuda y apoyo visual.
    fireEvent.click(screen.getByRole('button', { name: 'Registrar un evento' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '¿Qué deseas registrar?' })).getByRole('button', { name: /Transición/ }));
    const sheet = screen.getByRole('dialog', { name: 'Registrar Transición' });
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Con ayuda' }));
    fireEvent.click(within(sheet).getByRole('button', { name: /más detalles/ }));
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Apoyo visual / pictogramas' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Guardar registro' }));
    expect(await screen.findByText('Transición registrada')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // 4 · Historial de Hoy: los dos registros, con las palabras del tutor, junto al
    //     Mi Día que la demo ya trae de esta mañana (07:45).
    tab('Historial de Hoy');
    expect(window.location.hash).toBe('#historial');
    const historial = await screen.findByRole('region', { name: /3 registros hoy/ });
    expect(historial).toHaveTextContent('Sueño interrumpido · Despertar irritable / llorando');
    expect(historial).toHaveTextContent('Con ayuda · Apoyo visual / pictogramas');

    // 5 · Evolución › Seguimiento: el día de hoy ya tiene sueño y el evento.
    nav('Evolución');
    tab('Seguimiento');
    expect(window.location.hash).toBe('#seguimiento');
    const today = await screen.findByRole('region', { name: /\d{2}\/\d{2}\/\d{4}/ });
    await waitFor(() => expect(today).toHaveTextContent('Interrumpido'));
    expect(today).toHaveTextContent('1 evento');

    // 6 · Ficha: el perfil completo de la demo, y Mis Tickets desde «Ayuda y soporte».
    nav('Ficha');
    const clinical = await screen.findByRole('region', { name: 'Contexto clínico' });
    expect(clinical).toHaveTextContent('6 a 8 años');
    fireEvent.click(screen.getByRole('button', { name: /Mis Tickets/ }));
    expect(screen.getByText('Funcionalidad no disponible')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ficha' })).toHaveAttribute('aria-current', 'page');
  });

  it('creates a new subject in 3 steps and starts without an estimate but with its supports', async () => {
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Nombre o alias del infante'), { target: { value: 'Tomi' } });
    fireEvent.click(screen.getByRole('button', { name: /perfil en 3 pasos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(within(screen.getByRole('group', { name: /estrategias que funcionan/ })).getByRole('checkbox', { name: 'Espacio seguro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil' }));

    expect(await screen.findByText('Todavía no hay estimación')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Lo que le ayuda' })).toHaveTextContent('Espacio seguro');
  });
});

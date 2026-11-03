import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

vi.mock('./api', () => ({
  USING_MOCK: false,
  listSubjects: vi.fn().mockResolvedValue([
    { subject_id: 'PAC-A', display_name: 'PAC-A', initials: 'PA', age_range: '', diagnosis: '', sensory_profile: '' },
  ]),
  getSubject: vi.fn().mockRejectedValue({ message: 'sin perfil' }),
  // La estimación queda cargando: esta prueba mira la navegación, no el contrato.
  getPrediction: vi.fn(() => new Promise(() => undefined)),
  getTimeline: vi.fn().mockResolvedValue({ subject_id: 'PAC-A', as_of: '', days: 1, entries: [] }),
  onboardSubject: vi.fn(),
  saveDailyRecord: vi.fn(),
  saveEvent: vi.fn(),
}));

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(cleanup);

async function enter() {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /PAC-A/ }));
}

describe('App routes', () => {
  it('turns the Seguimiento tab into a route that keeps Evolución marked', async () => {
    await enter();

    fireEvent.click(screen.getByRole('tab', { name: 'Seguimiento' }));

    expect(window.location.hash).toBe('#seguimiento');
    expect(screen.getByRole('link', { name: 'Evolución' })).toHaveAttribute('aria-current', 'page');
  });

  it('goes back to the previous view with the browser back button', async () => {
    await enter();
    fireEvent.click(screen.getByRole('link', { name: 'Bitácora' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Historial de Hoy' }));
    expect(window.location.hash).toBe('#historial');

    act(() => {
      window.history.replaceState(null, '', '#bitacora');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.getByRole('tab', { name: /Mi Día/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on the view written in the address', async () => {
    window.history.replaceState(null, '', '#historial');
    await enter();

    expect(screen.getByRole('tab', { name: 'Historial de Hoy' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'Bitácora' })).toHaveAttribute('aria-current', 'page');
  });
});

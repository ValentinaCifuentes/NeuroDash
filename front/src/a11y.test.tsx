/**
 * Revisión automática de accesibilidad (Fase 7 · paso 3) con axe-core.
 *
 * Recorre la app con el modo sin servidor (demos reales) y revisa cada pantalla
 * y hoja: nombres de botones y campos, roles y atributos ARIA, IDs repetidos,
 * estructura de listas y encabezados… Falla con la lista de lo que encontró.
 *
 * No cubre el contraste de color: jsdom no calcula estilos. Eso, el orden del
 * foco y el lector de pantalla se revisan a mano en la Fase 8.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import App from './App';
import { resetMockBackend, setMockLatency } from './mocks/mockBackend';

beforeAll(() => {
  // axe prueba íconos dibujando en un canvas; jsdom no lo tiene y avisa en cada llamada.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  resetMockBackend();
  setMockLatency(0);
});

afterEach(cleanup);

/** axe corre ~15 veces por prueba: con toda la suite en paralelo (y en GitHub) pasa
 *  fácil los 5 s por defecto. Es lenta, no inestable. */
const AXE_TIMEOUT = 30_000;

/** Violaciones de axe en lo que se ve ahora, en una línea legible por cada una. */
async function violations(where: string): Promise<string[]> {
  const result = await axe.run(document.body, {
    rules: {
      'color-contrast': { enabled: false }, // jsdom no calcula colores: se revisa a mano (Fase 8)
    },
  });
  return result.violations.map(
    (violation) =>
      `${where} · ${violation.id}: ${violation.help} → ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
}

const nav = (name: string) => fireEvent.click(screen.getByRole('link', { name }));
const tab = (name: RegExp | string) => fireEvent.click(screen.getByRole('tab', { name }));

describe('accessibility (axe-core)', () => {
  it('finds no violations on the screens and sheets of a demo subject', async () => {
    render(<App />);
    const found: string[] = [];

    await screen.findByRole('button', { name: /PAC-A/ });
    found.push(...(await violations('Selección')));

    fireEvent.click(screen.getByRole('button', { name: /PAC-A/ }));
    await screen.findByText('Riesgo elevado');
    found.push(...(await violations('Evolución')));

    fireEvent.click(screen.getByRole('button', { name: /Por qué aparece así/ }));
    found.push(...(await violations('Hoja · Por qué aparece así')));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));

    fireEvent.click(screen.getByRole('button', { name: /Puede mejorar la lectura/ }));
    found.push(...(await violations('Hoja · Puede mejorar la lectura')));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));

    tab('Seguimiento');
    await screen.findByRole('region', { name: /\d{2}\/\d{2}\/\d{4}/ });
    found.push(...(await violations('Seguimiento')));

    nav('Bitácora');
    found.push(...(await violations('Bitácora · Mi Día')));

    fireEvent.click(screen.getByRole('button', { name: 'Registrar un evento' }));
    found.push(...(await violations('Hoja · Categorías')));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Desregulación/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /más detalles/ }));
    found.push(...(await violations('Hoja · Registrar Desregulación')));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));

    tab('Historial de Hoy');
    await screen.findByText(/registros? hoy|Aún no hay registros de hoy/);
    found.push(...(await violations('Bitácora · Historial')));

    nav('Planificación');
    found.push(...(await violations('Planificación')));
    fireEvent.click(screen.getByRole('button', { name: /Añadir Nuevo Evento/ }));
    found.push(...(await violations('Hoja · Añadir Evento')));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));

    nav('Ficha');
    await screen.findByRole('region', { name: 'Contexto clínico' });
    found.push(...(await violations('Ficha')));
    fireEvent.click(screen.getByRole('button', { name: /Mis Tickets/ }));
    found.push(...(await violations('Mis Tickets')));

    expect(found).toEqual([]);
  }, AXE_TIMEOUT);

  it('finds no violations in the 3-step profile and the abstention of a new subject', async () => {
    render(<App />);
    const found: string[] = [];

    fireEvent.change(await screen.findByLabelText('Nombre o alias del infante'), { target: { value: 'Tomi' } });
    fireEvent.click(screen.getByRole('button', { name: /perfil en 3 pasos/ }));
    for (const step of ['Perfil · paso 1', 'Perfil · paso 2', 'Perfil · paso 3']) {
      found.push(...(await violations(step)));
      fireEvent.click(screen.getByRole('button', { name: /Continuar|Crear perfil/ }));
    }

    await screen.findByText('Todavía no hay estimación');
    found.push(...(await violations('Evolución · sin estimación')));

    expect(found).toEqual([]);
  }, AXE_TIMEOUT);
});

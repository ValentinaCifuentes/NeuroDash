import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SensoryChannel, SensoryLevel } from '../domain/catalog';
import { Disclosure } from './Disclosure';
import { NavList, NavRow } from './NavRow';
import { SensoryMatrix } from './SensoryMatrix';

afterEach(cleanup);

describe('NavRow', () => {
  it('is a button named by its title and summary, inside a named list', () => {
    const onClick = vi.fn();
    render(
      <NavList label="Detalle de la estimación">
        <NavRow icon="arrowUp" tone="risk" title="Por qué aparece así" summary="Despertar irritable y más eventos" onClick={onClick} />
        <NavRow icon="plus" tone="missing" title="Puede mejorar la lectura" summary="Falta 1 dato de hoy" onClick={() => undefined} />
      </NavList>,
    );

    expect(screen.getByRole('navigation', { name: 'Detalle de la estimación' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Por qué aparece así.*Despertar irritable/ }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('Disclosure', () => {
  it('shows the summary while closed and toggles aria-expanded with aria-controls', () => {
    render(
      <Disclosure title="Evolución de 14 días" summary="Sueño y eventos aumentaron frente a la semana anterior">
        <p>Barras por variable</p>
      </Disclosure>,
    );

    const toggle = screen.getByRole('button', { name: /Evolución de 14 días/ });
    expect(screen.getByText(/Sueño y eventos aumentaron/)).toBeVisible();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Barras por variable')).not.toBeVisible();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const body = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(body).toContainElement(screen.getByText('Barras por variable'));
    expect(screen.getByText('Barras por variable')).toBeVisible();
  });
});

describe('SensoryMatrix', () => {
  function Harness() {
    const [value, setValue] = useState<Partial<Record<SensoryChannel, SensoryLevel>>>({});
    return <SensoryMatrix value={value} onChange={(channel, level) => setValue((v) => ({ ...v, [channel]: level }))} />;
  }

  it('has one named radiogroup per channel with fully named cells', () => {
    render(<Harness />);

    for (const channel of ['Sonidos', 'Luces', 'Tacto', 'Sabores', 'Movimiento']) {
      expect(screen.getByRole('radiogroup', { name: channel })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('radio')).toHaveLength(15);
    fireEvent.click(screen.getByRole('radio', { name: 'Sonidos: le molesta' }));
    expect(screen.getByRole('radio', { name: 'Sonidos: le molesta' })).toHaveAttribute('aria-checked', 'true');
  });

  it('moves within a channel with the arrow keys', () => {
    render(<Harness />);

    const typical = screen.getByRole('radio', { name: 'Luces: típico' });
    expect(typical.tabIndex).toBe(0); // sin respuesta, el foco entra por «típico»
    fireEvent.keyDown(typical, { key: 'ArrowLeft' });

    const less = screen.getByRole('radio', { name: 'Luces: busca menos' });
    expect(less).toHaveAttribute('aria-checked', 'true');
    expect(less).toHaveFocus();
  });
});

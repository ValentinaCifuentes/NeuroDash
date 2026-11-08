/**
 * Teclado (Fase 7 · paso 3): lo que no cubría `controls.test.tsx`.
 *
 * Patrón de grupos de una opción (WAI-ARIA radiogroup): una sola parada de Tab
 * por grupo y las flechas mueven el foco y la selección. Los grupos de varias
 * opciones son casillas independientes: cada una es su propia parada de Tab.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SensoryChannel, SensoryLevel } from '../domain/catalog';
import { ChipGroup, IntensitySlider } from './controls';
import { SensoryMatrix } from './SensoryMatrix';

afterEach(cleanup);

const tabStops = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('button')).filter((button) => button.tabIndex === 0);

function SingleChips() {
  const [value, setValue] = useState<string | null>(null);
  return <ChipGroup mode="single" legend="Categoría" options={['Salud', 'Social', 'Escolar']} value={value} onChange={setValue} />;
}

function MultipleChips() {
  const [value, setValue] = useState<string[]>([]);
  return <ChipGroup mode="multiple" legend="Gatillantes" options={['Ruido', 'Esperas', 'Hambre o sueño']} value={value} onChange={setValue} />;
}

function Slider() {
  const [value, setValue] = useState<number | null>(null);
  return <IntensitySlider value={value} onChange={setValue} />;
}

function Matrix() {
  const [value, setValue] = useState<Partial<Record<SensoryChannel, SensoryLevel>>>({});
  return <SensoryMatrix value={value} onChange={(channel, level) => setValue((prev) => ({ ...prev, [channel]: level }))} />;
}

describe('ChipGroup with the keyboard', () => {
  it('single mode: one tab stop, arrows move focus and selection, and wrap around', () => {
    render(<SingleChips />);
    const group = screen.getByRole('radiogroup', { name: 'Categoría' });

    expect(tabStops(group)).toHaveLength(1);

    const salud = within(group).getByRole('radio', { name: 'Salud' });
    fireEvent.keyDown(salud, { key: 'ArrowRight' });
    const social = within(group).getByRole('radio', { name: 'Social' });
    expect(social).toHaveFocus();
    expect(social).toHaveAttribute('aria-checked', 'true');
    expect(tabStops(group)).toEqual([social]);

    fireEvent.keyDown(salud, { key: 'ArrowLeft' });
    expect(within(group).getByRole('radio', { name: 'Escolar' })).toHaveAttribute('aria-checked', 'true');
  });

  it('multiple mode: every chip is its own tab stop and arrows do not tick anything', () => {
    render(<MultipleChips />);
    const group = screen.getByRole('group', { name: 'Gatillantes' });

    expect(tabStops(group)).toHaveLength(3);
    fireEvent.keyDown(within(group).getByRole('checkbox', { name: 'Ruido' }), { key: 'ArrowRight' });
    expect(within(group).queryAllByRole('checkbox', { checked: true })).toHaveLength(0);
  });
});

describe('IntensitySlider with the keyboard', () => {
  it('starts unchosen and counts the first arrow as choosing the value under the thumb', () => {
    render(<Slider />);
    const slider = screen.getByLabelText('Intensidad');

    expect(slider).toHaveAttribute('aria-valuetext', 'Sin elegir');
    fireEvent.keyUp(slider, { key: 'Tab' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Sin elegir');

    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuetext', '5, moderado');

    fireEvent.change(slider, { target: { value: '9' } });
    expect(slider).toHaveAttribute('aria-valuetext', '9, fuerte');
  });
});

describe('SensoryMatrix with the keyboard', () => {
  it('has one tab stop per channel, arrows choose within the row, and rows stay independent', () => {
    render(<Matrix />);
    const sounds = screen.getByRole('radiogroup', { name: 'Sonidos' });
    const lights = screen.getByRole('radiogroup', { name: 'Luces' });

    expect(tabStops(sounds)).toHaveLength(1);
    // Sin elegir, la parada de Tab es «Típico» (la del medio), no un extremo.
    expect(tabStops(sounds)[0]).toHaveAccessibleName('Sonidos: típico');

    fireEvent.keyDown(tabStops(sounds)[0], { key: 'ArrowRight' });

    const bothers = within(sounds).getByRole('radio', { name: 'Sonidos: le molesta' });
    expect(bothers).toHaveFocus();
    expect(bothers).toHaveAttribute('aria-checked', 'true');
    expect(within(lights).queryAllByRole('radio', { checked: true })).toHaveLength(0);
  });
});

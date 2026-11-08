import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GI_CHOICES, SENSORY_RESPONSE_CHOICES, SLEEP_CHOICES } from '../domain/catalog';
import { ChipGroup, ChoiceTiles, SegmentedTabs, ShapeList } from './controls';

afterEach(cleanup);

describe('ChoiceTiles', () => {
  it('names every tile by its label, without the decorative bars or check (P12)', () => {
    render(<ChoiceTiles legend="¿Cómo durmió anoche?" choices={SLEEP_CHOICES} value="Reparador" onChange={() => undefined} />);

    expect(screen.getByRole('radiogroup', { name: '¿Cómo durmió anoche?' })).toBeInTheDocument();
    for (const label of ['Reparador', 'Interrumpido', 'Muy Difícil']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('radio', { name: 'Reparador' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows 1 to 3 bars in the bars variant and shapes in the shape variant, never emoji', () => {
    const bars = render(<ChoiceTiles legend="Sueño" choices={SLEEP_CHOICES} value={null} onChange={() => undefined} />);
    expect(bars.container.querySelectorAll('.nd-levelbars')).toHaveLength(3);
    expect(bars.container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    bars.unmount();

    const shapes = render(
      <ChoiceTiles legend="¿Cómo respondió?" choices={SENSORY_RESPONSE_CHOICES} value={null} onChange={() => undefined} marker="shape" />,
    );
    expect(shapes.container.querySelectorAll('svg.nd-shape')).toHaveLength(3);
  });

  it('moves focus and selection with the arrow keys, keeping one tab stop', () => {
    function Harness() {
      const [value, setValue] = useState<string | null>('Reparador');
      return <ChoiceTiles legend="Sueño" choices={SLEEP_CHOICES} value={value} onChange={setValue} />;
    }
    render(<Harness />);

    const first = screen.getByRole('radio', { name: 'Reparador' });
    expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toEqual([first]);
    fireEvent.keyDown(first, { key: 'ArrowRight' });

    const second = screen.getByRole('radio', { name: 'Interrumpido' });
    expect(second).toHaveAttribute('aria-checked', 'true');
    expect(second).toHaveFocus();
  });
});

describe('ShapeList', () => {
  it('lists digestion as radios with shapes', () => {
    const onChange = vi.fn();
    const { container } = render(<ShapeList label="Salud gastrointestinal" choices={GI_CHOICES} value="Normal" onChange={onChange} />);

    expect(container.querySelectorAll('svg.nd-shape')).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: 'Diarrea / Irritación' }));
    expect(onChange).toHaveBeenCalledWith('Diarrea');
  });
});

describe('ChipGroup', () => {
  const OPTIONS = ['Columpio', 'Presión profunda', 'Cepillado'];

  it('starts with nothing selected and works as a radiogroup in single mode', () => {
    function Harness() {
      const [value, setValue] = useState<string | null>(null);
      return <ChipGroup mode="single" legend="Actividad realizada" options={OPTIONS} value={value} onChange={setValue} />;
    }
    render(<Harness />);

    expect(screen.getByRole('radiogroup', { name: 'Actividad realizada' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').every((chip) => chip.getAttribute('aria-checked') === 'false')).toBe(true);

    const chip = screen.getByRole('radio', { name: 'Presión profunda' });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(chip); // tocar de nuevo la quita: «sin responder» es una respuesta válida
    expect(chip).toHaveAttribute('aria-checked', 'false');
  });

  it('uses independent checkboxes in multiple mode', () => {
    function Harness() {
      const [value, setValue] = useState<string[]>([]);
      return <ChipGroup mode="multiple" legend="¿Tuvo algún malestar físico?" options={['Resfrío', 'Fiebre']} value={value} onChange={setValue} />;
    }
    render(<Harness />);

    expect(screen.getByRole('group', { name: '¿Tuvo algún malestar físico?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Resfrío' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fiebre' }));
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'true']);
  });
});

describe('SegmentedTabs', () => {
  it('keeps the tablist API and switches with the arrow keys', () => {
    const onChange = vi.fn();
    render(
      <SegmentedTabs
        label="Vista de evolución"
        active="estimacion"
        onChange={onChange}
        tabs={[{ id: 'estimacion', label: 'Próximas 8 h' }, { id: 'seguimiento', label: 'Seguimiento' }]}
      />,
    );

    const tab = screen.getByRole('tab', { name: 'Próximas 8 h' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('seguimiento');
  });
});

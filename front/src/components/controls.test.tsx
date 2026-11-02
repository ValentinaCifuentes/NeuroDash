import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GI_CHOICES, SLEEP_CHOICES } from '../domain/catalog';
import { OptionGroup } from './controls';

afterEach(cleanup);

describe('OptionGroup', () => {
  it('names every option by its label, without the decorative bars or check (P12)', () => {
    render(<OptionGroup legend="¿Cómo durmió anoche?" choices={SLEEP_CHOICES} value="Reparador" onChange={() => undefined} />);

    const group = screen.getByRole('radiogroup', { name: '¿Cómo durmió anoche?' });
    expect(group).toBeInTheDocument();
    for (const label of ['Reparador', 'Interrumpido', 'Muy Difícil']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('radio', { name: 'Reparador' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows level bars instead of emoji, and shapes for semantic scales', () => {
    const { container, unmount } = render(
      <OptionGroup legend="Sueño" choices={SLEEP_CHOICES} value={null} onChange={() => undefined} />,
    );
    expect(container.querySelectorAll('.nd-levelbars')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    unmount();

    const gi = render(<OptionGroup legend="Digestión" choices={GI_CHOICES} value={null} onChange={() => undefined} />);
    expect(gi.container.querySelectorAll('svg.nd-shape')).toHaveLength(3);
  });
});

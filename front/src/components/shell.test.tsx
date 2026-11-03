import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BottomSheet, Fab, Toast } from './shell';

afterEach(cleanup);

describe('BottomSheet', () => {
  it('is a modal dialog named by its title, with the category icon beside it', () => {
    const { container } = render(
      <BottomSheet title="Registrar Transición" titleIcon={{ name: 'transition', color: '#B8741A' }} onClose={() => undefined}>
        <p>Contenido</p>
      </BottomSheet>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Registrar Transición' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(container.querySelector('.nd-sheet__titleicon')).toHaveStyle({ background: '#B8741A' });
  });

  it('focuses the close button, closes with Esc and returns focus to the opener', () => {
    const onClose = vi.fn();
    const opener = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <>
        <button ref={opener}>+</button>
        <BottomSheet title="¿Qué deseas registrar?" onClose={onClose} returnFocusTo={opener}>
          <p>Contenido</p>
        </BottomSheet>
      </>,
    );

    const dialog = screen.getByRole('dialog', { name: '¿Qué deseas registrar?' });
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    rerender(<button ref={opener}>+</button>);
    expect(opener.current).toHaveFocus();
  });

  it('offers a named back button only when onBack is given', () => {
    const onBack = vi.fn();
    render(
      <BottomSheet title="Registrar Alimentación" onBack={onBack} onClose={() => undefined}>
        <p>Contenido</p>
      </BottomSheet>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Volver a categorías' }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('Fab and Toast', () => {
  it('names the + button by its action', () => {
    render(<Fab onClick={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Registrar un evento' })).toHaveClass('nd-fab');
  });

  it('announces the confirmation politely', () => {
    render(<Toast message="Desregulación registrada" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Desregulación registrada');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});

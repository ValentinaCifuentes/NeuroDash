import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BottomNav } from './BottomNav';
import { PageHeader } from './PageHeader';

afterEach(cleanup);

describe('BottomNav', () => {
  it('offers the four tabs of the final design, in order', () => {
    render(<BottomNav current="evolucion" onNavigate={() => undefined} />);

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Evolución',
      'Bitácora',
      'Planificación',
      'Ficha',
    ]);
  });

  it('marks only the current tab with aria-current', () => {
    render(<BottomNav current="bitacora" onNavigate={() => undefined} />);

    expect(screen.getByRole('link', { name: 'Bitácora' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Evolución' })).not.toHaveAttribute('aria-current');
  });

  it('keeps Ficha marked while Mis Tickets is open', () => {
    render(<BottomNav current="tickets" onNavigate={() => undefined} />);

    expect(screen.getByRole('link', { name: 'Ficha' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: /Tickets/ })).not.toBeInTheDocument();
  });

  it('keeps the parent tab marked on the sub-views', () => {
    render(<BottomNav current="seguimiento" onNavigate={() => undefined} />);
    expect(screen.getByRole('link', { name: 'Evolución' })).toHaveAttribute('aria-current', 'page');
    cleanup();

    render(<BottomNav current="historial" onNavigate={() => undefined} />);
    expect(screen.getByRole('link', { name: 'Bitácora' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates without reloading the page', () => {
    const onNavigate = vi.fn();
    render(<BottomNav current="evolucion" onNavigate={onNavigate} />);

    const event = fireEvent.click(screen.getByRole('link', { name: 'Planificación' }));

    expect(onNavigate).toHaveBeenCalledWith('planificacion');
    expect(event).toBe(false); // preventDefault: no se sigue el href
  });
});

describe('PageHeader', () => {
  it('puts the 34 px title and the avatar on the same row on Evolución (no brand)', () => {
    const onChangeSubject = vi.fn();
    render(<PageHeader title="Evolución" initials="PA" subjectName="PAC-A" onChangeSubject={onChangeSubject} />);

    const heading = screen.getByRole('heading', { level: 1, name: 'Evolución' });
    const avatar = screen.getByRole('button', { name: 'PAC-A, cambiar de infante' });
    expect(heading.parentElement).toBe(avatar.parentElement);
    expect(screen.queryByText('NeuroDash')).not.toBeInTheDocument();
    fireEvent.click(avatar);
    expect(onChangeSubject).toHaveBeenCalled();
  });

  it('shows the brand above the title and subtitle on Bitácora', () => {
    render(
      <PageHeader
        brand
        title="Bitácora Diaria"
        subtitle="Registra el estado basal y eventos cotidianos de PAC-A"
        initials="PA"
        subjectName="PAC-A"
        onChangeSubject={() => undefined}
      />,
    );

    expect(screen.getByText('NeuroDash')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Bitácora Diaria' })).toBeInTheDocument();
    expect(screen.getByText(/Registra el estado basal/)).toBeInTheDocument();
  });

  it('replaces the brand with a back button on a subscreen', () => {
    const onBack = vi.fn();
    render(
      <PageHeader
        initials="PA"
        subjectName="PAC-A"
        onChangeSubject={() => undefined}
        back={{ label: 'Ficha', onClick: onBack }}
        title="Mis Tickets"
      />,
    );

    expect(screen.queryByText('NeuroDash')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ficha' }));
    expect(onBack).toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Mis Tickets' })).toBeInTheDocument();
  });
});

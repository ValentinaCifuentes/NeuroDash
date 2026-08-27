import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BuscarProfesionales, MisTickets } from './Placeholders';

afterEach(cleanup);

describe('deferred feature placeholders', () => {
  it('labels the professional network as out of scope without a functional submission action', () => {
    render(<BuscarProfesionales />);

    expect(screen.getByRole('heading', { name: 'Buscar Profesionales' })).toBeInTheDocument();
    expect(screen.getByText('Esta funcionalidad está fuera del alcance actual de NeuraDash.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('labels support tickets as out of scope without a functional submission action', () => {
    render(<MisTickets />);

    expect(screen.getByRole('heading', { name: 'Mis Tickets' })).toBeInTheDocument();
    expect(screen.getByText('Esta funcionalidad está fuera del alcance actual de NeuraDash.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MisTickets } from './Placeholders';

afterEach(cleanup);

describe('deferred feature placeholders', () => {
  it('labels support tickets as out of scope without a functional submission action', () => {
    render(<MisTickets />);

    // El título «Mis Tickets» lo pone PageHeader (ver BottomNav.test).
    expect(screen.getByText('Esta funcionalidad está fuera del alcance actual de NeuroDash.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

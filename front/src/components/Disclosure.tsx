/**
 * Desplegable con resumen visible al estar cerrado (DESIGN-SPEC §4).
 * Ejemplo: «Evolución de 14 días» en Seguimiento, que cerrado dice qué subió.
 * `aria-expanded` + `aria-controls`; el chevron gira 180° (sin giro si se
 * pidió reducir movimiento).
 */

import { useId, useState, type ReactNode } from 'react';
import { Icon } from './icons';

interface DisclosureProps {
  title: string;
  /** Resumen de una línea; se ve abierto o cerrado. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Disclosure({ title, summary, defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="nd-disclosure">
      <h2 className="nd-disclosure__heading">
        <button
          type="button"
          className="nd-disclosure__toggle nd-press"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="nd-disclosure__text">
            <span className="nd-disclosure__title">{title}</span>
            {summary && <span className="nd-disclosure__summary">{summary}</span>}
          </span>
          <span className="nd-disclosure__chevron" aria-hidden="true">
            <Icon name="chevronDown" size={16} strokeWidth={2.6} />
          </span>
        </button>
      </h2>
      <div id={bodyId} className="nd-disclosure__body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

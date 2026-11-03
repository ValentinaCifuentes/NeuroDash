/**
 * Fila de navegación hacia una hoja o subpantalla (DESIGN-SPEC §4).
 * Ícono en caja de 34 px, título, resumen y chevron; alto ≥ 64 px.
 * Ejemplos: «Por qué aparece así» y «Puede mejorar la lectura» en Evolución,
 * «Mis Tickets» en Ficha.
 */

import { forwardRef, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

/** Fondo y color del ícono: rojo de riesgo, dato faltante (punteado ámbar) o neutro. */
export type NavRowTone = 'risk' | 'missing' | 'neutral';

interface NavRowProps {
  icon: IconName;
  tone?: NavRowTone;
  title: string;
  summary?: ReactNode;
  onClick: () => void;
}

/** `ref` apunta al botón: las hojas devuelven ahí el foco al cerrarse. */
export const NavRow = forwardRef<HTMLButtonElement, NavRowProps>(function NavRow(
  { icon, tone = 'neutral', title, summary, onClick },
  ref,
) {
  return (
    <button ref={ref} type="button" className="nd-navrow nd-press" onClick={onClick}>
      <span className={`nd-navrow__icon nd-navrow__icon--${tone}`} aria-hidden="true">
        <Icon name={icon} size={tone === 'missing' ? 14 : 18} strokeWidth={tone === 'neutral' ? 2 : 2.4} />
      </span>
      <span className="nd-navrow__text">
        <span className="nd-navrow__title">{title}</span>
        {summary && <span className="nd-navrow__summary">{summary}</span>}
      </span>
      <Icon name="chevronRight" size={14} strokeWidth={2.6} className="nd-navrow__chevron" />
    </button>
  );
});

/** Tarjeta que agrupa varias NavRow con separadores, como en Evolución. */
export function NavList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="nd-navlist" aria-label={label}>
      {children}
    </nav>
  );
}

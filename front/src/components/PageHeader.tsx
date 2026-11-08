/**
 * Encabezado de página del Prototipo final: título de 34 px + avatar del infante.
 *
 * Dos formatos, como en `screens/`:
 * - Sin `brand` ni `back` (Evolución): el título y el avatar comparten la fila.
 * - Con `brand` (Bitácora, Planificación, Ficha) o `back` (Mis Tickets): una fila
 *   con la marca o «‹ Volver» y el avatar, y debajo el título y el subtítulo.
 *
 * El avatar lleva a elegir otro infante.
 */

import type { ReactNode } from 'react';
import { Icon } from './icons';

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Muestra la marca NeuroDash sobre el título. */
  brand?: boolean;
  /** Subpantalla: «‹ {label}» en vez de la marca. */
  back?: { label: string; onClick: () => void };
  /** Infante activo: iniciales en el avatar y nombre para el lector de pantalla. */
  initials: string;
  subjectName: string;
  onChangeSubject: () => void;
}

export function PageHeader({ title, subtitle, brand, back, initials, subjectName, onChangeSubject }: PageHeaderProps) {
  const avatar = (
    <button
      type="button"
      className="nd-pageheader__avatar nd-press"
      aria-label={`${subjectName}, cambiar de infante`}
      onClick={onChangeSubject}
    >
      {initials}
    </button>
  );
  const heading = <h1 className="nd-pageheader__title">{title}</h1>;

  if (!brand && !back) {
    return (
      <header className="nd-pageheader">
        <div className="nd-pageheader__row">
          {heading}
          {avatar}
        </div>
        {subtitle && <p className="nd-pageheader__subtitle">{subtitle}</p>}
      </header>
    );
  }

  return (
    <header className="nd-pageheader">
      <div className="nd-pageheader__row">
        {back ? (
          <button type="button" className="nd-pageheader__back nd-press" onClick={back.onClick}>
            <Icon name="back" size={20} strokeWidth={2.4} />
            {back.label}
          </button>
        ) : (
          <span className="nd-pageheader__brand">
            <Icon name="pulse" size={20} />
            NeuroDash
          </span>
        )}
        {avatar}
      </div>
      <div className="nd-pageheader__titles">
        {heading}
        {subtitle && <p className="nd-pageheader__subtitle">{subtitle}</p>}
      </div>
    </header>
  );
}

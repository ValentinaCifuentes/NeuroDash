/**
 * Íconos SVG del Prototipo final (trazo de 24×24, sin relleno salvo el rayo).
 *
 * Toman el color del texto (`currentColor`), así que se pintan con `color`.
 * Son decorativos por defecto (`aria-hidden`); si un ícono es lo único que
 * explica un control, se pasa `label` y se anuncia como imagen.
 */

import type { CSSProperties, ReactNode } from 'react';

const PATHS = {
  /* Marca */
  pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  /* Navegación principal */
  evolution: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  journal: (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h11" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  profile: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6.5 16a3 3 0 0 1 5 0M14 10h4M14 14h3" />
    </>
  ),
  support: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  /* Acciones */
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  /* Estimación */
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 22 20H2z" />
      <path d="M12 10v4M12 17v.5" />
    </>
  ),
  shield: (
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  ),
  /* Categorías de registro */
  food: (
    <>
      <path d="M12 7c-1.5-2-5-2-6 1-1.2 3.5 1.5 10 4 11 1 .4 1.5-.2 2-.2s1 .6 2 .2c2.5-1 5.2-7.5 4-11-1-3-4.5-3-6-1z" />
      <path d="M12 7c0-2 1-3.5 3-4" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none" />,
  transition: <path d="M4 8h14l-3-3M20 16H6l3 3" />,
  sensory: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="14" width="5" height="7" rx="2" />
      <rect x="16" y="14" width="5" height="7" rx="2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Solo si el ícono es la única explicación del control. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 20, strokeWidth = 2, label, className, style }: IconProps) {
  return (
    <svg
      className={['nd-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: `0 0 ${size}px`, ...style }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {PATHS[name]}
    </svg>
  );
}

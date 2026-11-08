/**
 * Barra inferior de navegación · 4 pestañas del Prototipo final.
 *
 * Mis Tickets no es una pestaña: se abre desde Ficha › Ayuda y soporte, y
 * mientras está abierta la pestaña Ficha sigue marcada. Lo mismo con las
 * subvistas: Seguimiento marca Evolución, e Historial de Hoy marca Bitácora.
 */

import { Icon, type IconName } from './icons';

export type Route =
  | 'evolucion'
  | 'seguimiento'
  | 'bitacora'
  | 'historial'
  | 'planificacion'
  | 'ficha'
  | 'tickets';

export const ROUTES: Route[] = ['evolucion', 'seguimiento', 'bitacora', 'historial', 'planificacion', 'ficha', 'tickets'];

type TabRoute = 'evolucion' | 'bitacora' | 'planificacion' | 'ficha';

const PARENT_TAB: Partial<Record<Route, TabRoute>> = {
  seguimiento: 'evolucion',
  historial: 'bitacora',
  tickets: 'ficha',
};

const TABS: { id: TabRoute; label: string; icon: IconName }[] = [
  { id: 'evolucion', label: 'Evolución', icon: 'evolution' },
  { id: 'bitacora', label: 'Bitácora', icon: 'journal' },
  { id: 'planificacion', label: 'Planificación', icon: 'calendar' },
  { id: 'ficha', label: 'Ficha', icon: 'profile' },
];

/** Pestaña que se marca para cada ruta (las subpantallas marcan a su padre). */
export function tabFor(route: Route): TabRoute {
  return PARENT_TAB[route] ?? (route as TabRoute);
}

interface Props {
  current: Route;
  onNavigate: (route: TabRoute) => void;
}

export function BottomNav({ current, onNavigate }: Props) {
  const active = tabFor(current);
  return (
    <nav className="nd-bar nd-bottomnav" aria-label="Navegación principal">
      {TABS.map((tab) => (
        <a
          key={tab.id}
          href={`#${tab.id}`}
          className="nd-bottomnav__item nd-press"
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(tab.id);
          }}
        >
          <Icon name={tab.icon} size={24} strokeWidth={1.9} />
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}

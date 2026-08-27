/**
 * Sidebar · 280px, primary-500, overlay sobre `--bl-overlay`.
 * Secciones con eyebrow: CONSULTANTE / RED / SOPORTE.
 * El ítem actual usa `aria-current="page"` (fondo blanco 45%, texto 800).
 */

import { useEffect, useRef } from 'react';

export type Route =
  | 'ficha'
  | 'bitacora'
  | 'evolucion'
  | 'sesiones'
  | 'profesionales'
  | 'tickets'
  | 'telemetria'
  | 'planificacion';

interface NavDef {
  id: Route;
  label: string;
  icon: string;
}

const SECTIONS: { eyebrow: string; icon: string; items: NavDef[] }[] = [
  {
    eyebrow: 'Consultante',
    icon: '👤',
    items: [
      { id: 'ficha', label: 'Ficha Inicial', icon: '🪪' },
      { id: 'bitacora', label: 'Bitácora Diaria', icon: '💓' },
      { id: 'evolucion', label: 'Evolución', icon: '📈' },
      { id: 'telemetria', label: 'Telemetría', icon: '⌚' },
      { id: 'planificacion', label: 'Planificación', icon: '🗓️' },
    ],
  },
  {
    eyebrow: 'Red',
    icon: '🔗',
    items: [
      { id: 'sesiones', label: 'Sesiones', icon: '🗂️' },
      { id: 'profesionales', label: 'Buscar Profesionales', icon: '🔍' },
    ],
  },
  {
    eyebrow: 'Soporte',
    icon: '🎧',
    items: [{ id: 'tickets', label: 'Mis Tickets', icon: '🎫' }],
  },
];

interface Props {
  open: boolean;
  current: Route;
  subjectName: string;
  onNavigate: (route: Route) => void;
  onClose: () => void;
}

export function Sidebar({ open, current, subjectName, onNavigate, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button className="app-overlay" aria-label="Cerrar menú" onClick={onClose} />
      <div className="app-drawer" ref={panelRef}>
        <nav className="bl-sidebar" aria-label="Navegación principal">
          <div className="bl-sidebar__top">
            <h2>Menú</h2>
            <button
              ref={closeRef}
              className="bl-sidebar__close"
              onClick={onClose}
              aria-label="Cerrar menú"
            >
              ✕
            </button>
          </div>

          <p className="bl-sidebar__user">{subjectName}</p>

          {SECTIONS.map((section) => (
            <div key={section.eyebrow}>
              <p className="bl-sidebar__section">
                <span aria-hidden="true">{section.icon}</span> {section.eyebrow}
              </p>
              {section.items.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="bl-navitem"
                  aria-current={current === item.id ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(item.id);
                  }}
                >
                  <span className="bl-navitem__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </>
  );
}

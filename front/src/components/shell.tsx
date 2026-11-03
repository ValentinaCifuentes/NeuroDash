/**
 * Piezas de chrome: bottom sheet, FAB y toast.
 *
 * El sheet atrapa el foco, cierra con Esc y devuelve el foco al FAB (§3.4).
 */

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

/* ============================================================
   Bottom sheet
   ============================================================ */

interface SheetProps {
  /** Título de la hoja; también la nombra para el lector de pantalla. */
  title: string;
  /** Texto pequeño sobre el título (hojas de Evolución: «Por qué aparece así»). */
  eyebrow?: string;
  /** Ícono de la categoría en un cuadro de su color (hojas de registro). */
  titleIcon?: { name: IconName; color: string };
  onClose: () => void;
  /** Si se entrega, aparece el botón de volver. */
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
  /** Elemento que recupera el foco al cerrar. */
  returnFocusTo?: React.RefObject<HTMLElement>;
}

export function BottomSheet({ title, eyebrow, titleIcon, onClose, onBack, backLabel = 'Volver a categorías', children, returnFocusTo }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
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
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusTo?.current?.focus();
    };
  }, [onClose, returnFocusTo]);

  return (
    <>
      <button type="button" className="nd-overlay" aria-label="Cerrar" onClick={onClose} />
      <div className="nd-sheet" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <span className="nd-sheet__grabber" aria-hidden="true" />
        <div className="nd-sheet__header">
          {onBack && (
            <button type="button" className="nd-sheet__round nd-press" onClick={onBack} aria-label={backLabel}>
              <Icon name="back" size={16} strokeWidth={2.4} />
            </button>
          )}
          <div className="nd-sheet__titles">
            {eyebrow && <span className="nd-sheet__eyebrow">{eyebrow}</span>}
            <h2 id={titleId} className={`nd-sheet__title${titleIcon ? ' nd-sheet__title--icon' : ''}`}>
              {titleIcon && (
                <span className="nd-sheet__titleicon" style={{ background: titleIcon.color }} aria-hidden="true">
                  <Icon name={titleIcon.name} size={16} />
                </span>
              )}
              {title}
            </h2>
          </div>
          <button ref={closeRef} type="button" className="nd-sheet__round nd-press" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={16} strokeWidth={2.4} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/* ============================================================
   FAB
   ============================================================ */

interface FabProps {
  onClick: () => void;
  innerRef?: React.RefObject<HTMLButtonElement>;
}

export function Fab({ onClick, innerRef }: FabProps) {
  return (
    <div className="nd-fabwrap">
      <button
        ref={innerRef}
        className="nd-fab nd-press"
        onClick={onClick}
        aria-label="Registrar un evento"
      >
        <Icon name="plus" size={24} strokeWidth={2.4} />
      </button>
    </div>
  );
}

/* ============================================================
   Toast · confirmaciones breves (§3.2)
   ============================================================ */

export function Toast({ message }: { message: string }) {
  return (
    <div className="nd-toast-wrap">
      <p className="nd-toast" role="status" aria-live="polite">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="var(--nd-accent-soft)" />
          <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--nd-heat-ink-2)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {message}
      </p>
    </div>
  );
}

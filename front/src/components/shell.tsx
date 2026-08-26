/**
 * Piezas de chrome: bottom sheet, FAB y toast.
 *
 * El sheet atrapa el foco, cierra con Esc y devuelve el foco al FAB (§3.4).
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/* ============================================================
   Bottom sheet
   ============================================================ */

interface SheetProps {
  title: ReactNode;
  /** Icono a la izquierda del título; el sheet de detalle lo usa. */
  onClose: () => void;
  /** Si se entrega, aparece la flecha de volver. */
  onBack?: () => void;
  children: ReactNode;
  /** Elemento que recupera el foco al cerrar. */
  returnFocusTo?: React.RefObject<HTMLElement>;
}

export function BottomSheet({ title, onClose, onBack, children, returnFocusTo }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
      <button className="app-overlay" aria-label="Cerrar" onClick={onClose} />
      <div className="app-sheet-wrap" ref={panelRef}>
        <div className="bl-sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Registro'}>
          <div className="bl-sheet__grabber" aria-hidden="true" />
          {onBack && (
            <button className="bl-sheet__back" onClick={onBack} aria-label="Volver a categorías">
              ←
            </button>
          )}
          <button ref={closeRef} className="bl-sheet__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
          {title}
          {children}
        </div>
      </div>
    </>
  );
}

/* ============================================================
   FAB
   ============================================================ */

interface FabProps {
  onClick: () => void;
  aboveCta?: boolean;
  innerRef?: React.RefObject<HTMLButtonElement>;
}

export function Fab({ onClick, aboveCta, innerRef }: FabProps) {
  return (
    <div className={`app-fab${aboveCta ? ' app-fab--above-cta' : ''}`}>
      <button
        ref={innerRef}
        className="bl-fab"
        onClick={onClick}
        aria-label="Registrar un evento"
      >
        +
      </button>
    </div>
  );
}

/* ============================================================
   Toast · confirmaciones breves (§3.2)
   ============================================================ */

export function Toast({ message }: { message: string }) {
  return (
    <div className="app-toast">
      <p className="bl-toast" role="status" aria-live="polite" style={{ margin: 0 }}>
        <span aria-hidden="true">✓</span> {message}
      </p>
    </div>
  );
}

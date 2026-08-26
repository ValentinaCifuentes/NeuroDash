/** App bar · 56px, primary-600, menú izquierda, marca, iniciales derecha. */

interface Props {
  initials: string;
  onOpenMenu: () => void;
}

export function AppBar({ initials, onOpenMenu }: Props) {
  return (
    <header className="bl-appbar">
      <button
        className="bl-appbar__icon"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
        style={{ minWidth: 'var(--bl-tap)', minHeight: 'var(--bl-tap)' }}
      >
        ☰
      </button>
      <span className="bl-appbar__brand">
        <span aria-hidden="true">♡</span> Bluba
      </span>
      <span className="bl-appbar__user">
        {initials} <span aria-hidden="true">▾</span>
        <span className="bl-sr-only">Cuenta de la persona cuidadora</span>
      </span>
    </header>
  );
}

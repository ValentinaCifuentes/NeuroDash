/** App bar · 56px, primary-600, menú izquierda, marca, iniciales derecha. */
import { Icon } from './icons';

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
        <Icon name="menu" size={22} />
      </button>

      <span className="bl-appbar__brand">
        <Icon name="pulse" size={20} /> NeuroDash
      </span>

      <span className="bl-appbar__user" style={{ marginLeft: 'auto' }}>
        <span className="bl-sr-only">Infante seleccionado: </span>
        {initials}
      </span>
    </header>
  );
}

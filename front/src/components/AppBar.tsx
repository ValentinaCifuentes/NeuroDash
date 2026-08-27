/** App bar · 56px, primary-600, menú izquierda, marca, iniciales derecha. */
import { useState } from 'react';

interface Props {
  initials: string;
  onOpenMenu: () => void;
  role?: 'family' | 'professional';
  onToggleRole?: () => void;
}

export function AppBar({ initials, onOpenMenu, role = 'family', onToggleRole }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bl-appbar">
      {role === 'family' && (
        <button
          className="bl-appbar__icon"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
          style={{ minWidth: 'var(--bl-tap)', minHeight: 'var(--bl-tap)' }}
        >
          ☰
        </button>
      )}
      
      <span className="bl-appbar__brand">
        <span aria-hidden="true">♡</span> Bluba
      </span>

      <div style={{ position: 'relative', marginLeft: 'auto' }}>
        <button 
          className="bl-appbar__user" 
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {role === 'professional' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: '8px' }}>
               <strong style={{ fontSize: '0.85rem', lineHeight: 1.1 }}>Pamela PN</strong>
               <span style={{ fontSize: '0.7rem', opacity: 0.8, lineHeight: 1.1 }}>Centro Cienela Pucon DIR</span>
            </div>
          ) : (
            <>{initials}</>
          )}
          <span aria-hidden="true">▾</span>
        </button>
        
        {menuOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            backgroundColor: 'white',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            borderRadius: '4px',
            minWidth: '200px',
            zIndex: 9999,
            overflow: 'hidden'
          }}>
            <button 
              onClick={() => {
                onToggleRole?.();
                setMenuOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '12px 16px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--bl-text)',
                fontSize: '0.9rem'
              }}
            >
              Cambiar a Vista {role === 'family' ? 'Profesional' : 'Familia'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

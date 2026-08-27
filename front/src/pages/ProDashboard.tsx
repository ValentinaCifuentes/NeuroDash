import { useState } from 'react';
import { ProReportes } from './ProReportes';

interface Props {
  onToggleRole: () => void;
}

export function ProDashboard({ onToggleRole }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<'inicio' | 'reportes'>('inicio');

  return (
    <div className="bl-pro-layout">
      {/* HEADER SUPERIOR */}
      <header className="bl-pro-header">
        <div className="bl-pro-brand">
          <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>♡</span> 
          <span>Bluba</span>
        </div>
        
        <div className="bl-pro-header-actions">
          <button className="bl-pro-icon-btn" aria-label="Mensajes">
            💬 <span className="bl-pro-badge">0</span>
          </button>
          <button className="bl-pro-icon-btn" aria-label="Ayuda">❓</button>
          
          <div className="bl-pro-user-menu">
            <button 
              className="bl-pro-user-btn" 
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <div className="bl-pro-user-info">
                <strong>Pamela PN</strong>
                <span>Centro Cienela Pucon DIR</span>
              </div>
              <div className="bl-pro-avatar">PN</div>
              <span aria-hidden="true">▾</span>
            </button>

            {menuOpen && (
              <div className="bl-pro-dropdown">
                <button onClick={() => { onToggleRole(); setMenuOpen(false); }}>
                  Cambiar a Vista Familia
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="bl-pro-body">
        {/* SIDEBAR IZQUIERDO */}
        <aside className="bl-pro-sidebar">
          <nav className="bl-pro-nav">
            <div className={`bl-pro-nav-item ${activeView === 'inicio' ? 'active' : ''}`} onClick={() => setActiveView('inicio')}>
              <span aria-hidden="true">🏠</span> Inicio
            </div>

            <div className="bl-pro-nav-group">GESTIÓN</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">📅</span> Agenda</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">👥</span> Consultantes</div>

            <div className="bl-pro-nav-group">MI CENTRO</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">⚙️</span> Perfil y Logo</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">📋</span> Catálogo de Prestaciones</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">👨‍⚕️</span> Equipo</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">⏱️</span> Disponibilidad</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">🗓️</span> Configuración de Horarios</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">⭐</span> Programas</div>

            <div className="bl-pro-nav-group">ANÁLISIS</div>
            <div className={`bl-pro-nav-item ${activeView === 'reportes' ? 'active' : ''}`} onClick={() => setActiveView('reportes')}><span aria-hidden="true">📈</span> Reportes</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">🏛️</span> Configuración SII</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">📄</span> Documentos Emitidos</div>

            <div className="bl-pro-nav-group">SOPORTE</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">🎫</span> Mis Tickets</div>

            <div className="bl-pro-nav-group">COMUNICACIÓN</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">💬</span> Comunicaciones</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">📢</span> Campañas</div>

            <div className="bl-pro-nav-group">EVALUACIÓN</div>
            <div className="bl-pro-nav-item"><span aria-hidden="true">📝</span> Pautas y Evaluaciones</div>
          </nav>
        </aside>

        {/* CONTENIDO PRINCIPAL */}
        <main className="bl-pro-main" style={activeView === 'reportes' ? { padding: '1.5rem', display: 'flex', flexDirection: 'column' } : {}}>
          {activeView === 'reportes' && <ProReportes />}
          {activeView === 'inicio' && (
            <>
          {/* BANNER PLAN ACTUAL */}
          <section className="bl-pro-banner">
            <div className="bl-pro-banner-left">
              <div className="bl-pro-banner-icon">👑</div>
              <div>
                <span className="bl-pro-banner-title">PLAN ACTUAL</span>
                <h2>Inicia</h2>
                <span className="bl-pro-tag bl-pro-tag--blue">👥 Hasta 30 consultantes activos</span>
              </div>
            </div>
            <div className="bl-pro-banner-right">
              <div className="bl-pro-status">
                <span className="bl-pro-check">✓</span> Suscripción activa
              </div>
              <button className="bl-pro-btn-orange">Ver planes</button>
            </div>
          </section>

          {/* GRILLA DE TARJETAS */}
          <div className="bl-pro-grid">
            <ProCard icon="🚸" iconBg="#1e3a8a" title="Consultantes activos" value="0" tag="👥 Activos" tagColor="blue" />
            <ProCard icon="👨‍⚕️" iconBg="#059669" title="Profesionales activos" value="1" tag="👥 Equipo" tagColor="teal" />
            <ProCard icon="📅" iconBg="#3b82f6" title="Sesiones de la semana" value="0" tag="📅 Hasta 30/08" tagColor="blue" />
            
            <ProCard icon="📅" iconBg="#f59e0b" title="Reservas sin pagar" value="0" subtitle="Sesiones" subtitle2="👥 Consultantes: 0" tag="⚠️ Pendientes" tagColor="yellow" />
            <ProCard icon="❗" iconBg="#ef4444" title="Sesiones sin pagar" value="0" subtitle="Sesiones" subtitle2="👥 Consultantes: 0" tag="🚫 Urgente" tagColor="red" />
            <ProCard icon="📅" iconBg="#10b981" title="Sesiones pendiente confirmar" value="0" subtitle="Sesiones" subtitle2="👥 Consultantes: 0" tag="✓ Hoy y futuras" tagColor="green" />
            
            <ProCard icon="⚠️" iconBg="#8b5cf6" title="Sesiones por regularizar" value="0" subtitle="Sesiones" subtitle2="👥 Consultantes: 0" tag="⚙️ Acción requerida" tagColor="purple" />
            <ProCard icon="🎯" iconBg="#10b981" title="Objetivos por validar" value="0" tag="👁️ Revisión" tagColor="green" />
            <ProCard icon="📈" iconBg="#4b5563" title="PreAvances por validar" value="0" tag="⌛ En progreso" tagColor="gray" />
            
            <ProCard icon="📄" iconBg="#8b5cf6" title="Informes por validar" value="0" tag="👁️ Validación" tagColor="purple" />
          </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ProCard({ 
  icon, iconBg, title, value, subtitle, subtitle2, tag, tagColor 
}: { 
  icon: string, iconBg: string, title: string, value: string, 
  subtitle?: string, subtitle2?: string, tag: string, tagColor: string 
}) {
  return (
    <div className="bl-pro-card">
      <div className="bl-pro-card-icon" style={{ backgroundColor: iconBg }}>{icon}</div>
      <h3 className="bl-pro-card-title">{title}</h3>
      <div className="bl-pro-card-value">{value}</div>
      {subtitle && <div className="bl-pro-card-sub">{subtitle}</div>}
      {subtitle2 && <div className="bl-pro-card-sub">{subtitle2}</div>}
      <div className={`bl-pro-card-tag bl-pro-tag--${tagColor}`}>{tag}</div>
    </div>
  );
}

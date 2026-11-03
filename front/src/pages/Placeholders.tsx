/**
 * Rutas del menú que quedan fuera del alcance actual de
 * NeuroDash. Se resuelven con estado vacío en vez de enlace muerto:
 * "el vacío invita a actuar" (§3.2).
 */

import type { Subject } from '../types';
import { Icon } from '../components/icons';

interface Props {
  subject: Subject;
  /** Mis Tickets se abre desde Ficha › Ayuda y soporte (no es una pestaña). */
  onOpenTickets: () => void;
}

const DEFERRED_FEATURE_MESSAGE = 'Esta funcionalidad está fuera del alcance actual de NeuroDash.';

export function FichaInicial({ subject, onOpenTickets }: Props) {
  return (
    <div className="app-shell__content">
      <section className="bl-card">
        <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-4)' }}>
          Contexto clínico
        </p>
        <dl style={{ margin: 0, display: 'grid', gap: 'var(--bl-sp-4)' }}>
          <Row label="Identificador" value={subject.subject_id} />
          <Row label="Rango de edad" value={subject.age_range} />
          <Row label="Diagnóstico principal" value={subject.diagnosis} />
          <Row label="Perfil sensorial predominante" value={subject.sensory_profile} />
        </dl>
      </section>

      <div className="bl-alert bl-alert--info">
        <Icon name="info" size={18} />
        <span>
          El perfil sensorial entra al motor como ejes continuos, no como etiqueta, para que el
          aprendizaje pueda cruzarse entre casos.
        </span>
      </div>

      <section aria-labelledby="ficha-soporte">
        <p id="ficha-soporte" className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-2)' }}>
          Ayuda y soporte
        </p>
        <button type="button" className="bl-option" onClick={onOpenTickets}>
          <Icon name="support" size={20} />
          <span className="bl-option__label">Mis Tickets</span>
          <Icon name="chevronRight" size={14} strokeWidth={2.6} style={{ color: 'var(--nd-chevron)' }} />
        </button>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt
        style={{
          fontSize: 'var(--bl-fs-xs)',
          color: 'var(--bl-text-muted)',
          marginBottom: 4,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, color: 'var(--bl-text)', fontWeight: 600 }}>{value}</dd>
    </div>
  );
}

export function MisTickets() {
  return (
    <div className="app-shell__content">
      <section className="bl-card">
        <div className="bl-empty">
          <b>Funcionalidad no disponible</b>
          {DEFERRED_FEATURE_MESSAGE}
        </div>
      </section>
    </div>
  );
}

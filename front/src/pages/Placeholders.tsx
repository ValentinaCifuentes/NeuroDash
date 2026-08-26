/**
 * Rutas del menú que existen en BLUBA pero quedan fuera del alcance de
 * NeuraDash. Se resuelven con estado vacío en vez de enlace muerto:
 * "el vacío invita a actuar" (§3.2).
 */

import type { Subject } from '../types';

interface Props {
  subject: Subject;
}

export function FichaInicial({ subject }: Props) {
  return (
    <div className="app-shell__content">
      <section className="bl-card">
        <h1 className="bl-card__title">Ficha Inicial</h1>
        <p className="bl-card__sub">
          Perfil de <strong>{subject.display_name}</strong>
        </p>
      </section>

      <section className="bl-card">
        <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-4)' }}>
          <span aria-hidden="true">🪪</span> Contexto clínico
        </p>
        <dl style={{ margin: 0, display: 'grid', gap: 'var(--bl-sp-4)' }}>
          <Row label="Identificador" value={subject.subject_id} />
          <Row label="Rango de edad" value={subject.age_range} />
          <Row label="Diagnóstico principal" value={subject.diagnosis} />
          <Row label="Perfil sensorial predominante" value={subject.sensory_profile} />
        </dl>
      </section>

      <div className="bl-alert bl-alert--info">
        <span aria-hidden="true">ℹ️</span>
        <span>
          El perfil sensorial entra al motor como ejes continuos, no como etiqueta, para que el
          aprendizaje pueda cruzarse entre casos.
        </span>
      </div>
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

export function BuscarProfesionales() {
  return (
    <div className="app-shell__content">
      <section className="bl-card">
        <h1 className="bl-card__title">Buscar Profesionales</h1>
        <p className="bl-card__sub">Red de apoyo del consultante</p>
      </section>
      <section className="bl-card">
        <div className="bl-empty">
          <b>Aún no hay profesionales vinculados</b>
          Vincula al equipo tratante para compartir la bitácora con ellos.
        </div>
      </section>
    </div>
  );
}

export function MisTickets() {
  return (
    <div className="app-shell__content">
      <section className="bl-card">
        <h1 className="bl-card__title">Mis Tickets</h1>
        <p className="bl-card__sub">Solicitudes al equipo de soporte</p>
      </section>
      <section className="bl-card">
        <div className="bl-empty">
          <b>No tienes tickets abiertos</b>
          Cuando abras uno, aparecerá acá con su estado y respuestas.
        </div>
      </section>
    </div>
  );
}

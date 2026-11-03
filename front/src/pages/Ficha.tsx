/**
 * Ficha inicial y Mis Tickets (screens/Final-Ficha.html, Final-Tickets.html).
 *
 * La Ficha muestra el perfil completo (`GET /subjects/{id}`, que App pide al
 * elegir al infante). Mis Tickets se abre desde «Ayuda y soporte»; no es una
 * pestaña y queda fuera del alcance actual.
 */

import type { Subject } from '../types';
import { Icon } from '../components/icons';
import { NavRow } from '../components/NavRow';
import { clinicalRows, dailyRows, type ProfileRow } from '../domain/profile';

interface Props {
  subject: Subject;
  onOpenTickets: () => void;
}

export function FichaInicial({ subject, onOpenTickets }: Props) {
  const daily = dailyRows(subject);
  return (
    <div className="nd-screen">
      <section className="nd-card nd-profile" aria-labelledby="ficha-clinico">
        <h2 id="ficha-clinico" className="nd-eyebrow nd-eyebrow--flat">
          Contexto clínico
        </h2>
        <ProfileList rows={clinicalRows(subject)} />
      </section>

      {daily.length > 0 && (
        <section className="nd-card nd-profile" aria-labelledby="ficha-dia">
          <h2 id="ficha-dia" className="nd-eyebrow nd-eyebrow--flat">
            Su día a día
          </h2>
          <ProfileList rows={daily} stacked />
        </section>
      )}

      <div role="note" className="nd-note">
        <Icon name="info" size={20} />
        <p>
          El perfil sensorial y lo que le ayuda se usan para elegir los apoyos de «Qué puedo hacer ahora».
          Todavía no entran a la estimación.
        </p>
      </div>

      <section className="nd-profile__support" aria-labelledby="ficha-soporte">
        <h2 id="ficha-soporte" className="nd-eyebrow nd-eyebrow--flat">
          Ayuda y soporte
        </h2>
        <NavRow icon="support" title="Mis Tickets" summary="Solicitudes al equipo de soporte" onClick={onOpenTickets} />
      </section>
    </div>
  );
}

/** Filas etiqueta–valor. `stacked`: el valor bajo la etiqueta, para listas largas. */
function ProfileList({ rows, stacked = false }: { rows: ProfileRow[]; stacked?: boolean }) {
  return (
    <dl className={`nd-profile__list${stacked ? ' nd-profile__list--stacked' : ''}`}>
      {rows.map((row) => (
        <div key={row.label} className="nd-profile__row">
          <dt>{row.label}</dt>
          <dd className={row.value === null ? 'nd-profile__empty' : row.mono ? 'nd-profile__mono' : undefined}>
            {row.value ?? 'Sin registrar'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MisTickets() {
  return (
    <div className="nd-screen">
      <section className="nd-card nd-unavailable">
        <span className="nd-unavailable__icon" aria-hidden="true">
          <Icon name="support" size={28} />
        </span>
        <b>Funcionalidad no disponible</b>
        <p>Esta funcionalidad está fuera del alcance actual de NeuroDash.</p>
      </section>
    </div>
  );
}

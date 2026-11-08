/**
 * Selección de infante (screens/Final-Seleccion.html).
 *
 * Lista con avatar e iniciales y una tarjeta «Agregar infante»: con el alias
 * se puede crear al tiro («Guardar y seleccionar») o abrir el perfil
 * completo en 3 pasos (`pages/Onboarding.tsx`).
 */

import { useState } from 'react';
import { Onboarding } from '../pages/Onboarding';
import { buildOnboardingInput, EMPTY_PROFILE } from '../domain/onboarding';
import { Icon } from './icons';
import type { Subject, SubjectOnboardingInput } from '../types';

type SubjectGateProps = {
  subjects: Subject[];
  onSelect: (subject: Subject) => void;
  onOnboard: (input: SubjectOnboardingInput) => Promise<void>;
};

/** Colores de avatar del prototipo, en orden: cerezo, ámbar, pizarra. */
const AVATAR_TONES = [
  { bg: 'var(--nd-accent-soft)', fg: 'var(--nd-accent-ink)' },
  { bg: 'var(--nd-risk-mid-bg)', fg: 'var(--nd-risk-mid-fg)' },
  { bg: '#ECEEF3', fg: '#2E4760' },
];

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function SubjectGate({ subjects, onSelect, onOnboard }: SubjectGateProps) {
  const [alias, setAlias] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  async function quickCreate() {
    setSaving(true);
    setError(null);
    try {
      await onOnboard(buildOnboardingInput({ ...EMPTY_PROFILE, alias }, timezone()));
    } catch (reason) {
      const message = (reason as { message?: string })?.message;
      setError(message || 'No se pudo crear el infante. Inténtalo otra vez.');
    } finally {
      setSaving(false);
    }
  }

  if (profileOpen) {
    return (
      <main className="nd-shell__scroll nd-gate" id="contenido">
        <Onboarding initialAlias={alias} onCancel={() => setProfileOpen(false)} onCreate={onOnboard} />
      </main>
    );
  }

  const hasAlias = alias.trim().length > 0;

  return (
    <main className="nd-shell__scroll nd-gate" id="contenido">
      <div className="nd-gate__intro">
        <span className="nd-gate__mark" aria-hidden="true">
          <Icon name="pulse" size={28} strokeWidth={2.2} />
        </span>
        <h1 id="gate-titulo">Selecciona al infante</h1>
        <p>Elige al infante antes de registrar información o solicitar una estimación.</p>
      </div>

      {subjects.length > 0 && (
        <ul className="nd-gate__list" aria-labelledby="gate-titulo">
          {subjects.map((subject, i) => {
            const tone = AVATAR_TONES[i % AVATAR_TONES.length];
            return (
              <li key={subject.subject_id}>
                <button type="button" className="nd-gate__row nd-press" onClick={() => onSelect(subject)}>
                  <span className="nd-gate__avatar" style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">
                    {subject.initials}
                  </span>
                  <span className="nd-gate__name">{subject.display_name}</span>
                  <Icon name="chevronRight" size={18} className="nd-gate__chevron" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <section className="nd-qcard" aria-labelledby="crear-titulo">
        <h2 id="crear-titulo" className="nd-gate__addtitle">
          <Icon name="plus" size={18} strokeWidth={2.4} /> Agregar infante
        </h2>
        <label className="nd-fieldlabel" htmlFor="nuevo-alias">
          Nombre o alias del infante
        </label>
        <input
          id="nuevo-alias"
          type="text"
          className="nd-field"
          autoComplete="off"
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
        />
        {error && (
          <p className="nd-onboarding__error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="nd-cta nd-press" disabled={!hasAlias || saving} onClick={quickCreate}>
          {saving ? 'Guardando…' : 'Guardar y seleccionar'}
        </button>
        <button type="button" className="nd-linkbutton nd-press" onClick={() => setProfileOpen(true)}>
          Completar su perfil en 3 pasos
        </button>
      </section>
    </main>
  );
}

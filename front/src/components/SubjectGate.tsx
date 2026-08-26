import { useState } from 'react';
import type { Subject, SubjectOnboardingInput } from '../types';

type SubjectGateProps = {
  subjects: Subject[];
  onSelect: (subject: Subject) => void;
  onOnboard: (input: SubjectOnboardingInput) => Promise<void>;
};

export function SubjectGate({ subjects, onSelect, onOnboard }: SubjectGateProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await onOnboard({
        display_name: name,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        baseline: {},
        provenance: { source: 'caregiver_onboarding', synthetic: false },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo crear el consultante. Inténtalo otra vez.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell__scroll" id="contenido">
      <section className="bl-card app-stack--tight" aria-labelledby="subject-gate-title">
        <h1 id="subject-gate-title">Selecciona un consultante</h1>
        <p>Elige un consultante antes de registrar información o solicitar una estimación.</p>
        {error && <p role="alert">{error}</p>}
        {subjects.map((subject) => (
          <button key={subject.subject_id} type="button" onClick={() => onSelect(subject)}>
            {subject.display_name}
          </button>
        ))}
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)}>Crear consultante</button>
        ) : (
          <div className="app-stack--tight">
            <label>
              Nombre del consultante
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <button type="button" disabled={saving} onClick={submit}>Guardar y seleccionar</button>
          </div>
        )}
      </section>
    </main>
  );
}

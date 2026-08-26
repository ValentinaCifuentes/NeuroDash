/**
 * Bitácora Diaria.
 *
 * Jerarquía de registro (§3.3):
 *   1 Contexto  → card de encabezado
 *   2 Modo      → tabs
 *   3 Dominio   → eyebrow + bloque
 *   4 Dato      → opción, switch, slider
 *   5 Cierre    → botón primario anclado
 *
 * Los eventos puntuales no viven en este flujo: entran por FAB → sheet.
 */

import { useEffect, useState } from 'react';
import { OptionGroup, Switch, Tabs } from '../components/controls';
import {
  GI_CHOICES,
  SEMANTIC_BG,
  SEMANTIC_COLOR,
  SLEEP_CHOICES,
  WAKE_CHOICES,
  formatTime,
} from '../domain/catalog';
import { getTimeline } from '../api';
import type {
  DailyRecord,
  GiStatus,
  SleepQuality,
  Subject,
  TimelineEntry,
  WakeMode,
} from '../types';

type TabId = 'basal' | 'historial';

interface Props {
  subject: Subject;
  /** Se incrementa cada vez que se guarda algo: fuerza recarga del historial. */
  revision: number;
  saving: boolean;
  onSaveBasal: (record: DailyRecord) => void;
}

export function BitacoraDiaria({ subject, revision, saving, onSaveBasal }: Props) {
  const [tab, setTab] = useState<TabId>('basal');

  const [sleep, setSleep] = useState<SleepQuality | null>('Reparador');
  const [wake, setWake] = useState<WakeMode | null>(null);
  const [medTaken, setMedTaken] = useState(false);
  const [medNotApplicable, setMedNotApplicable] = useState(false);
  const [gi, setGi] = useState<GiStatus | null>('Normal');

  const today = new Date().toISOString().slice(0, 10);

  function save() {
    onSaveBasal({
      subject_id: subject.subject_id,
      date: today,
      sleep_quality: sleep,
      wake_mode: wake,
      medication_adherence: medNotApplicable ? 'No Aplica' : medTaken ? 'Sí' : 'No',
      gi_status: gi,
    });
  }

  return (
    <>
      <div className="app-shell__content app-shell__content--cta">
        {/* 1 · Contexto */}
        <section className="bl-card">
          <h1 className="bl-card__title">Bitácora Diaria</h1>
          <p className="bl-card__sub">
            Registra el estado basal y eventos cotidianos de{' '}
            <strong>{subject.display_name}</strong>
          </p>
        </section>

        {/* 2 · Modo */}
        <Tabs
          label="Vista de la bitácora"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'basal', label: 'Mi Día (Estado Basal)', icon: '⚙️' },
            { id: 'historial', label: 'Historial de Hoy', icon: '↺' },
          ]}
        />

        {tab === 'basal' ? (
          <>
            {/* 3–4 · Dominios y datos */}
            <section className="bl-card">
              <div className="bl-card__header">
                <span className="bl-icon-tile" aria-hidden="true">
                  💓
                </span>
                <h2>¿Cómo estuvo el día de hoy?</h2>
              </div>

              <div className="app-stack">
                <OptionGroup
                  eyebrow="Descanso nocturno"
                  eyebrowIcon="🛏️"
                  legend="¿Cómo durmió anoche?"
                  choices={SLEEP_CHOICES}
                  value={sleep}
                  onChange={setSleep}
                />
                <OptionGroup
                  eyebrow="Al despertar"
                  eyebrowIcon="☀️"
                  legend="¿Con qué ánimo despertó?"
                  choices={WAKE_CHOICES}
                  value={wake}
                  onChange={setWake}
                />
              </div>
            </section>

            <section className="bl-card">
              <p className="bl-eyebrow" style={{ margin: 0 }}>
                <span aria-hidden="true">💊</span> Tratamiento
              </p>
              <h2
                style={{
                  margin: 'var(--bl-sp-1) 0 var(--bl-sp-4)',
                  fontSize: 'var(--bl-fs-h2)',
                  color: 'var(--bl-text)',
                }}
              >
                Adherencia a la Medicación
              </h2>
              <Switch
                label="¿Se tomó los medicamentos de hoy?"
                checked={medTaken}
                disabled={medNotApplicable}
                onChange={setMedTaken}
              />
              <button
                className="bl-btn bl-btn--ghost"
                style={{ marginTop: 'var(--bl-sp-2)', padding: '10px 0' }}
                aria-pressed={medNotApplicable}
                onClick={() => setMedNotApplicable((v) => !v)}
              >
                {medNotApplicable
                  ? '✓ Marcado como «No aplica»'
                  : 'No aplica para este consultante'}
              </button>
            </section>

            <section className="bl-card">
              <p className="bl-eyebrow" style={{ margin: 0 }}>
                <span aria-hidden="true">🩺</span> Digestión
              </p>
              <h2
                style={{
                  margin: 'var(--bl-sp-1) 0 var(--bl-sp-4)',
                  fontSize: 'var(--bl-fs-h2)',
                  color: 'var(--bl-text)',
                }}
              >
                Salud Gastrointestinal
              </h2>
              <div role="radiogroup" aria-label="Salud gastrointestinal">
                {GI_CHOICES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={gi === choice.value}
                    className="bl-option"
                    onClick={() => setGi(choice.value)}
                  >
                    <span
                      className="bl-dot"
                      style={{ background: SEMANTIC_COLOR[choice.dot!] }}
                      aria-hidden="true"
                    />
                    <span className="bl-option__label">{choice.label}</span>
                    <span className="bl-option__mark" aria-hidden="true">
                      ✓
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <HistorialHoy subjectId={subject.subject_id} revision={revision} />
        )}
      </div>

      {/* 5 · Cierre — una sola acción principal por pantalla */}
      {tab === 'basal' && (
        <div className="app-cta">
          <button
            className="bl-btn bl-btn--primary bl-btn--block"
            disabled={saving || !sleep || !gi}
            onClick={save}
          >
            {saving ? (
              <>
                <span className="bl-spinner" aria-hidden="true" /> Guardando…
              </>
            ) : (
              <>
                <span aria-hidden="true">🔒</span> Guardar Estado Basal
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Historial de Hoy
   ============================================================ */

function HistorialHoy({ subjectId, revision }: { subjectId: string; revision: number }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    getTimeline(subjectId, new Date().toISOString(), 1)
      .then((res) => alive && setEntries(res.entries))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [subjectId, revision]);

  if (entries === null) {
    return (
      <section className="bl-card app-stack--tight" aria-busy="true">
        <span className="bl-sr-only">Cargando el historial de hoy</span>
        <div className="bl-skeleton" style={{ width: '55%' }} />
        <div className="bl-skeleton" />
        <div className="bl-skeleton" style={{ width: '75%' }} />
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section className="bl-card">
        <div className="bl-empty">
          <b>Aún no hay registros de hoy</b>
          Guarda el estado basal o toca <span aria-hidden="true">+</span> para anotar un evento.
        </div>
      </section>
    );
  }

  return (
    <section className="bl-card">
      <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-4)' }}>
        <span aria-hidden="true">↺</span> {entries.length} registro
        {entries.length === 1 ? '' : 's'} hoy
      </p>
      <ul className="app-log__list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {entries.map((entry) => (
          <li key={entry.entry_id} className="app-log">
            <span
              className="app-log__icon"
              style={{
                background: SEMANTIC_BG[entry.semantic],
                color: SEMANTIC_COLOR[entry.semantic],
              }}
              aria-hidden="true"
            >
              {entry.kind === 'daily_record' ? '💓' : '⚡'}
            </span>
            <div className="app-log__body">
              <div className="app-log__head">
                <span className="app-log__title">{entry.title}</span>
                <span className="app-log__time">{formatTime(entry.timestamp)}</span>
              </div>
              {entry.detail && <p className="app-log__meta">{entry.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

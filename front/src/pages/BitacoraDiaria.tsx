/**
 * Bitácora Diaria · Mi Día (screens/Final-Bitacora.html).
 *
 * 1. ¿Cómo estuvo el día de hoy? — sueño, despertar y autonomía (ChoiceTiles).
 * 2. Medicación — interruptor + «No aplica».
 * 3. Digestión — ShapeList.
 * 4. ¿Pasó algo distinto hoy? — contexto del día en chips (plan de datos, Fase 3).
 * 5. «Guardar Estado Basal», con el + de registro rápido al lado.
 *
 * Nada viene preseleccionado (P13): lo que el tutor no responde no se envía, y
 * un día sin dato nunca se confunde con un día «normal». Guardar exige sueño y
 * despertar, los datos de la Bitácora que cuentan para la confianza.
 */

import { useEffect, useState, type RefObject } from 'react';
import { ChipGroup, ChoiceTiles, SegmentedTabs, ShapeList, Switch } from '../components/controls';
import {
  DEFAULT_EARLY_SIGNS,
  GI_CHOICES,
  NO_DISCOMFORT,
  NO_EARLY_SIGNS,
  PHYSICAL_DISCOMFORT_OPTIONS,
  ROUTINE_CHANGE_OPTIONS,
  SCHOOL_ATTENDANCE_OPTIONS,
  SLEEP_CHOICES,
  SLEEP_HOURS_OPTIONS,
  START_AUTONOMY_CHOICES,
  WAKE_CHOICES,
  formatTime,
  todayIso,
} from '../domain/catalog';
import { getTimeline } from '../api';
import { todayRows } from '../domain/history';
import type {
  ApiError,
  DailyRecord,
  GiStatus,
  MedicationAdherence,
  SleepQuality,
  StartAutonomy,
  Subject,
  TimelineEntry,
  WakeMode,
} from '../types';
import { Icon } from '../components/icons';
import { Fab } from '../components/shell';

type TabId = 'basal' | 'historial';

interface Props {
  subject: Subject;
  /** Se incrementa cada vez que se guarda algo: fuerza recarga del historial. */
  revision: number;
  saving: boolean;
  /** Devuelve true si se guardó; con false (error) se reintenta con la misma clave. */
  onSaveBasal: (record: DailyRecord) => Promise<boolean> | void;
  /** Abre la hoja de categorías («+»). */
  onAddEvent?: () => void;
  /** El «+» recibe el foco al cerrar la hoja. */
  fabRef?: RefObject<HTMLButtonElement>;
}

export function BitacoraDiaria({ subject, revision, saving, onSaveBasal, onAddEvent, fabRef }: Props) {
  const [tab, setTab] = useState<TabId>('basal');

  return (
    <div className="nd-screen">
      <SegmentedTabs
        label="Vista de la bitácora"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'basal', label: 'Mi Día (Estado Basal)' },
          { id: 'historial', label: 'Historial de Hoy' },
        ]}
      />

      {tab === 'basal' ? (
        <MiDia subject={subject} saving={saving} onSaveBasal={onSaveBasal} onAddEvent={onAddEvent} fabRef={fabRef} />
      ) : (
        <>
          <HistorialHoy subjectId={subject.subject_id} revision={revision} />
          {onAddEvent && <Fab innerRef={fabRef} onClick={onAddEvent} />}
        </>
      )}
    </div>
  );
}

function MiDia({
  subject,
  saving,
  onSaveBasal,
  onAddEvent,
  fabRef,
}: Omit<Props, 'revision'>) {
  const [sleep, setSleep] = useState<SleepQuality | null>(null);
  const [wake, setWake] = useState<WakeMode | null>(null);
  const [autonomy, setAutonomy] = useState<StartAutonomy | null>(null);
  /** null = no se tocó: no se envía. */
  const [medication, setMedication] = useState<MedicationAdherence | null>(null);
  const [gi, setGi] = useState<GiStatus | null>(null);
  const [sleepHours, setSleepHours] = useState<string | null>(null);
  const [earlySigns, setEarlySigns] = useState<string[]>([]);
  const [discomfort, setDiscomfort] = useState<string[]>([]);
  const [routineChange, setRoutineChange] = useState<string | null>(null);
  const [school, setSchool] = useState<string | null>(null);
  /** P2: una clave por guardado; se reutiliza si el intento falla. */
  const [saveKey, setSaveKey] = useState(() => crypto.randomUUID());

  const missing = [!sleep && 'sueño', !wake && 'despertar'].filter(Boolean) as string[];
  const canSave = missing.length === 0 && !saving;

  async function save() {
    const saved = await onSaveBasal({
      subject_id: subject.subject_id,
      date: todayIso(),
      sleep_quality: sleep,
      wake_mode: wake,
      start_autonomy: autonomy,
      medication_adherence: medication,
      gi_status: gi,
      sleep_hours_range: sleepHours,
      early_signs: earlySigns,
      physical_discomfort: discomfort,
      routine_change: routineChange,
      school_attendance: school,
      idempotency_key: saveKey,
    });
    if (saved !== false) setSaveKey(crypto.randomUUID());
  }

  return (
    <>
      <section className="nd-card nd-card--questions" aria-labelledby="dia-titulo">
        <h2 id="dia-titulo" className="nd-cardtitle nd-cardtitle--lg">¿Cómo estuvo el día de hoy?</h2>
        <ChoiceTiles eyebrow="Descanso nocturno" legend="¿Cómo durmió anoche?" choices={SLEEP_CHOICES} value={sleep} onChange={setSleep} />
        <ChoiceTiles eyebrow="Forma de despertar" legend="¿Cómo despertó el día de hoy?" choices={WAKE_CHOICES} value={wake} onChange={setWake} />
        <ChoiceTiles
          eyebrow="La transición / autonomía"
          legend="¿Necesitó ayuda para iniciar el día?"
          choices={START_AUTONOMY_CHOICES}
          value={autonomy}
          onChange={setAutonomy}
        />
      </section>

      <section className="nd-card" aria-labelledby="med-titulo">
        <span className="nd-eyebrow nd-eyebrow--flat">Tratamiento</span>
        <h2 id="med-titulo" className="nd-cardtitle">Adherencia a la Medicación</h2>
        <Switch
          label="¿Se tomó los medicamentos de hoy?"
          checked={medication === 'Sí'}
          disabled={medication === 'No Aplica'}
          onChange={(taken) => setMedication(taken ? 'Sí' : 'No')}
        />
        <button
          type="button"
          className="nd-linkbutton nd-linkbutton--start nd-press"
          aria-pressed={medication === 'No Aplica'}
          onClick={() => setMedication((value) => (value === 'No Aplica' ? null : 'No Aplica'))}
        >
          {medication === 'No Aplica' ? 'Marcado como «No aplica»' : 'No aplica para este infante'}
        </button>
      </section>

      <section className="nd-card" aria-labelledby="gi-titulo">
        <span className="nd-eyebrow nd-eyebrow--flat">Digestión</span>
        <h2 id="gi-titulo" className="nd-cardtitle">Salud Gastrointestinal</h2>
        <ShapeList label="Salud gastrointestinal" choices={GI_CHOICES} value={gi} onChange={setGi} />
      </section>

      <section className="nd-card nd-card--questions" aria-labelledby="ctx-titulo">
        <div className="nd-card__intro">
          <span className="nd-eyebrow nd-eyebrow--flat">Contexto del día</span>
          <h2 id="ctx-titulo" className="nd-cardtitle">¿Pasó algo distinto hoy?</h2>
          <p className="nd-card__hint">Un toque por pregunta. Ayuda a anticipar mejor las próximas horas.</p>
        </div>
        <ChipGroup mode="single" legendStyle="section" legend="¿Cuántas horas durmió?" options={SLEEP_HOURS_OPTIONS} value={sleepHours} onChange={setSleepHours} />
        <ChipGroup
          mode="multiple"
          legendStyle="section"
          legend="¿Viste alguna de sus señales tempranas?"
          hint="Las señales salen de su perfil. Puedes marcar varias."
          options={[...DEFAULT_EARLY_SIGNS, NO_EARLY_SIGNS]}
          exclusive={NO_EARLY_SIGNS}
          value={earlySigns}
          onChange={setEarlySigns}
        />
        <ChipGroup
          mode="multiple"
          legendStyle="section"
          legend="¿Tuvo algún malestar físico?"
          hint="Puedes marcar varios."
          options={PHYSICAL_DISCOMFORT_OPTIONS}
          exclusive={NO_DISCOMFORT}
          value={discomfort}
          onChange={setDiscomfort}
        />
        <ChipGroup mode="single" legendStyle="section" legend="¿Hubo un cambio de rutina?" options={ROUTINE_CHANGE_OPTIONS} value={routineChange} onChange={setRoutineChange} />
        <ChipGroup mode="single" legendStyle="section" legend="¿Asistió al colegio?" options={SCHOOL_ATTENDANCE_OPTIONS} value={school} onChange={setSchool} />
      </section>

      <div className="nd-ctabar">
        {missing.length > 0 && (
          <p id="guardar-falta" className="nd-ctabar__hint">
            Para guardar falta: {missing.join(' y ')}
          </p>
        )}
        <button
          type="button"
          className="nd-cta nd-press"
          disabled={!canSave}
          aria-describedby={missing.length > 0 ? 'guardar-falta' : undefined}
          onClick={save}
        >
          {saving ? (
            <>
              <span className="bl-spinner" aria-hidden="true" /> Guardando…
            </>
          ) : (
            <>
              <Icon name="lock" size={18} /> Guardar Estado Basal
            </>
          )}
        </button>
        {onAddEvent && (
          <button ref={fabRef} type="button" className="nd-fab nd-press" aria-label="Registrar un evento" onClick={onAddEvent}>
            <Icon name="plus" size={24} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </>
  );
}

/* ============================================================
   Historial de Hoy
   ============================================================ */

function HistorialHoy({ subjectId, revision }: { subjectId: string; revision: number }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    setError(null);
    getTimeline(subjectId, new Date().toISOString(), 1)
      .then((res) => alive && setEntries(res.entries))
      .catch((reason: ApiError) => alive && setError(reason));
    return () => {
      alive = false;
    };
  }, [subjectId, revision, attempt]);

  if (entries === null) {
    if (error) {
      return (
        <section className="nd-card nd-history" role="alert">
          <p className="nd-history__message">{error.message}</p>
          <button type="button" className="nd-button-outline nd-press" onClick={() => setAttempt((value) => value + 1)}>
            Reintentar historial
          </button>
        </section>
      );
    }
    return (
      <section className="nd-card nd-history" aria-busy="true">
        <span className="nd-sr-only" role="status">Cargando el historial de hoy</span>
        <div className="nd-skeleton" style={{ width: '40%' }} />
        <div className="nd-skeleton nd-skeleton--row" />
        <div className="nd-skeleton nd-skeleton--row" />
      </section>
    );
  }

  const rows = todayRows(entries, todayIso());

  if (rows.length === 0) {
    return (
      <section className="nd-card nd-history nd-history--empty">
        <p className="nd-history__title">Aún no hay registros de hoy</p>
        <p className="nd-history__message">Guarda el estado basal o toca + para anotar un evento.</p>
      </section>
    );
  }

  return (
    <section className="nd-card nd-history" aria-labelledby="hist-titulo">
      <h2 id="hist-titulo" className="nd-eyebrow nd-eyebrow--flat">
        {rows.length} {rows.length === 1 ? 'registro' : 'registros'} hoy
      </h2>
      <ul className="nd-history__list">
        {rows.map((row) => (
          <li key={row.id} className="nd-history__row">
            <span className="nd-history__icon" style={{ background: row.tint, color: row.color }} aria-hidden="true">
              <Icon name={row.icon} size={18} />
            </span>
            <div className="nd-history__body">
              <div className="nd-history__head">
                <span className="nd-history__name">{row.title}</span>
                <time className="nd-history__time" dateTime={row.timestamp}>
                  {formatTime(row.timestamp)}
                </time>
              </div>
              {row.summary && <p className="nd-history__summary">{row.summary}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

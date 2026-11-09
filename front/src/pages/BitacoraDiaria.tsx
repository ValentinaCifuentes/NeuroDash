/**
 * Bitácora Diaria · Mi Día (screens/Final-Bitacora.html).
 *
 * 1. «¿Cómo va el día de hoy?» — título general de la bitácora (fuera de la tarjeta).
 * 2. Descanso nocturno — sueño, despertar y autonomía (ChoiceTiles).
 * 3. Medicación — interruptor + «No aplica».
 * 4. Digestión — ShapeList.
 * 5. Contexto del día — chips (plan de datos, Fase 3), en un desplegable cerrado y
 *    marcado como opcional: se guarda, pero todavía no cambia la estimación (P32).
 * 6. «Guardar Estado Basal», con el + de registro rápido al lado.
 *
 * Nada viene preseleccionado (P13): lo que el tutor no responde no se envía. El
 * estado basal se guarda **por partes**: cada «Guardar» crea un registro con lo
 * que respondió, y en «Mi Día» solo queda lo que falta. Lo ya guardado se ve (y
 * se edita con el lápiz) en el Historial de Hoy.
 */

import { useEffect, useState, type RefObject } from 'react';
import { ChipGroup, ChoiceTiles, SegmentedTabs, ShapeList, Switch } from '../components/controls';
import { Disclosure } from '../components/Disclosure';
import {
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
import { todayRows, todaySavedFields } from '../domain/history';
import { earlySignOptions } from '../domain/profile';
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
import { newId } from '../domain/ids';

export type BitacoraView = 'basal' | 'historial';

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
  /** Vista activa; es una ruta de App (`#bitacora` / `#historial`). */
  view?: BitacoraView;
  onChangeView?: (view: BitacoraView) => void;
}

export function BitacoraDiaria({ subject, revision, saving, onSaveBasal, onAddEvent, fabRef, view, onChangeView }: Props) {
  // Controlada por App; sin `view` (pruebas aisladas) guarda su propio estado.
  const [ownTab, setOwnTab] = useState<BitacoraView>('basal');
  const tab = view ?? ownTab;
  const setTab = onChangeView ?? setOwnTab;

  // Registro de hoy que se está editando (null = se guarda lo que falta).
  const [editingRecord, setEditingRecord] = useState<DailyRecord | null>(null);
  // Cambia tras cada guardado para reiniciar el formulario de «Mi Día».
  const [saveNonce, setSaveNonce] = useState(0);

  // Línea de tiempo de hoy, compartida por «Mi Día» (ocultar lo guardado) y el
  // «Historial de Hoy» (mostrarlo). Una sola carga.
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    setError(null);
    getTimeline(subject.subject_id, new Date().toISOString(), 1)
      .then((res) => alive && setEntries(res.entries))
      .catch((reason: ApiError) => alive && setError(reason));
    return () => {
      alive = false;
    };
  }, [subject.subject_id, revision, attempt]);

  const savedFields = entries ? todaySavedFields(entries, todayIso()) : new Set<string>();

  function startEdit(record: DailyRecord) {
    setEditingRecord(record);
    setTab('basal');
  }
  function finishSave() {
    setEditingRecord(null);
    setSaveNonce((value) => value + 1);
  }
  function cancelEdit() {
    setEditingRecord(null);
  }

  return (
    <div className={`nd-screen${tab === 'historial' && onAddEvent ? ' nd-screen--fab' : ''}`}>
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
        <MiDia
          key={`${editingRecord ? 'edit' : 'new'}:${saveNonce}`}
          subject={subject}
          saving={saving}
          onSaveBasal={onSaveBasal}
          onAddEvent={onAddEvent}
          fabRef={fabRef}
          editingRecord={editingRecord}
          savedFields={savedFields}
          onCancelEdit={cancelEdit}
          onFinishSave={finishSave}
        />
      ) : (
        <>
          <HistorialHoy entries={entries} error={error} onRetry={() => setAttempt((value) => value + 1)} onEdit={startEdit} />
          {onAddEvent && <Fab innerRef={fabRef} onClick={onAddEvent} />}
        </>
      )}
    </div>
  );
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

interface MiDiaProps {
  subject: Subject;
  saving: boolean;
  onSaveBasal: (record: DailyRecord) => Promise<boolean> | void;
  onAddEvent?: () => void;
  fabRef?: RefObject<HTMLButtonElement>;
  editingRecord: DailyRecord | null;
  savedFields: Set<string>;
  onCancelEdit: () => void;
  onFinishSave: () => void;
}

function MiDia({ subject, saving, onSaveBasal, onAddEvent, fabRef, editingRecord, savedFields, onCancelEdit, onFinishSave }: MiDiaProps) {
  const [sleep, setSleep] = useState<SleepQuality | null>(editingRecord?.sleep_quality ?? null);
  const [wake, setWake] = useState<WakeMode | null>(editingRecord?.wake_mode ?? null);
  const [autonomy, setAutonomy] = useState<StartAutonomy | null>(editingRecord?.start_autonomy ?? null);
  /** null = no se tocó: no se envía. */
  const [medication, setMedication] = useState<MedicationAdherence | null>(editingRecord?.medication_adherence ?? null);
  const [gi, setGi] = useState<GiStatus | null>(editingRecord?.gi_status ?? null);
  const [sleepHours, setSleepHours] = useState<string | null>(editingRecord?.sleep_hours_range ?? null);
  const [earlySigns, setEarlySigns] = useState<string[]>(editingRecord?.early_signs ?? []);
  const [discomfort, setDiscomfort] = useState<string[]>(editingRecord?.physical_discomfort ?? []);
  const [routineChange, setRoutineChange] = useState<string | null>(editingRecord?.routine_change ?? null);
  const [school, setSchool] = useState<string | null>(editingRecord?.school_attendance ?? null);
  /** P2: una clave por guardado; se reutiliza si el intento falla. */
  const [saveKey, setSaveKey] = useState(() => newId());

  /** P24: las señales que el tutor marcó en el perfil; sin perfil, la lista general. */
  const signs = earlySignOptions(subject);

  // Al editar se muestran los campos de ese registro; si no, solo lo que falta.
  const show = (field: string): boolean =>
    editingRecord ? hasValue((editingRecord as unknown as Record<string, unknown>)[field]) : !savedFields.has(field);

  const hasAnyAnswer = Boolean(
    sleep || wake || autonomy || medication || gi || sleepHours ||
    earlySigns.length > 0 || discomfort.length > 0 || routineChange || school,
  );
  // Sueño y despertar solo se exigen la primera vez (si no están ya guardados).
  const missing = editingRecord
    ? []
    : ([
        !sleep && !savedFields.has('sleep_quality') && 'sueño',
        !wake && !savedFields.has('wake_mode') && 'despertar',
      ].filter(Boolean) as string[]);
  const canSave = missing.length === 0 && hasAnyAnswer && !saving;

  async function save() {
    const saved = await onSaveBasal({
      subject_id: subject.subject_id,
      date: todayIso(),
      record_id: editingRecord?.record_id,
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
    if (saved !== false) {
      setSaveKey(newId());
      onFinishSave();
    }
  }

  return (
    <>
      {editingRecord && (
        <section className="nd-card" aria-label="Editando un registro">
          <p className="nd-card__hint">Estás editando un registro guardado.</p>
          <button type="button" className="nd-linkbutton nd-press" onClick={onCancelEdit}>
            Cancelar edición
          </button>
        </section>
      )}

      <h2 className="nd-cardtitle nd-cardtitle--lg">¿Cómo va el día de hoy?</h2>

      {(show('sleep_quality') || show('wake_mode') || show('start_autonomy')) && (
        <section className="nd-card nd-card--questions" aria-label="Descanso nocturno">
          {show('sleep_quality') && (
            <ChoiceTiles eyebrow="Descanso nocturno" legend="¿Cómo durmió anoche?" choices={SLEEP_CHOICES} value={sleep} onChange={setSleep} />
          )}
          {show('wake_mode') && (
            <ChoiceTiles eyebrow="Forma de despertar" legend="¿Cómo despertó el día de hoy?" choices={WAKE_CHOICES} value={wake} onChange={setWake} />
          )}
          {show('start_autonomy') && (
            <ChoiceTiles
              eyebrow="La transición / autonomía"
              legend="¿Necesitó ayuda para iniciar el día?"
              choices={START_AUTONOMY_CHOICES}
              value={autonomy}
              onChange={setAutonomy}
            />
          )}
        </section>
      )}

      {show('medication_adherence') && (
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
      )}

      {show('gi_status') && (
        <section className="nd-card" aria-labelledby="gi-titulo">
          <span className="nd-eyebrow nd-eyebrow--flat">Digestión</span>
          <h2 id="gi-titulo" className="nd-cardtitle">Salud Gastrointestinal</h2>
          <ShapeList label="Salud gastrointestinal" choices={GI_CHOICES} value={gi} onChange={setGi} />
        </section>
      )}

      {(show('sleep_hours_range') || show('early_signs') || show('physical_discomfort') || show('routine_change') || show('school_attendance')) && (
        // Cerrado salvo al editar un registro que lo trae (si no, el lápiz no mostraría nada).
        <Disclosure
          title="¿Pasó algo distinto hoy?"
          summary="Opcional · horas de sueño, señales, malestar, rutina y colegio"
          defaultOpen={Boolean(editingRecord)}
        >
          <div className="nd-disclosure__questions">
            <p className="nd-card__hint">Queda en su historial. Todavía no cambia la estimación de las próximas horas.</p>
            {show('sleep_hours_range') && (
              <ChipGroup mode="single" legendStyle="section" legend="¿Cuántas horas durmió?" options={SLEEP_HOURS_OPTIONS} value={sleepHours} onChange={setSleepHours} />
            )}
            {show('early_signs') && (
              <ChipGroup
                mode="multiple"
                legendStyle="section"
                legend="¿Viste alguna de sus señales tempranas?"
                hint={signs.fromProfile ? 'Las señales salen de su perfil. Puedes marcar varias.' : 'Puedes marcar varias.'}
                options={[...signs.options, NO_EARLY_SIGNS]}
                exclusive={NO_EARLY_SIGNS}
                value={earlySigns}
                onChange={setEarlySigns}
              />
            )}
            {show('physical_discomfort') && (
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
            )}
            {show('routine_change') && (
              <ChipGroup mode="single" legendStyle="section" legend="¿Hubo un cambio de rutina?" options={ROUTINE_CHANGE_OPTIONS} value={routineChange} onChange={setRoutineChange} />
            )}
            {show('school_attendance') && (
              <ChipGroup mode="single" legendStyle="section" legend="¿Asistió al colegio?" options={SCHOOL_ATTENDANCE_OPTIONS} value={school} onChange={setSchool} />
            )}
          </div>
        </Disclosure>
      )}

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
              <span className="nd-spinner" aria-hidden="true" /> Guardando…
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

function HistorialHoy({
  entries,
  error,
  onRetry,
  onEdit,
}: {
  entries: TimelineEntry[] | null;
  error: ApiError | null;
  onRetry: () => void;
  onEdit: (record: DailyRecord) => void;
}) {
  if (entries === null) {
    if (error) {
      return (
        <section className="nd-card nd-history" role="alert">
          <p className="nd-history__message">{error.message}</p>
          <button type="button" className="nd-button-outline nd-press" onClick={onRetry}>
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

  const today = todayIso();
  const rows = todayRows(entries, today);
  // Registro editable por fila: cada guardado parcial es un registro con su lápiz.
  const recordByEntryId = new Map<string, DailyRecord>();
  for (const entry of entries) {
    if (entry.kind === 'daily_record') recordByEntryId.set(entry.entry_id, entry.payload as DailyRecord);
  }

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
        {rows.map((row) => {
          const record = recordByEntryId.get(row.id);
          return (
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
              {row.title === 'Estado basal' && record && (
                <button type="button" className="nd-linkbutton nd-press" aria-label="Editar" onClick={() => onEdit(record)}>
                  <Icon name="edit" size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

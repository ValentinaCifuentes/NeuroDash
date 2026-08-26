/**
 * Sesiones profesionales.
 *
 * Es la superficie del equipo tratante, no la del tutor: alimenta
 * `3_sesiones_profesionales.csv`. Complementa la Bitácora —que registra la
 * casa— con lo que pasa en consulta.
 *
 * El formulario original de BLUBA es una grilla de tres columnas de
 * escritorio. Acá se despliega en una columna, agrupado por bloques con
 * eyebrow, siguiendo la misma jerarquía de registro que la Bitácora
 * (§3.3: contexto → dominio → dato → cierre).
 *
 * Un solo campo de esta pantalla llega al motor: `alert_level`, que
 * alimenta `professional_alert_recent` (Arquitectura §7). Por eso es el
 * único que se captura como escala con color y no como texto.
 */

import { useEffect, useState } from 'react';
import { Field, OptionGroup, Select, Switch, TextArea } from '../components/controls';
import { getSessions, saveSession } from '../api';
import {
  ALERT_LEVEL_CHOICES,
  ALERT_SEMANTIC,
  ATTENDANCE_OPTIONS,
  CONSULTATION_REASONS,
  NOTES_MAX,
  PROFESSIONALS,
  SEMANTIC_BG,
  SEMANTIC_COLOR,
  SESSION_DURATIONS,
  SESSION_MODALITIES,
  SESSION_STATUSES,
  SESSION_STATUS_SEMANTIC,
  formatTime,
  toHhMm,
  toIsoAt,
  todayIso,
} from '../domain/catalog';
import type {
  AlertLevel,
  ApiError,
  Attendance,
  ConsultationReason,
  ProfessionalSession,
  SessionModality,
  SessionStatus,
  Subject,
} from '../types';

interface Props {
  subject: Subject;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

export function Sesiones({ subject, onSaved, onError }: Props) {
  const [list, setList] = useState<ProfessionalSession[] | null>(null);
  const [editing, setEditing] = useState<ProfessionalSession | 'new' | null>(null);
  const [revision, setRevision] = useState(0);
  // El guardado de sesiones es local a esta página: no pasa por el chrome.
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setList(null);
    getSessions(subject.subject_id)
      .then((res) => alive && setList(res))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [subject.subject_id, revision]);

  async function persist(session: ProfessionalSession) {
    setSaving(true);
    try {
      await saveSession(session);
      setEditing(null);
      setRevision((r) => r + 1);
      onSaved(session.session_id ? 'Sesión actualizada' : 'Sesión registrada');
    } catch (e) {
      onError((e as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <SessionForm
        subjectId={subject.subject_id}
        session={editing === 'new' ? null : editing}
        saving={saving}
        onSave={persist}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="app-shell__content app-shell__content--cta">
      <section className="bl-card">
        <h1 className="bl-card__title">Sesiones</h1>
        <p className="bl-card__sub">
          Atenciones del equipo tratante de <strong>{subject.display_name}</strong>
        </p>
      </section>

      {list === null && (
        <section className="bl-card app-stack--tight" aria-busy="true">
          <span className="bl-sr-only">Cargando sesiones</span>
          <div className="bl-skeleton" style={{ width: '55%' }} />
          <div className="bl-skeleton" />
        </section>
      )}

      {list?.length === 0 && (
        <section className="bl-card">
          <div className="bl-empty">
            <b>Aún no hay sesiones registradas</b>
            Registra la primera atención para que aparezca en la evolución del consultante.
          </div>
        </section>
      )}

      {list?.map((session) => (
        <SessionCard key={session.session_id} session={session} onEdit={() => setEditing(session)} />
      ))}

      <div className="app-cta">
        <button className="bl-btn bl-btn--primary bl-btn--block" onClick={() => setEditing('new')}>
          <span aria-hidden="true">+</span> Nueva sesión
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Tarjeta de sesión
   ============================================================ */

function SessionCard({ session, onEdit }: { session: ProfessionalSession; onEdit: () => void }) {
  const statusSemantic = SESSION_STATUS_SEMANTIC[session.status];
  const alertSemantic = ALERT_SEMANTIC[session.alert_level];
  const date = new Date(session.occurred_at);

  return (
    <section className="bl-card">
      <div className="app-row">
        <span>
          <b style={{ color: 'var(--bl-text)', fontSize: 'var(--bl-fs-h3)' }}>
            {session.professional}
          </b>
          <span
            style={{ display: 'block', fontSize: 'var(--bl-fs-xs)', color: 'var(--bl-text-muted)' }}
          >
            {date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} ·{' '}
            {formatTime(session.occurred_at)} · {session.duration_minutes} min
          </span>
        </span>
        <span
          className="bl-badge"
          style={{ background: SEMANTIC_BG[statusSemantic], color: 'var(--bl-text-body)' }}
        >
          {session.status}
        </span>
      </div>

      <div className="app-track__chips" style={{ marginTop: 'var(--bl-sp-3)' }}>
        <span className="app-chip">{session.consultation_reason}</span>
        <span className="app-chip">{session.modality}</span>
        <span className="app-chip">
          <span
            className="bl-dot"
            style={{ background: SEMANTIC_COLOR[alertSemantic], width: 10, height: 10, flex: '0 0 10px' }}
            aria-hidden="true"
          />
          Alerta {session.alert_level}
        </span>
        {!session.visible_to_tutor && (
          <span className="app-chip">
            <span aria-hidden="true">🔒</span> Privada
          </span>
        )}
      </div>

      {session.objectives && (
        <p style={{ margin: 'var(--bl-sp-3) 0 0', fontSize: 'var(--bl-fs-sm)', color: 'var(--bl-text-body)' }}>
          {session.objectives}
        </p>
      )}

      <button
        className="bl-btn bl-btn--secondary bl-btn--block"
        style={{ marginTop: 'var(--bl-sp-4)' }}
        onClick={onEdit}
      >
        <span aria-hidden="true">✎</span> Editar sesión
      </button>
    </section>
  );
}

/* ============================================================
   Formulario
   ============================================================ */

interface FormProps {
  subjectId: string;
  /** `null` → sesión nueva. */
  session: ProfessionalSession | null;
  saving: boolean;
  onSave: (session: ProfessionalSession) => void;
  onCancel: () => void;
}

function SessionForm({ subjectId, session, saving, onSave, onCancel }: FormProps) {
  const isEdit = session !== null;

  const [professional, setProfessional] = useState(session?.professional ?? PROFESSIONALS[0]!);
  const [reason, setReason] = useState<ConsultationReason>(
    session?.consultation_reason ?? 'Evaluación',
  );
  const [modality, setModality] = useState<SessionModality>(session?.modality ?? 'Presencial');
  const [duration, setDuration] = useState(session?.duration_minutes ?? 45);
  const [date, setDate] = useState(session ? session.occurred_at.slice(0, 10) : todayIso());
  const [time, setTime] = useState(
    toHhMm(session?.occurred_at ?? new Date().toISOString()),
  );
  const [attendance, setAttendance] = useState<Attendance>(session?.attendance ?? 'Presente');
  const [paid, setPaid] = useState(session?.paid ?? false);
  const [status, setStatus] = useState<SessionStatus>(session?.status ?? 'Atendida');
  const [alert, setAlert] = useState<AlertLevel>(session?.alert_level ?? 'Bajo');
  const [objectives, setObjectives] = useState(session?.objectives ?? '');
  const [activities, setActivities] = useState(session?.activities ?? '');
  const [observations, setObservations] = useState(session?.observations ?? '');
  const [internalNotes, setInternalNotes] = useState(session?.internal_notes ?? '');
  const [visibleToTutor, setVisibleToTutor] = useState(session?.visible_to_tutor ?? true);
  const [active, setActive] = useState(session?.active ?? true);

  function submit() {
    onSave({
      session_id: session?.session_id,
      subject_id: subjectId,
      occurred_at: toIsoAt(date, time),
      professional,
      consultation_reason: reason,
      modality,
      duration_minutes: duration,
      attendance,
      paid,
      status,
      alert_level: alert,
      objectives: objectives.trim() || null,
      activities: activities.trim() || null,
      observations: observations.trim() || null,
      internal_notes: internalNotes.trim() || null,
      visible_to_tutor: visibleToTutor,
      active,
    });
  }

  return (
    <>
      <div className="app-shell__content app-shell__content--cta">
        <section className="bl-card">
          <h1 className="bl-card__title">{isEdit ? 'Editar sesión' : 'Nueva sesión'}</h1>
          <p className="bl-card__sub">
            Los campos marcados con <span aria-hidden="true">*</span> son obligatorios
          </p>
        </section>

        {isEdit && (
          <div className="bl-alert bl-alert--warning">
            <span aria-hidden="true">✎</span>
            <span>Modo edición: recuerda guardar los cambios cuando termines.</span>
          </div>
        )}

        {/* 1 · Datos de la sesión */}
        <section className="bl-card">
          <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-4)' }}>
            <span aria-hidden="true">🗂️</span> Datos de la sesión
          </p>
          <Select
            label="Profesional *"
            value={professional}
            options={PROFESSIONALS}
            onChange={setProfessional}
          />
          <Select
            label="Motivo de consulta *"
            value={reason}
            options={CONSULTATION_REASONS}
            onChange={(v) => setReason(v as ConsultationReason)}
          />
          <Select
            label="Modalidad *"
            value={modality}
            options={SESSION_MODALITIES}
            onChange={(v) => setModality(v as SessionModality)}
          />
          <Select
            label="Duración"
            value={`${duration} minutos`}
            options={SESSION_DURATIONS.map((d) => `${d} minutos`)}
            onChange={(v) => setDuration(Number.parseInt(v, 10))}
          />
          <Field label="Fecha" type="date" value={date} onChange={setDate} />
          <Field label="Hora" type="time" value={time} centered onChange={setTime} />
        </section>

        {/* 2 · Asistencia y pago — gestión, no clínica */}
        <section className="bl-card">
          <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-4)' }}>
            <span aria-hidden="true">✓</span> Control de asistencia y pago
          </p>
          <Select
            label="Asistencia del consultante"
            value={attendance}
            options={ATTENDANCE_OPTIONS}
            onChange={(v) => setAttendance(v as Attendance)}
          />
          <div className="app-row" style={{ marginTop: 'var(--bl-sp-4)' }}>
            <Switch label="¿Pago realizado?" checked={paid} onChange={setPaid} />
            <span
              className="bl-badge"
              style={{
                background: paid ? 'var(--bl-success-bg)' : 'var(--bl-neutral-chip)',
                color: paid ? '#15803D' : 'var(--bl-text-muted)',
              }}
            >
              {paid ? 'Pagado' : 'No pagado'}
            </span>
          </div>
        </section>

        {/* 3 · Estado y alerta — el único bloque que llega al motor */}
        <section className="bl-card">
          <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-4)' }}>
            <span aria-hidden="true">🚦</span> Estado y alerta
          </p>
          <Select
            label="Estado de la sesión *"
            value={status}
            options={SESSION_STATUSES}
            onChange={(v) => setStatus(v as SessionStatus)}
          />
          <div style={{ marginTop: 'var(--bl-sp-4)' }}>
            <OptionGroup
              legend="Nivel de alerta *"
              choices={ALERT_LEVEL_CHOICES}
              value={alert}
              onChange={setAlert}
              layout="row"
              boxed={false}
            />
          </div>
          <p className="bl-help" style={{ marginTop: 'var(--bl-sp-3)' }}>
            Es el único dato de la sesión que el motor considera, dentro de una ventana de 7 días.
          </p>
        </section>

        {/* 4 · Registro clínico */}
        <section className="bl-card">
          <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-4)' }}>
            <span aria-hidden="true">📝</span> Registro de la sesión
          </p>
          <TextArea
            label="Objetivos"
            value={objectives}
            maxLength={NOTES_MAX}
            placeholder="Qué se buscaba trabajar en esta sesión…"
            onChange={setObjectives}
          />
          <TextArea
            label="Actividades"
            value={activities}
            maxLength={NOTES_MAX}
            placeholder="Actividades realizadas…"
            onChange={setActivities}
          />
          <TextArea
            label="Observaciones"
            value={observations}
            maxLength={NOTES_MAX}
            placeholder="Observaciones de la sesión…"
            onChange={setObservations}
          />
        </section>

        {/* 5 · Visibilidad */}
        <section className="bl-card">
          <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-4)' }}>
            <span aria-hidden="true">👁️</span> Visibilidad
          </p>
          <Switch
            label={visibleToTutor ? 'Visible para el tutor' : 'Solo para el equipo'}
            checked={visibleToTutor}
            onChange={setVisibleToTutor}
          />
          <div style={{ marginTop: 'var(--bl-sp-4)' }}>
            <TextArea
              label="Comentarios internos"
              value={internalNotes}
              maxLength={NOTES_MAX}
              placeholder="Notas del equipo…"
              help="Nunca se muestran al tutor, aunque la sesión sea visible."
              onChange={setInternalNotes}
            />
          </div>
          <Switch
            label={active ? 'Sesión activa' : 'Sesión dada de baja'}
            checked={active}
            onChange={setActive}
          />
        </section>
      </div>

      <div className="app-cta app-cta--pair">
        <button className="bl-btn bl-btn--ghost" disabled={saving} onClick={onCancel}>
          Cancelar
        </button>
        <button className="bl-btn bl-btn--primary bl-btn--block" disabled={saving} onClick={submit}>
          {saving ? (
            <>
              <span className="bl-spinner" aria-hidden="true" /> Guardando…
            </>
          ) : (
            <>
              <span aria-hidden="true">🔒</span> Guardar
            </>
          )}
        </button>
      </div>
    </>
  );
}

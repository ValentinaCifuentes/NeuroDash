/**
 * Planificación (screens/Final-Planificacion.html y -Nuevo.html).
 *
 * Agenda de lo que viene, con la expectativa de cada evento. D6: mock en el
 * navegador (`domain/planning.ts`); todavía no entra al modelo, así que los
 * textos no lo prometen (P18).
 */

import { useRef, useState } from 'react';
import { ChipGroup, Field } from '../components/controls';
import { Icon } from '../components/icons';
import { ShapeMark } from '../components/marks';
import { BottomSheet } from '../components/shell';
import { SEMANTIC_BG, SEMANTIC_COLOR, SEMANTIC_FG, SEMANTIC_SHAPE, todayIso } from '../domain/catalog';
import {
  EXPECTATION_SEMANTIC,
  PLANNED_CATEGORIES,
  PLANNED_EXPECTATIONS,
  addPlannedEvent,
  formatPlanDate,
  loadPlannedEvents,
} from '../domain/planning';
import type { PlannedCategory, PlannedEvent, PlannedExpectation, Subject } from '../types';
import { newId } from '../domain/ids';

interface Props {
  subject: Subject;
  onSaved?: (event: PlannedEvent) => void;
}

export function Planificacion({ subject, onSaved }: Props) {
  const [events, setEvents] = useState(() => loadPlannedEvents(subject));
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);

  function save(event: PlannedEvent) {
    addPlannedEvent(event);
    setEvents(loadPlannedEvents(subject));
    setAdding(false);
    onSaved?.(event);
  }

  return (
    <div className="nd-screen">
      <button ref={addRef} type="button" className="nd-cta nd-press" onClick={() => setAdding(true)}>
        <Icon name="plus" size={20} strokeWidth={2.4} /> Añadir Nuevo Evento
      </button>

      {events.length === 0 ? (
        <section className="nd-card nd-history nd-history--empty">
          <p className="nd-history__title">No hay eventos próximos</p>
          <p className="nd-history__message">Anota citas, visitas o cambios de rutina para tenerlos a la vista.</p>
        </section>
      ) : (
        <ul className="nd-plans" aria-label="Próximos eventos">
          {events.map((event) => (
            <PlanCard key={event.id} event={event} />
          ))}
        </ul>
      )}

      {adding && (
        <NewEventSheet subjectId={subject.subject_id} onSave={save} onClose={() => setAdding(false)} returnFocusTo={addRef} />
      )}
    </div>
  );
}

function PlanCard({ event }: { event: PlannedEvent }) {
  const semantic = event.expectation ? EXPECTATION_SEMANTIC[event.expectation] : null;
  return (
    <li className="nd-plan">
      <div className="nd-plan__head">
        <h2 className="nd-plan__title">{event.title}</h2>
        {event.category && <span className="nd-plan__category">{event.category}</span>}
      </div>
      <p className="nd-plan__date">
        <Icon name="calendar" size={16} />
        <time dateTime={event.starts_at}>{formatPlanDate(event.starts_at)}</time>
      </p>
      {semantic && (
        <span className="nd-plan__impact" style={{ background: SEMANTIC_BG[semantic], color: SEMANTIC_FG[semantic] }}>
          <ShapeMark shape={SEMANTIC_SHAPE[semantic]} color={SEMANTIC_COLOR[semantic]} size={10} />
          Impacto esperado: {event.expectation}
        </span>
      )}
    </li>
  );
}

function NewEventSheet({
  subjectId,
  onSave,
  onClose,
  returnFocusTo,
}: {
  subjectId: string;
  onSave: (event: PlannedEvent) => void;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLElement>;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [expectation, setExpectation] = useState<string | null>(null);

  const missing = [!title.trim() && 'el nombre', !time && 'la hora'].filter(Boolean) as string[];
  const canSave = missing.length === 0 && Boolean(date);

  function submit() {
    if (!canSave) return;
    onSave({
      id: newId(),
      subject_id: subjectId,
      title: title.trim(),
      starts_at: new Date(`${date}T${time}:00`).toISOString(),
      category: category as PlannedCategory | null,
      expectation: expectation as PlannedExpectation | null,
    });
  }

  return (
    <BottomSheet title="Añadir Evento" onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="nd-sheetform">
        <Field label="Nombre del Evento" value={title} placeholder="Ej: Cumpleaños, Doctor, Viaje..." onChange={setTitle} />
        <div className="nd-plan__when">
          <Field label="Día" type="date" value={date} centered onChange={setDate} />
          <Field label="Hora" type="time" value={time} centered onChange={setTime} />
        </div>
        <ChipGroup mode="single" legend="Categoría" options={PLANNED_CATEGORIES} value={category} onChange={setCategory} />
        <ChipGroup
          mode="single"
          legend="Expectativa del Evento"
          hint="Te ayuda a prepararte para ese día."
          options={PLANNED_EXPECTATIONS}
          value={expectation}
          onChange={setExpectation}
        />
        <button type="button" className="nd-cta nd-press" disabled={!canSave} onClick={submit}>
          Guardar Evento
        </button>
        {missing.length > 0 && <p className="nd-fieldhelp nd-fieldhelp--center">Falta {missing.join(' y ')}.</p>}
      </div>
    </BottomSheet>
  );
}

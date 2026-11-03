/**
 * Planificación (screens/Final-Planificacion.html).
 *
 * D6: mock para el congreso. Los eventos se guardan en este navegador, por
 * infante; no llegan al backend ni al modelo. Cuando exista
 * `POST /subjects/{id}/planned-events` [PCD Fase 4], solo cambia `api.ts`.
 */

import type { PlannedCategory, PlannedEvent, PlannedExpectation, Subject } from '../types';
import type { Semantic } from './catalog';

export const PLANNED_CATEGORIES: PlannedCategory[] = ['Salud', 'Social', 'Escolar', 'Rutina'];
export const PLANNED_EXPECTATIONS: PlannedExpectation[] = ['Agradable', 'Neutro', 'Estresante', 'Desagradable'];

/** Agradable en azul (●), neutro en gris, estresante y desagradable en rojo profundo (▲). */
export const EXPECTATION_SEMANTIC: Record<PlannedExpectation, Semantic> = {
  Agradable: 'success',
  Neutro: 'info',
  Estresante: 'danger',
  Desagradable: 'danger',
};

const storageKey = (subjectId: string) => `neurodash.planned.${subjectId}`;

function read(subjectId: string): PlannedEvent[] | null {
  try {
    const raw = localStorage.getItem(storageKey(subjectId));
    return raw ? (JSON.parse(raw) as PlannedEvent[]) : null;
  } catch {
    return null;
  }
}

function write(subjectId: string, events: PlannedEvent[]): void {
  try {
    localStorage.setItem(storageKey(subjectId), JSON.stringify(events));
  } catch {
    // Navegación privada o almacenamiento bloqueado: el evento vive mientras la pantalla siga abierta.
  }
}

function at(base: Date, days: number, hours: number, minutes = 0): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/** Ejemplos del prototipo, solo para los infantes demo (nunca para uno real). */
function demoEvents(subjectId: string, now: Date): PlannedEvent[] {
  const sunday = (7 - now.getDay()) % 7 || 7;
  const saturday = sunday === 1 ? 7 : sunday - 1;
  return [
    { id: 'demo-1', subject_id: subjectId, title: 'Cita con el Dentista', starts_at: at(now, 1, 15, 30), category: 'Salud', expectation: 'Desagradable' },
    { id: 'demo-2', subject_id: subjectId, title: 'Visita a la Abuela', starts_at: at(now, saturday, 12), category: 'Social', expectation: 'Agradable' },
    { id: 'demo-3', subject_id: subjectId, title: 'Cumpleaños de Martín (Mucho ruido)', starts_at: at(now, sunday, 16), category: 'Social', expectation: 'Estresante' },
  ];
}

/** Próximos eventos (desde el inicio de hoy), del más cercano al más lejano. */
export function loadPlannedEvents(subject: Pick<Subject, 'subject_id' | 'provenance'>, now = new Date()): PlannedEvent[] {
  let events = read(subject.subject_id);
  if (events === null) {
    events = subject.provenance?.synthetic ? demoEvents(subject.subject_id, now) : [];
    write(subject.subject_id, events);
  }
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return events
    .filter((event) => Date.parse(event.starts_at) >= startOfToday.getTime())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export function addPlannedEvent(event: PlannedEvent): void {
  const events = read(event.subject_id) ?? [];
  write(event.subject_id, [...events.filter((item) => item.id !== event.id), event]);
}

/** «Hoy, 15:30» · «Mañana, 15:30» · «Sábado, 12:00» (esta semana) · «12 nov, 16:00». */
export function formatPlanDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(date) - day(now)) / 86_400_000);
  let label: string;
  if (diff === 0) label = 'Hoy';
  else if (diff === 1) label = 'Mañana';
  else if (diff > 1 && diff < 7) {
    const weekday = date.toLocaleDateString('es-CL', { weekday: 'long' });
    label = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  } else label = date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');
  return `${label}, ${time}`;
}

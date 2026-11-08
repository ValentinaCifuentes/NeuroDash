/**
 * Planificación (screens/Final-Planificacion.html).
 *
 * Agenda de lo que viene, con la expectativa de cada evento. Los eventos viven en
 * el backend (`POST/GET /subjects/{id}/planned-events`) y entran al modelo como
 * `planned_stressful_event_8h`; este módulo solo los lee y los guarda por `api.ts`.
 */

import { listPlannedEvents, savePlannedEvent } from '../api';
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

/** Próximos eventos (desde el inicio de hoy), del más cercano al más lejano. */
export async function loadPlannedEvents(
  subject: Pick<Subject, 'subject_id'>,
  now = new Date(),
): Promise<PlannedEvent[]> {
  const events = await listPlannedEvents(subject.subject_id);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return events
    .filter((event) => Date.parse(event.starts_at) >= startOfToday.getTime())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export function addPlannedEvent(event: PlannedEvent): Promise<PlannedEvent> {
  return savePlannedEvent(event);
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

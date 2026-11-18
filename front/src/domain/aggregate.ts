/**
 * Agregación por día para las vistas de seguimiento.
 *
 * ⚠️ Esto NO es motor. Solo agrupa por fecha lo que el backend ya envió en
 * el timeline —que a su vez ya aplicó el cutoff temporal— y lo cuenta.
 * No hay baseline, no hay features, no hay inferencia de riesgo: eso vive
 * en `engine/` y llega por el Prediction Contract (Arquitectura §2.C:
 * "Frontend … No debe recalcular riesgo").
 *
 * El "estado general" que produce es un resumen de LO REGISTRADO ese día,
 * no una estimación. Las pantallas lo dicen explícitamente.
 */

import type {
  DailyRecord,
  DayRegulationLevel,
  DysregulationEvent,
  SleepQuality,
  TimelineEntry,
  WakeMode,
} from '../types';
import type { Semantic } from './catalog';

export interface DaySummary {
  /** "2026-08-26", fecha local. */
  date: string;
  hasRecord: boolean;
  sleep: SleepQuality | null;
  wake: WakeMode | null;
  regulation: DayRegulationLevel | null;
  eventCount: number;
  /** `null` cuando no hubo eventos ese día. */
  maxIntensity: number | null;
  /** Bucket del mapa de calor: 0 · 1-2 · 3-4 · 5+ */
  heat: 0 | 1 | 2 | 3;
}

/** Fecha local "YYYY-MM-DD" de un ISO. Nunca `slice(0,10)`: eso es UTC. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function heatBucket(eventCount: number): 0 | 1 | 2 | 3 {
  if (eventCount === 0) return 0;
  if (eventCount <= 2) return 1;
  if (eventCount <= 4) return 2;
  return 3;
}

function emptyDay(date: string): DaySummary {
  return {
    date,
    hasRecord: false,
    sleep: null,
    wake: null,
    regulation: null,
    eventCount: 0,
    maxIntensity: null,
    heat: 0,
  };
}

/**
 * Devuelve `days` resúmenes consecutivos terminando en `endDate` (inclusive).
 *
 * Los días sin datos existen igual como `DaySummary` vacío: un hueco en el
 * calendario es información (§"missing ≠ normal"), no una fila que se omite.
 */
export function buildDaySummaries(
  entries: TimelineEntry[],
  endDate: Date,
  days: number,
): DaySummary[] {
  const byDate = new Map<string, DaySummary>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const key = localDay(d.toISOString());
    byDate.set(key, emptyDay(key));
  }

  // Un día puede traer eventos por dos vías: las entradas `event` y los conteos
  // que el backend guarda en el registro diario (`event_count`, también en el
  // historial sintético). Se toma el mayor para no contar dos veces.
  const eventEntries = new Map<string, { count: number; max: number }>();
  const recordCounts = new Map<string, { count: number; max: number }>();

  // En orden cronológico: si el día tiene varios Mi Día (se guarda por partes o se
  // corrige), manda el último, igual que en la estimación (`engine/features.py`).
  // El historial llega del más nuevo al más antiguo.
  const chronological = [...entries].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (const entry of chronological) {
    const key = localDay(entry.timestamp);
    const day = byDate.get(key);
    if (!day) continue; // fuera de la ventana pedida

    if (entry.kind === 'daily_record') {
      const record = entry.payload as DailyRecord;
      // P1: un registro con solo conteos (lo crea el backend al guardar un evento)
      // no es un día con Bitácora.
      if (record.sleep_quality || record.wake_mode || record.day_regulation_level) day.hasRecord = true;
      day.sleep = record.sleep_quality ?? day.sleep;
      day.wake = record.wake_mode ?? day.wake;
      day.regulation = record.day_regulation_level ?? day.regulation;
      const counts = recordCounts.get(key) ?? { count: 0, max: 0 };
      recordCounts.set(key, {
        count: Math.max(counts.count, record.event_count ?? 0),
        max: Math.max(counts.max, record.max_intensity ?? 0),
      });
    } else {
      const event = entry.payload as DysregulationEvent;
      const counts = eventEntries.get(key) ?? { count: 0, max: 0 };
      eventEntries.set(key, { count: counts.count + 1, max: Math.max(counts.max, event.intensity_value ?? 0) });
    }
  }

  for (const day of byDate.values()) {
    const fromEvents = eventEntries.get(day.date) ?? { count: 0, max: 0 };
    const fromRecord = recordCounts.get(day.date) ?? { count: 0, max: 0 };
    day.eventCount = Math.max(fromEvents.count, fromRecord.count);
    const max = Math.max(fromEvents.max, fromRecord.max);
    day.maxIntensity = max > 0 ? max : null;
    day.heat = heatBucket(day.eventCount);
  }

  return [...byDate.values()];
}

/* ============================================================
   Estado general del día
   ============================================================

   Resume lo registrado, no lo estimado. Es una regla de presentación
   fija y auditable, no un modelo: mismo input → mismo icono, siempre.
   ============================================================ */

export interface DayStatus {
  semantic: Semantic;
  label: string;
}

export function dayStatus(day: DaySummary): DayStatus {
  if (!day.hasRecord && day.eventCount === 0) {
    return { semantic: 'neutral', label: 'Sin registro' };
  }
  if ((day.maxIntensity ?? 0) >= 8 || day.eventCount >= 5) {
    return { semantic: 'danger', label: 'Día intenso' };
  }
  if (
    (day.maxIntensity ?? 0) >= 4 ||
    day.eventCount >= 3 ||
    day.sleep === 'Dificultad de Conciliación'
  ) {
    return { semantic: 'warning', label: 'Con altibajos' };
  }
  return { semantic: 'success', label: 'Día tranquilo' };
}

/* ============================================================
   Evolución de 14 días · semana anterior vs. esta semana
   ============================================================

   Cada día se marca en una de cuatro clases, igual que el prototipo
   (screens/Final-Seguimiento-desplegado.html): `good` dentro de lo esperado,
   `watch` para observar, `alert` señal relevante y `none` sin registro.
   ============================================================ */

export type DayMark = 'good' | 'watch' | 'alert' | 'none';

export type TrackedVariable = 'sleep' | 'wake' | 'regulation' | 'events';

export const TRACKED_VARIABLES: { key: TrackedVariable; label: string; unit: string }[] = [
  { key: 'sleep', label: 'Sueño', unit: 'noches para observar' },
  { key: 'wake', label: 'Despertar', unit: 'despertares difíciles' },
  { key: 'regulation', label: 'Regulación', unit: 'días con apoyo o desregulación' },
  { key: 'events', label: 'Eventos', unit: 'días con eventos' },
];

export function dayMark(variable: TrackedVariable, day: DaySummary): DayMark {
  switch (variable) {
    case 'sleep':
      return day.sleep === 'Reparador' ? 'good' : day.sleep === 'Interrumpido' ? 'watch' : day.sleep ? 'alert' : 'none';
    case 'wake':
      return day.wake === 'Tranquilo/Alegre' ? 'good' : day.wake === 'Cansado/Con Sueño' ? 'watch' : day.wake ? 'alert' : 'none';
    case 'regulation':
      return day.regulation === 'Excelente'
        ? 'good'
        : day.regulation === 'Estable con Apoyo'
          ? 'watch'
          : day.regulation
            ? 'alert'
            : 'none';
    case 'events':
      if (day.eventCount === 0) return day.hasRecord ? 'good' : 'none';
      return day.eventCount >= 3 || (day.maxIntensity ?? 0) >= 8 ? 'alert' : 'watch';
  }
}

export interface WeekComparison {
  variable: TrackedVariable;
  label: string;
  unit: string;
  previous: DayMark[];
  current: DayMark[];
  /** Días marcados para observar o con señal relevante. */
  previousCount: number;
  currentCount: number;
  trend: 'up' | 'down' | 'same';
}

/** Compara los últimos 7 días con los 7 anteriores (`days` termina hoy, 14 o más). */
export function weeklyComparison(days: DaySummary[]): WeekComparison[] {
  const last14 = days.slice(-14);
  const previousDays = last14.slice(0, 7);
  const currentDays = last14.slice(7);
  const flagged = (marks: DayMark[]) => marks.filter((m) => m === 'watch' || m === 'alert').length;
  return TRACKED_VARIABLES.map(({ key, label, unit }) => {
    const previous = previousDays.map((day) => dayMark(key, day));
    const current = currentDays.map((day) => dayMark(key, day));
    const previousCount = flagged(previous);
    const currentCount = flagged(current);
    return {
      variable: key,
      label,
      unit,
      previous,
      current,
      previousCount,
      currentCount,
      trend: currentCount > previousCount ? 'up' : currentCount < previousCount ? 'down' : 'same',
    };
  });
}

/** Titular del desplegable cerrado: qué aumentó frente a la semana anterior. */
export function comparisonHeadline(comparison: WeekComparison[]): string {
  const up = comparison.filter((item) => item.trend === 'up').map((item) => item.label);
  if (up.length === 0) return 'Sin aumentos frente a la semana anterior';
  if (up.length === 1) return `${up[0]} aumentó frente a la semana anterior`;
  return `${up.slice(0, -1).join(', ')} y ${up[up.length - 1].toLowerCase()} aumentaron frente a la semana anterior`;
}

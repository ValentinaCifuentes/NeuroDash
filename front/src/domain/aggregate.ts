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

import type { DailyRecord, DysregulationEvent, SleepQuality, TimelineEntry } from '../types';
import type { Semantic } from './catalog';

export interface DaySummary {
  /** "2026-08-26", fecha local. */
  date: string;
  hasRecord: boolean;
  sleep: SleepQuality | null;
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
  return { date, hasRecord: false, sleep: null, eventCount: 0, maxIntensity: null, heat: 0 };
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

  for (const entry of entries) {
    const key = localDay(entry.timestamp);
    const day = byDate.get(key);
    if (!day) continue; // fuera de la ventana pedida

    if (entry.kind === 'daily_record') {
      const record = entry.payload as DailyRecord;
      day.hasRecord = true;
      day.sleep = record.sleep_quality;
    } else {
      const event = entry.payload as DysregulationEvent;
      day.eventCount += 1;
      day.maxIntensity = Math.max(day.maxIntensity ?? 0, event.intensity_value);
    }
  }

  for (const day of byDate.values()) day.heat = heatBucket(day.eventCount);

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
  icon: string;
}

export function dayStatus(day: DaySummary): DayStatus {
  if (!day.hasRecord && day.eventCount === 0) {
    return { semantic: 'neutral', label: 'Sin registro', icon: '—' };
  }
  if ((day.maxIntensity ?? 0) >= 8 || day.eventCount >= 5) {
    return { semantic: 'danger', label: 'Día intenso', icon: '⚠️' };
  }
  if (
    (day.maxIntensity ?? 0) >= 4 ||
    day.eventCount >= 3 ||
    day.sleep === 'Dificultad de Conciliación'
  ) {
    return { semantic: 'warning', label: 'Con altibajos', icon: '⚠️' };
  }
  return { semantic: 'success', label: 'Día tranquilo', icon: '✓' };
}

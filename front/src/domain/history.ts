/**
 * Filas del «Historial de Hoy» (screens/Final-Bitacora-Historial.html).
 *
 * Cada fila dice qué se registró, a qué hora y un resumen que el tutor
 * reconoce: el texto que eligió (`payload.raw`, ya adaptado en `api.ts`),
 * nunca el número que usa el modelo.
 */

import type { IconName } from '../components/icons';
import type { DailyRecord, DysregulationEvent, TimelineEntry } from '../types';
import { CATEGORIES, SLEEP_CHOICES, START_AUTONOMY_CHOICES, WAKE_CHOICES, intensityBand } from './catalog';
import { localDay } from './aggregate';

export interface HistoryRow {
  id: string;
  title: string;
  summary: string | null;
  timestamp: string;
  icon: IconName;
  color: string;
  tint: string;
}

const BASAL_STYLE = { icon: 'journal' as IconName, color: 'var(--nd-risk-low)', tint: 'var(--nd-risk-low-bg)' };
const DYSREGULATION = CATEGORIES.find((category) => category.id === 'desregulacion')!;

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1).toLowerCase();
const labelOf = <T extends string>(choices: { value: T; label: string }[], value: T | null) =>
  value ? choices.find((choice) => choice.value === value)?.label ?? value : null;

/** «Sueño reparador · Despertar irritable / llorando · Inicio del día con alarma». */
function basalSummary(record: DailyRecord): string | null {
  const sleep = labelOf(SLEEP_CHOICES, record.sleep_quality);
  const wake = labelOf(WAKE_CHOICES, record.wake_mode);
  const autonomy = labelOf(START_AUTONOMY_CHOICES, record.start_autonomy);
  const parts = [
    sleep && `Sueño ${lower(sleep)}`,
    wake && `Despertar ${lower(wake)}`,
    autonomy && `Inicio del día ${lower(autonomy)}`,
    record.medication_adherence && `Medicación ${lower(record.medication_adherence)}`,
    record.gi_status && `Digestión ${lower(record.gi_status)}`,
    record.sleep_hours_range && `Durmiió ${record.sleep_hours_range.toLowerCase()}`,
    record.early_signs?.length ? `Señales: ${record.early_signs.join(', ')}` : null,
    record.physical_discomfort?.length ? `Malestar: ${record.physical_discomfort.join(', ')}` : null,
    record.routine_change && `Rutina: ${record.routine_change}`,
    record.school_attendance && `Colegio: ${record.school_attendance}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** «Moderada (4-7) · Registro rápido» o «Con ayuda · Apoyo visual». */
function eventSummary(event: DysregulationEvent): string | null {
  const scale =
    event.qualitative_outcome ??
    (typeof event.intensity_value === 'number' ? intensityBand(event.intensity_value) : null);
  const support = event.support_used ?? (event.strategy_applied?.length ? event.strategy_applied.join(', ') : null);
  const confirmed = event.source === 'outcome_confirmation' && 'Confirmada desde la estimación';
  const parts = [scale, support, confirmed, event.quick_capture && 'Registro rápido'].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Un registro diario sin respuestas solo trae los conteos de eventos (P1): no es un estado basal. */
function hasBasalAnswers(record: DailyRecord): boolean {
  return Boolean(
    record.sleep_quality ||
      record.wake_mode ||
      record.start_autonomy ||
      record.medication_adherence ||
      record.gi_status ||
      record.sleep_hours_range ||
      record.routine_change ||
      record.school_attendance ||
      record.early_signs?.length ||
      record.physical_discomfort?.length,
  );
}

export function historyRow(entry: TimelineEntry): HistoryRow {
  const base = { id: entry.entry_id, timestamp: entry.timestamp };
  if (entry.kind === 'daily_record') {
    return { ...base, ...BASAL_STYLE, title: 'Estado basal', summary: basalSummary(entry.payload as DailyRecord) };
  }
  const event = entry.payload as DysregulationEvent;
  const category = CATEGORIES.find((item) => item.eventType === event.event_type);
  return {
    ...base,
    // Sin `event_type` es una crisis confirmada desde Evolución; el backend ya la titula.
    title: category?.name ?? entry.title,
    summary: eventSummary(event),
    icon: (category ?? DYSREGULATION).icon,
    color: (category ?? DYSREGULATION).color,
    tint: (category ?? DYSREGULATION).tint,
  };
}

/**
 * Lo registrado hoy (día local), del más reciente al más antiguo.
 * La línea de tiempo pide 24 horas, que de mañana incluyen la tarde de ayer.
 */
export function todayRows(entries: TimelineEntry[], today: string): HistoryRow[] {
  return entries
    .filter((entry) => localDay(entry.timestamp) === today)
    .filter((entry) => entry.kind !== 'daily_record' || hasBasalAnswers(entry.payload as DailyRecord))
    .map(historyRow)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

/** El estado basal de hoy (el registro diario con respuestas), si ya se guardó. */
export function todayBasalRecord(entries: TimelineEntry[], today: string): DailyRecord | null {
  const basal = entries
    .filter((entry) => entry.kind === 'daily_record')
    .filter((entry) => localDay(entry.timestamp) === today)
    .map((entry) => entry.payload as DailyRecord)
    .find(hasBasalAnswers);
  return basal ?? null;
}

/** Campos del estado basal que el tutor responde en la Bitácora (uno por pregunta). */
const BASAL_FIELDS = [
  'sleep_quality',
  'wake_mode',
  'start_autonomy',
  'medication_adherence',
  'gi_status',
  'sleep_hours_range',
  'early_signs',
  'physical_discomfort',
  'routine_change',
  'school_attendance',
] as const;

function fieldHasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Campos del estado basal de HOY que ya se guardaron (aunque sea en registros
 * parciales distintos). «Mi Día» los oculta para que el tutor solo vea (y guarde)
 * lo que falta.
 */
export function todaySavedFields(entries: TimelineEntry[], today: string): Set<string> {
  const saved = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== 'daily_record') continue;
    if (localDay(entry.timestamp) !== today) continue;
    const record = entry.payload as DailyRecord;
    for (const field of BASAL_FIELDS) {
      if (fieldHasValue(record[field])) saved.add(field);
    }
  }
  return saved;
}

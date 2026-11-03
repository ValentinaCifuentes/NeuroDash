/**
 * Lectura del perfil del infante (Ficha y Bitácora).
 *
 * El perfil puede venir de dos fuentes: el perfil inicial en 3 pasos
 * (`habitual_context`, `sensory_context`, `historical_supports`) o los
 * campos de los perfiles demo (`age_range`, `diagnosis`, `sensory_profile`).
 * Lo que no se registró se dice así, sin inventar un valor.
 */

import type { Subject } from '../types';
import { DEFAULT_EARLY_SIGNS, SENSORY_CHANNELS, SENSORY_LEVELS } from './catalog';

export interface ProfileRow {
  label: string;
  value: string | null;
  mono?: boolean;
}

const text = (value: unknown): string | null => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : null;
  return typeof value === 'string' && value.trim() ? value : null;
};

/** «Le molestan: sonidos y tacto · Busca menos: movimiento», o la etiqueta de las demos. */
export function sensorySummary(subject: Subject): string | null {
  const context = subject.sensory_context ?? {};
  // «Le molesta» primero: es lo que más ayuda a anticipar.
  const byLevel = [...SENSORY_LEVELS].reverse().filter((level) => level.value !== 0).map((level) => ({
    label: level.value === 1 ? 'Le molesta' : 'Busca menos',
    channels: SENSORY_CHANNELS.filter((channel) => context[channel.key] === level.value).map((channel) =>
      channel.label.toLowerCase(),
    ),
  }));
  const parts = byLevel
    .filter((group) => group.channels.length > 0)
    .map((group) => `${group.label}: ${group.channels.join(', ')}`);
  if (parts.length > 0) return parts.join(' · ');
  const answered = SENSORY_CHANNELS.some((channel) => typeof context[channel.key] === 'number');
  if (answered) return 'Típico en todos los canales marcados';
  return text(context.sensory_profile) ?? text(subject.sensory_profile);
}

/** Tarjeta «Contexto clínico» (screens/Final-Ficha.html). */
export function clinicalRows(subject: Subject): ProfileRow[] {
  const habitual = subject.habitual_context ?? {};
  return [
    { label: 'Identificador', value: subject.subject_id, mono: true },
    { label: 'Rango de edad', value: text(habitual.age_range) ?? text(subject.age_range) },
    { label: 'Diagnóstico principal', value: text(habitual.neurodivergence) ?? text(subject.diagnosis) },
    { label: 'Nivel de apoyo', value: text(habitual.support_level) },
    { label: 'Perfil sensorial predominante', value: sensorySummary(subject) },
  ];
}

/** Tarjeta «Su día a día»: solo las respuestas del perfil inicial que existan. */
export function dailyRows(subject: Subject): ProfileRow[] {
  const habitual = subject.habitual_context ?? {};
  const supports = (subject.historical_supports ?? [])
    .map((support) => support.description)
    .filter((description): description is string => Boolean(description));
  return [
    { label: 'Cómo se comunica', value: text(habitual.communication) },
    { label: 'Frecuencia de desregulación', value: text(habitual.dysregulation_frequency) },
    { label: 'Señales tempranas', value: text(habitual.early_signs) },
    { label: 'Gatillantes frecuentes', value: text(habitual.triggers) },
    { label: 'Momentos con más riesgo', value: text(habitual.risk_times) },
    { label: 'Lo que le ayuda', value: text(supports) },
  ].filter((row) => row.value !== null);
}

/**
 * Señales tempranas de la Bitácora (P24): las del perfil si el tutor las
 * marcó (sin «Otra», que no es una señal concreta); si no, la lista general.
 */
export function earlySignOptions(subject: Subject): { options: string[]; fromProfile: boolean } {
  const signs = subject.habitual_context?.early_signs;
  const fromProfile = Array.isArray(signs) ? signs.filter((sign) => sign !== 'Otra') : [];
  return fromProfile.length > 0
    ? { options: fromProfile, fromProfile: true }
    : { options: DEFAULT_EARLY_SIGNS, fromProfile: false };
}

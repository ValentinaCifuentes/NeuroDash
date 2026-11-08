/**
 * Perfil inicial → `POST /subjects` (plan de datos §6.1).
 *
 * Solo viaja lo que el tutor respondió: una pregunta sin tocar no se manda,
 * así el motor no confunde «no lo dijo» con «típico» o «ninguno».
 */

import type { SubjectOnboardingInput } from '../types';
import type { SensoryChannel, SensoryLevel } from './catalog';

export interface ProfileAnswers {
  alias: string;
  /** Respuestas de los pasos 1 y 2, por `ProfileQuestion.key`. */
  context: Record<string, string | string[] | null>;
  sensory: Partial<Record<SensoryChannel, SensoryLevel>>;
  supports: string[];
}

export const EMPTY_PROFILE: ProfileAnswers = { alias: '', context: {}, sensory: {}, supports: [] };

const supportId = (label: string) =>
  `sup_${label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}`;

export function buildOnboardingInput(answers: ProfileAnswers, timezone: string): SubjectOnboardingInput {
  const habitual = Object.fromEntries(
    Object.entries(answers.context).filter(([, value]) => (Array.isArray(value) ? value.length > 0 : Boolean(value))),
  ) as Record<string, string | string[]>;
  const input: SubjectOnboardingInput = {
    display_name: answers.alias.trim(),
    timezone,
    baseline: {},
    provenance: { source: 'caregiver_onboarding', synthetic: false },
  };
  if (Object.keys(habitual).length > 0) input.habitual_context = habitual;
  if (Object.keys(answers.sensory).length > 0) input.sensory_context = { ...answers.sensory };
  if (answers.supports.length > 0) {
    input.historical_supports = answers.supports.map((label) => ({
      id: supportId(label),
      description: label,
      type: 'historical',
      effective: true,
    }));
  }
  return input;
}

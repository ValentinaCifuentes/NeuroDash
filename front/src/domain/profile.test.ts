import { describe, expect, it } from 'vitest';

import type { Subject } from '../types';
import { clinicalRows, dailyRows, earlySignOptions, sensorySummary } from './profile';

const base = { subject_id: 'tomi', display_name: 'Tomi', initials: 'TO', age_range: '', diagnosis: '', sensory_profile: '' } as Subject;

describe('profile reading', () => {
  it('reads the 3-step profile and leaves unanswered rows empty', () => {
    const subject = { ...base, habitual_context: { age_range: '6 a 8 años', neurodivergence: 'TEA' } };

    expect(clinicalRows(subject).map((row) => row.value)).toEqual(['tomi', '6 a 8 años', 'TEA', null, null]);
  });

  it('falls back to the demo profile fields', () => {
    const demo = { ...base, age_range: '6-7 años', diagnosis: 'TEA', sensory_context: { sensory_profile: 'Hipersensible' } };

    expect(clinicalRows(demo).map((row) => row.value).slice(1)).toEqual(['6-7 años', 'TEA', null, 'Hipersensible']);
  });

  it('summarizes the sensory matrix in words', () => {
    expect(sensorySummary({ ...base, sensory_context: { auditory: 1, tactile: 1, vestibular: -1, visual: 0 } })).toBe(
      'Le molesta: sonidos, tacto · Busca menos: movimiento',
    );
    expect(sensorySummary({ ...base, sensory_context: { visual: 0 } })).toBe('Típico en todos los canales marcados');
  });

  it('lists only the daily-life answers that exist', () => {
    const subject = {
      ...base,
      habitual_context: { early_signs: ['Se aísla', 'Más irritable'], triggers: [] },
      historical_supports: [{ description: 'Espacio seguro', effective: true }],
    };

    expect(dailyRows(subject)).toEqual([
      { label: 'Señales tempranas', value: 'Se aísla, Más irritable' },
      { label: 'Lo que le ayuda', value: 'Espacio seguro' },
    ]);
  });

  it('uses the early signs of the profile in the Bitácora (P24)', () => {
    expect(earlySignOptions({ ...base, habitual_context: { early_signs: ['Se aísla', 'Otra'] } })).toEqual({
      options: ['Se aísla'],
      fromProfile: true,
    });
    expect(earlySignOptions(base).fromProfile).toBe(false);
  });
});

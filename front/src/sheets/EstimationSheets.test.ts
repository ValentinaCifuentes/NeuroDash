import { describe, expect, it } from 'vitest';

import type { PredictionFactor } from '../types';
import { highlightedFactors } from './EstimationSheets';

function factor(code: string, direction: 'up' | 'down', trend: PredictionFactor['trend']): PredictionFactor {
  return { code, label: code, comparison: '', direction, window: '3d', baseline: null, trend, summary: null };
}

describe('highlightedFactors (P29)', () => {
  it('leaves technical and contradictory rows for «Ver todas»', () => {
    const rows = highlightedFactors([
      factor('conteo_registros_siete_dias', 'down', null),
      factor('estado_despertar_promedio_tres_dias', 'up', 'worse'),
      factor('dificultad_transiciones_promedio_tres_dias', 'down', 'worse'),
      factor('calidad_sueno_promedio_siete_dias', 'down', 'better'),
      factor('estado_despertar_promedio_un_dia', 'up', 'worse'),
    ]);

    expect(rows.map((row) => row.code)).toEqual(['estado_despertar_promedio_tres_dias', 'calidad_sueno_promedio_siete_dias']);
  });

  it('falls back to the strongest non-technical rows when nothing can be compared', () => {
    const rows = highlightedFactors([
      factor('conteo_registros_siete_dias', 'down', null),
      factor('estado_despertar_promedio_tres_dias', 'up', null),
    ]);

    expect(rows.map((row) => row.code)).toEqual(['estado_despertar_promedio_tres_dias']);
  });
});

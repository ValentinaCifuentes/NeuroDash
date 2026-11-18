/**
 * Contrato con respuestas REALES del backend (Fase 7 · paso 1).
 *
 * `api.contract.test.ts` prueba los adaptadores con JSON escrito a mano, que
 * podría alejarse del backend sin que nadie lo note. Aquí se usan respuestas
 * que devolvió FastAPI con las demos (`mocks/demo-fixture.json`, exportado por
 * `scripts/export_mock_fixture.py`). `tests/unit/test_mock_fixture.py`, del
 * lado del backend, falla si ese archivo queda viejo.
 */

import { describe, expect, it } from 'vitest';

import { adaptPrediction, adaptSubjectForTest, adaptTimelineResponse, type BackendTimelineEntry } from './api';
import {
  CATEGORIES,
  DAY_REGULATION_CHOICES,
  GI_CHOICES,
  SLEEP_CHOICES,
  START_AUTONOMY_CHOICES,
  WAKE_CHOICES,
} from './domain/catalog';
import { todayRows } from './domain/history';
import { clinicalRows } from './domain/profile';
import fixture from './mocks/demo-fixture.json';
import { highlightedFactors } from './sheets/EstimationSheets';
import type { DailyRecord, DysregulationEvent } from './types';

type Backend = Parameters<typeof adaptPrediction>[0];
const prediction = (subjectId: 'PAC-A' | 'PAC-B' | 'PAC-C') =>
  adaptPrediction((fixture.predictions as unknown as Record<string, Backend>)[subjectId]);
const timeline = (subjectId: 'PAC-A' | 'PAC-B' | 'PAC-C') =>
  adaptTimelineResponse({
    subject_id: subjectId,
    as_of: fixture.anchor,
    days: 70,
    entries: (fixture.timeline as unknown as Record<string, BackendTimelineEntry[]>)[subjectId],
  });
const values = (choices: { value: string }[]) => choices.map((choice) => choice.value);

describe('real subject profile (GET /subjects/{id})', () => {
  it('fills the Ficha of a demo with the onboarding fields and Spanish supports', () => {
    const subject = adaptSubjectForTest(fixture.subjects['PAC-A']);

    expect(subject).toMatchObject({ subject_id: 'PAC-A', initials: 'PA', timezone: 'America/Santiago' });
    expect(subject.provenance?.synthetic).toBe(true);
    expect(clinicalRows(subject).every((row) => row.value !== null)).toBe(true);
    expect(subject.historical_supports?.map((support) => support.description)).toContain('Manta con peso en la tarde');
  });
});

describe('real timeline (GET /subjects/{id}/timeline)', () => {
  it('tells records from events by the kind the backend sends', () => {
    const { entries } = timeline('PAC-A');

    expect(entries.some((entry) => entry.kind === 'daily_record')).toBe(true);
    expect(entries.some((entry) => entry.kind === 'event')).toBe(true);
    const times = entries.map((entry) => Date.parse(entry.timestamp));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('rebuilds every daily record with texts the screens know, never the model numbers (I8)', () => {
    const records = (['PAC-A', 'PAC-B', 'PAC-C'] as const)
      .flatMap((subject) => timeline(subject).entries)
      .filter((entry) => entry.kind === 'daily_record')
      .map((entry) => entry.payload as DailyRecord);

    expect(records.length).toBeGreaterThan(100);
    const known = (value: string | null | undefined, list: string[]) => value == null || list.includes(value);
    for (const record of records) {
      expect(known(record.sleep_quality, values(SLEEP_CHOICES))).toBe(true);
      expect(known(record.wake_mode, values(WAKE_CHOICES))).toBe(true);
      expect(known(record.start_autonomy, values(START_AUTONOMY_CHOICES))).toBe(true);
      expect(known(record.gi_status, values(GI_CHOICES))).toBe(true);
      expect(known(record.day_regulation_level, values(DAY_REGULATION_CHOICES))).toBe(true);
      expect(known(record.medication_adherence, ['Sí', 'No', 'No Aplica'])).toBe(true);
    }
  });

  it('names every event with a category the Historial knows', () => {
    const events = timeline('PAC-A').entries.filter((entry) => entry.kind === 'event');
    const eventTypes = CATEGORIES.map((category) => category.eventType);

    for (const entry of events) {
      expect(eventTypes).toContain((entry.payload as DysregulationEvent).event_type);
    }
  });

  it('shows the last demo day in the Historial with readable rows', () => {
    const { entries } = timeline('PAC-A');
    const lastDay = entries[0].timestamp.slice(0, 10);

    const rows = todayRows(entries, lastDay);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.find((row) => row.title === 'Estado basal')?.summary).toMatch(/^Sueño /);
  });
});

describe('real estimates (POST /predictions)', () => {
  it('shows the intended state of each demo, with the 8 h horizon of the contract', () => {
    const [a, b, c] = [prediction('PAC-A'), prediction('PAC-B'), prediction('PAC-C')];

    // PAC-A abre en moderado: su Mi Día de hoy (07:45) trae una mala noche.
    expect([a.risk, b.risk, c.risk]).toEqual(['MODERATE', 'LOW', null]);
    expect([a.abstained, b.abstained, c.abstained]).toEqual([false, false, true]);
    expect([a.horizon_hours, b.horizon_hours, c.horizon_hours]).toEqual([8, 8, 8]);
    expect(a.confidence).toBe('HIGH');
  });

  it('explains PAC-A against its own baseline, with coherent signals first (P19, P29)', () => {
    const factors = prediction('PAC-A').factors;
    const highlighted = highlightedFactors(factors);

    expect(factors.every((factor) => factor.label && factor.code)).toBe(true);
    expect(factors.some((factor) => factor.summary?.includes('que de costumbre'))).toBe(true);
    expect(highlighted.length).toBeGreaterThan(0);
    for (const factor of highlighted) {
      expect(factor.code.startsWith('conteo_registros')).toBe(false);
      expect(factor.trend === 'worse' ? 'up' : 'down').toBe(factor.direction);
    }
  });

  it('lists the supports with the tutor words, and keeps them when there is no estimate (P23)', () => {
    const pacA = prediction('PAC-A').supports;
    const pacC = prediction('PAC-C').supports;

    expect(pacA.find((item) => item.label === 'Manta con peso en la tarde')).toMatchObject({
      source: 'historical_support',
      detail: 'Le sirvió antes en situaciones parecidas.',
    });
    expect(pacC.filter((item) => item.source === 'historical_support').map((item) => item.label)).toEqual(['Masticables']);
    expect(pacC.at(-1)?.source).toBe('insufficient_data');
  });

  it('marks the core missing fields first and never exposes a model score', () => {
    const estimate = prediction('PAC-B');
    const core = estimate.missingness.map((item) => item.is_core);

    expect(core).toEqual([...core].sort((x, y) => Number(y) - Number(x)));
    expect(JSON.stringify(estimate)).not.toMatch(/model_score/);
  });
});

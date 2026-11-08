/**
 * Hojas de registro de eventos (screens/Final-Registro-*.html).
 *
 * Regla de la hoja: la ruta rápida arriba y siempre visible; el detalle
 * abajo y marcado como opcional. Registrar cuesta dos toques: la escala
 * (o la intensidad) y «Guardar ya».
 *
 * Nada viene preseleccionado (P13): la escala y la intensidad las elige el
 * tutor, y lo que no toca en el detalle no se envía.
 */

import { useState } from 'react';
import { BottomSheet } from '../components/shell';
import { ChipGroup, ChoiceTiles, Field, IntensitySlider, TextArea } from '../components/controls';
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  CATEGORY_FORM,
  OTHER_OPTION,
  SENSORY_RESPONSE_CHOICES,
  SENSORY_RESPONSE_TO_OUTCOME,
  STRATEGY_OPTIONS,
  STRATEGY_OUTCOME_CHOICES,
  TRIGGER_OPTIONS,
  intensityBand,
  toHhMm,
  todayIso,
  toIsoAt,
} from '../domain/catalog';
import type { CategorySelect } from '../domain/catalog';
import type { DysregulationEvent, LogCategory, StrategyOutcome } from '../types';
import { Icon } from '../components/icons';
import { newId } from '../domain/ids';

/* ============================================================
   1. Hoja de categorías (screens/Final-Registro-Categorias.html)
   ============================================================ */

interface CategorySheetProps {
  onPick: (category: LogCategory) => void;
  onClose: () => void;
  returnFocusTo?: React.RefObject<HTMLElement>;
}

export function CategorySheet({ onPick, onClose, returnFocusTo }: CategorySheetProps) {
  return (
    <BottomSheet title="¿Qué deseas registrar?" onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="nd-catgrid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className="nd-cat nd-press"
            style={{ background: cat.tint }}
            onClick={() => onPick(cat.id)}
          >
            <span className="nd-cat__icon" style={{ background: cat.color }} aria-hidden="true">
              <Icon name={cat.icon} size={22} />
            </span>
            <span className="nd-cat__name">{cat.name}</span>
            <span className="nd-cat__desc">{cat.desc}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

/* ============================================================
   2. Hoja de registro de evento
   ============================================================

   Un solo componente para las cuatro categorías. Lo que cambia entre
   ellas vive en `CATEGORY_FORM`: la escala de arriba, los campos del
   detalle y el texto de la ruta rápida.

   Desregulación es la excepción: usa la intensidad 1-10 y los campos
   clínicos (disparadores, estrategia y resultado).
   ============================================================ */

interface EventSheetProps {
  category: LogCategory;
  subjectId: string;
  saving: boolean;
  /** Devuelve true si se guardó; con false se reintenta con la misma clave (P2). */
  onSave: (event: DysregulationEvent) => Promise<boolean> | void;
  onBack: () => void;
  onClose: () => void;
  returnFocusTo?: React.RefObject<HTMLElement>;
}

function initialSelects(selects: CategorySelect[]): Record<string, string | null> {
  return Object.fromEntries(selects.map((sel) => [sel.key, null]));
}

/** Cambia «Otro» por lo que escribió el tutor; sin texto queda «Otro». */
function withOther(values: string[], other: string): string[] | null {
  const text = other.trim();
  const list = values.map((value) => (value === OTHER_OPTION && text ? text : value));
  return list.length > 0 ? list : null;
}

export function EventSheet({ category, subjectId, saving, onSave, onBack, onClose, returnFocusTo }: EventSheetProps) {
  const cat = CATEGORY_BY_ID[category];
  const form = CATEGORY_FORM[category];
  const usesScale = form.scaleLegend !== null;

  const [scale, setScale] = useState<string | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [time, setTime] = useState(() => toHhMm(new Date().toISOString()));
  const [selects, setSelects] = useState(() => initialSelects(form.selects));
  const [triggers, setTriggers] = useState<string[]>([]);
  const [otherTrigger, setOtherTrigger] = useState('');
  const [strategies, setStrategies] = useState<string[]>([]);
  const [otherStrategy, setOtherStrategy] = useState('');
  const [outcome, setOutcome] = useState<StrategyOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** P2: una clave por registro; se reutiliza si el guardado falla. */
  const [saveKey] = useState(() => newId());

  const intensityValue = usesScale ? (scale ? form.scaleIntensity[scale] : null) : intensity;
  const answered = intensityValue !== null && intensityValue !== undefined;
  const missingHint = usesScale ? 'Elige una opción arriba para guardar.' : 'Elige la intensidad para guardar.';

  function selected(key: CategorySelect['key']): string | null {
    const value = selects[key];
    // «Ninguno» (apoyo de Transición) equivale a no registrar apoyo.
    return value && value !== 'Ninguno' ? value : null;
  }

  /**
   * Traduce la hoja al contrato. `quick` descarta el detalle opcional pero
   * conserva la escala: es la respuesta que el tutor ya dio arriba.
   */
  function build(quick: boolean): DysregulationEvent {
    const value = intensityValue as number;
    const sensoryResponse = quick ? null : selected('sensory_response');
    return {
      subject_id: subjectId,
      occurred_at: quick ? new Date().toISOString() : toIsoAt(todayIso(), time),
      event_type: cat.eventType,
      intensity_band: intensityBand(value),
      intensity_value: value,
      qualitative_outcome: usesScale ? scale : null,
      trigger: quick ? null : withOther(triggers, otherTrigger),
      strategy_applied: quick ? null : withOther(strategies, otherStrategy),
      support_used: quick ? null : selected('support_used'),
      // Dieta sensorial reusa `resultado_estrategia` para «¿Cómo respondió?».
      strategy_outcome: quick ? null : sensoryResponse ? SENSORY_RESPONSE_TO_OUTCOME[sensoryResponse] ?? null : outcome,
      sensory_activity: quick ? null : selected('sensory_activity'),
      notes: quick ? null : notes.trim() || null,
      quick_capture: quick,
      idempotency_key: saveKey,
    };
  }

  const savingLabel = (label: string) => (saving ? 'Guardando…' : label);

  return (
    <BottomSheet
      title={`Registrar ${cat.name}`}
      titleIcon={{ name: cat.icon, color: cat.color }}
      onBack={onBack}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      {/* 1 · El dato que define el registro: escala corta o intensidad 1-10. */}
      {usesScale ? (
        <ChoiceTiles legend={form.scaleLegend!} choices={form.scale} value={scale} onChange={setScale} />
      ) : (
        <IntensitySlider value={intensity} onChange={setIntensity} />
      )}

      {/* 2 · Ruta rápida: siempre visible, arriba del detalle. */}
      <div className="nd-quick" style={{ background: category === 'desregulacion' ? 'var(--nd-risk-high-bg)' : 'var(--nd-bg)' }}>
        <div className="nd-quick__text">
          <b>Registro rápido</b>
          <span id="quick-hint">{answered ? form.quickHint : missingHint}</span>
        </div>
        <button
          type="button"
          className={`nd-quick__button nd-press${category === 'desregulacion' ? ' nd-quick__button--danger' : ''}`}
          disabled={saving || !answered}
          aria-describedby="quick-hint"
          onClick={() => onSave(build(true))}
        >
          {savingLabel('Guardar ya')}
        </button>
      </div>

      {/* 3 · Detalle: abajo y explícitamente opcional. */}
      <button
        type="button"
        className="nd-disclosure-toggle nd-press"
        aria-expanded={detailsOpen}
        aria-controls="detalle-evento"
        onClick={() => setDetailsOpen((open) => !open)}
      >
        {form.detailsLabel}
        <Icon name="chevronDown" size={18} className="nd-disclosure-toggle__chevron" />
      </button>

      {detailsOpen && (
        <div className="nd-sheetform" id="detalle-evento">
          <Field label="Hora del evento" type="time" value={time} centered onChange={setTime} />

          {form.selects.map((sel) =>
            sel.key === 'sensory_response' ? (
              <ChoiceTiles
                key={sel.key}
                legend={sel.label}
                legendStyle="field"
                choices={SENSORY_RESPONSE_CHOICES}
                value={selects[sel.key] ?? null}
                onChange={(value) => setSelects((prev) => ({ ...prev, [sel.key]: value }))}
                marker="shape"
                size="lg"
              />
            ) : (
              <ChipGroup
                key={sel.key}
                mode="single"
                legend={sel.label}
                options={sel.options}
                value={selects[sel.key] ?? null}
                onChange={(value) => setSelects((prev) => ({ ...prev, [sel.key]: value }))}
              />
            ),
          )}

          {category === 'desregulacion' && (
            <>
              <ChipGroup
                mode="multiple"
                legend="Disparadores / Desencadenantes"
                hint="Puedes marcar varios."
                options={TRIGGER_OPTIONS}
                value={triggers}
                onChange={setTriggers}
              />
              {triggers.includes(OTHER_OPTION) && (
                <Field label="¿Cuál otro disparador?" value={otherTrigger} onChange={setOtherTrigger} />
              )}
              <ChipGroup
                mode="multiple"
                legend="Estrategia aplicada / Acciones de apoyo"
                hint="Puedes marcar varias."
                options={STRATEGY_OPTIONS}
                value={strategies}
                onChange={setStrategies}
              />
              {strategies.includes(OTHER_OPTION) && (
                <Field label="¿Cuál otra estrategia?" value={otherStrategy} onChange={setOtherStrategy} />
              )}
              <ChoiceTiles
                legend="¿Cómo resultó la estrategia?"
                legendStyle="field"
                choices={STRATEGY_OUTCOME_CHOICES}
                value={outcome}
                onChange={setOutcome}
                marker="shape"
              />
            </>
          )}

          <TextArea
            label="Observaciones / Notas adicionales"
            value={notes}
            rows={category === 'desregulacion' ? 4 : 3}
            placeholder="Cualquier otra observación relevante…"
            onChange={setNotes}
          />

          <button
            type="button"
            className="nd-cta nd-press"
            disabled={saving || !answered}
            onClick={() => onSave(build(false))}
          >
            {savingLabel('Guardar registro')}
          </button>
          {!answered && <p className="nd-fieldhelp nd-fieldhelp--center">{missingHint}</p>}
        </div>
      )}
    </BottomSheet>
  );
}

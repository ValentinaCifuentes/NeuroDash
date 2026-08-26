/**
 * Sheets de registro de eventos.
 *
 * Regla del sheet (§2.6): la ruta rápida arriba y siempre visible; el
 * detalle clínico abajo y marcado como opcional. Registrar cuesta un toque.
 */

import { useState } from 'react';
import { BottomSheet } from '../components/shell';
import { Field, IntensitySlider, OptionGroup, Select, TextArea } from '../components/controls';
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  CATEGORY_FORM,
  SENSORY_RESPONSE_TO_OUTCOME,
  STRATEGY_OUTCOME_CHOICES,
  intensityBand,
  toHhMm,
  todayIso,
  toIsoAt,
} from '../domain/catalog';
import type { CategorySelect } from '../domain/catalog';
import type { DysregulationEvent, LogCategory, StrategyOutcome } from '../types';

/* ============================================================
   1. Sheet de categorías
   ============================================================ */

interface CategorySheetProps {
  onPick: (category: LogCategory) => void;
  onClose: () => void;
  returnFocusTo?: React.RefObject<HTMLElement>;
}

export function CategorySheet({ onPick, onClose, returnFocusTo }: CategorySheetProps) {
  return (
    <BottomSheet
      title={<h2 className="bl-sheet__title">¿Qué deseas registrar?</h2>}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <div className="bl-catgrid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`bl-cat bl-cat--${cat.modifier}`}
            onClick={() => onPick(cat.id)}
          >
            <span className="bl-cat__icon" aria-hidden="true">
              {cat.icon}
            </span>
            <span className="bl-cat__name">{cat.name}</span>
            <span className="bl-cat__desc">{cat.desc}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

/* ============================================================
   2. Sheet de registro de evento
   ============================================================

   Un solo componente para las cuatro categorías. Lo que cambia entre
   ellas vive en `CATEGORY_FORM`, no en ramas de JSX: la escala de arriba,
   los selects del detalle y el texto de la ruta rápida.

   Desregulación es la excepción declarada: usa el slider 1-10 y los
   campos clínicos de texto libre, porque es la única que alimenta la
   columna `intensidad` del CSV con granularidad real.
   ============================================================ */

interface EventSheetProps {
  category: LogCategory;
  subjectId: string;
  saving: boolean;
  onSave: (event: DysregulationEvent) => void;
  onBack: () => void;
  onClose: () => void;
  returnFocusTo?: React.RefObject<HTMLElement>;
}

/** Estado inicial de los selects: la primera opción, que siempre es la neutra. */
function initialSelects(selects: CategorySelect[]): Record<string, string> {
  return Object.fromEntries(selects.map((sel) => [sel.key, sel.options[0]]));
}

export function EventSheet({
  category,
  subjectId,
  saving,
  onSave,
  onBack,
  onClose,
  returnFocusTo,
}: EventSheetProps) {
  const cat = CATEGORY_BY_ID[category];
  const form = CATEGORY_FORM[category];
  const usesScale = form.scaleLegend !== null;
  // Danger solo en desregulación, donde el rojo ya es el código del módulo.
  const quickVariant = category === 'desregulacion' ? 'danger' : 'primary';

  const [scale, setScale] = useState<string>(form.scale[0]?.value ?? '');
  const [intensity, setIntensity] = useState(5);
  const [time, setTime] = useState(() => toHhMm(new Date().toISOString()));
  const [selects, setSelects] = useState(() => initialSelects(form.selects));
  const [trigger, setTrigger] = useState('');
  const [strategy, setStrategy] = useState('');
  const [outcome, setOutcome] = useState<StrategyOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);

  function clean(value: string | undefined | null): string | null {
    const v = (value ?? '').trim();
    // "Ninguno" es la opción neutra del select: equivale a no registrar apoyo.
    return v === '' || v === 'Ninguno' ? null : v;
  }

  /**
   * Traduce el formulario al contrato.
   *
   * `quick` descarta todo el detalle opcional, pero conserva la escala:
   * es la respuesta que la persona ya dio arriba, no un campo del detalle.
   */
  function build(quick: boolean): DysregulationEvent {
    const today = todayIso();
    const intensityValue = usesScale ? (form.scaleIntensity[scale] ?? 5) : intensity;

    const sensoryResponse = quick ? null : clean(selects.sensory_response);

    return {
      subject_id: subjectId,
      occurred_at: quick ? new Date().toISOString() : toIsoAt(today, time),
      event_type: cat.eventType,
      intensity_band: intensityBand(intensityValue),
      intensity_value: intensityValue,
      qualitative_outcome: usesScale ? scale : null,
      trigger: quick ? null : clean(trigger),
      // Transición registra el apoyo por select; desregulación por texto libre.
      strategy_applied: quick
        ? null
        : clean(selects.support_used) ?? clean(strategy),
      // Dieta sensorial reusa `resultado_estrategia` para "¿cómo respondió?".
      strategy_outcome: sensoryResponse
        ? SENSORY_RESPONSE_TO_OUTCOME[sensoryResponse] ?? null
        : quick
          ? null
          : outcome,
      sensory_activity: quick ? null : clean(selects.sensory_activity),
      notes: quick ? null : clean(notes),
      quick_capture: quick,
    };
  }

  return (
    <BottomSheet
      title={
        <h2 className="bl-sheet__title bl-sheet__title--lead">
          <span aria-hidden="true">{cat.icon}</span> Registrar {cat.name}
        </h2>
      }
      onBack={onBack}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      {/* 1 · El dato que define el registro: escala corta o slider clínico. */}
      {usesScale ? (
        <OptionGroup
          legend={form.scaleLegend!}
          choices={form.scale}
          value={scale}
          onChange={setScale}
          layout="row"
          boxed={false}
        />
      ) : (
        <div
          className="bl-card"
          style={{ boxShadow: 'var(--bl-sh-xs)', border: '1px solid var(--bl-border)' }}
        >
          <IntensitySlider value={intensity} onChange={setIntensity} />
        </div>
      )}

      {/* 2 · Ruta rápida: siempre visible, arriba del detalle. */}
      <div className="bl-quick" style={{ marginTop: 'var(--bl-sp-4)' }}>
        <div className="bl-quick__text">
          <b>
            <span aria-hidden="true">⚡</span> Registro rápido
          </b>
          <span>{form.quickHint}</span>
        </div>
        <button
          className={`bl-btn bl-btn--${quickVariant}`}
          disabled={saving}
          onClick={() => onSave(build(true))}
        >
          {saving ? <span className="bl-spinner" aria-hidden="true" /> : null}
          {saving ? 'Guardando…' : 'Guardar ya'}
        </button>
      </div>

      {/* 3 · Detalle: abajo y explícitamente opcional. */}
      <button
        className="bl-sheet__optional"
        style={{ background: 'none', border: 0, width: '100%', cursor: 'pointer' }}
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((v) => !v)}
      >
        {form.detailsLabel}
      </button>

      {detailsOpen && (
        <div className="bl-group">
          <Field label="Hora del evento" type="time" value={time} centered onChange={setTime} />

          {form.selects.map((sel) => (
            <Select
              key={sel.key}
              label={sel.label}
              options={sel.options}
              value={selects[sel.key] ?? sel.options[0]}
              onChange={(value) => setSelects((prev) => ({ ...prev, [sel.key]: value }))}
            />
          ))}

          {category === 'desregulacion' && (
            <>
              <Field
                label="Disparadores / Desencadenantes"
                value={trigger}
                placeholder="Ej: Ruidos, Frustración, Cambio de actividad"
                help="Separa varios con comas."
                onChange={setTrigger}
              />
              <Field
                label="Estrategia aplicada / Acciones de apoyo"
                value={strategy}
                placeholder="Ej: Espacio seguro, Presión profunda, Pictos"
                onChange={setStrategy}
              />
              <div style={{ margin: 'var(--bl-sp-4) 0' }}>
                <OptionGroup
                  legend="¿Cómo resultó la estrategia?"
                  choices={STRATEGY_OUTCOME_CHOICES}
                  value={outcome}
                  onChange={setOutcome}
                  boxed={false}
                />
              </div>
            </>
          )}

          <TextArea
            label="Observaciones / Notas adicionales"
            value={notes}
            placeholder="Cualquier otra observación relevante…"
            onChange={setNotes}
          />

          <button
            className="bl-btn bl-btn--primary bl-btn--block"
            style={{ marginTop: 'var(--bl-sp-4)' }}
            disabled={saving}
            onClick={() => onSave(build(false))}
          >
            {saving ? <span className="bl-spinner" aria-hidden="true" /> : null}
            {saving ? 'Guardando…' : 'Guardar registro'}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

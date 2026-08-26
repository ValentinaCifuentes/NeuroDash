/**
 * Sheets de registro de eventos.
 *
 * Regla del sheet (§2.6): la ruta rápida arriba y siempre visible; el
 * detalle clínico abajo y marcado como opcional. Registrar cuesta un toque.
 */

import { useState } from 'react';
import { BottomSheet } from '../components/shell';
import { Field, IntensitySlider, OptionGroup } from '../components/controls';
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  STRATEGY_OUTCOME_CHOICES,
  intensityBand,
  toHhMm,
  toIsoAt,
} from '../domain/catalog';
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
  const hasIntensity = category !== 'sensorial';
  // Danger solo en desregulación, donde el rojo ya es el código del módulo.
  const quickVariant = category === 'desregulacion' ? 'danger' : 'primary';

  const [intensity, setIntensity] = useState(hasIntensity ? 5 : 1);
  const [time, setTime] = useState(() => toHhMm(new Date().toISOString()));
  const [trigger, setTrigger] = useState('');
  const [strategy, setStrategy] = useState('');
  const [outcome, setOutcome] = useState<StrategyOutcome | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function build(quick: boolean): DysregulationEvent {
    const today = new Date().toISOString().slice(0, 10);
    return {
      subject_id: subjectId,
      occurred_at: quick ? new Date().toISOString() : toIsoAt(today, time),
      event_type: cat.eventType,
      intensity_band: intensityBand(intensity),
      intensity_value: intensity,
      trigger: quick ? null : trigger.trim() || null,
      strategy_applied: quick ? null : strategy.trim() || null,
      strategy_outcome: quick ? null : outcome,
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
      {hasIntensity && (
        <div className="bl-card" style={{ boxShadow: 'var(--bl-sh-xs)', border: '1px solid var(--bl-border)' }}>
          <IntensitySlider value={intensity} onChange={setIntensity} />
        </div>
      )}

      {/* Ruta rápida: siempre visible, arriba del detalle clínico. */}
      <div
        className="bl-quick"
        style={{ marginTop: hasIntensity ? 'var(--bl-sp-4)' : 0 }}
      >
        <div className="bl-quick__text">
          <b>
            <span aria-hidden="true">⚡</span> Registro rápido
          </b>
          <span>
            {hasIntensity
              ? 'Guarda la intensidad con la hora actual'
              : 'Guarda el apoyo con la hora actual'}
          </span>
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

      {/* Detalle clínico: abajo y explícitamente opcional. */}
      <button
        className="bl-sheet__optional"
        style={{ background: 'none', border: 0, width: '100%', cursor: 'pointer' }}
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((v) => !v)}
      >
        ¿Deseas agregar más detalles clínicos? (opcional)
      </button>

      {detailsOpen && (
        <div className="bl-group">
          <Field label="Hora del evento" type="time" value={time} centered onChange={setTime} />
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
          <div style={{ marginTop: 'var(--bl-sp-4)' }}>
            <OptionGroup
              legend="¿Cómo resultó la estrategia?"
              choices={STRATEGY_OUTCOME_CHOICES}
              value={outcome}
              onChange={setOutcome}
              boxed={false}
            />
          </div>
          <button
            className="bl-btn bl-btn--primary bl-btn--block"
            style={{ marginTop: 'var(--bl-sp-4)' }}
            disabled={saving}
            onClick={() => onSave(build(false))}
          >
            {saving ? <span className="bl-spinner" aria-hidden="true" /> : null}
            {saving ? 'Guardando…' : `Guardar ${cat.name.toLowerCase()}`}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

/**
 * Primitivas de formulario del design system.
 *
 * Todas cumplen §3.4: área táctil ≥44px, `role` correcto, navegación con
 * flechas en grupos de opción, y ningún estado comunicado solo por color.
 */

import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Choice, Level } from '../domain/catalog';
import { SEMANTIC_COLOR, choiceShape, intensityWord } from '../domain/catalog';
import { LevelBars, ShapeMark } from './marks';
import { Icon } from './icons';

/* ============================================================
   Navegación con flechas en grupos de una opción (radio y tabs)
   ============================================================ */

/**
 * Patrón «roving tabindex»: solo la opción elegida (o la primera) entra en el
 * orden de tabulación, y las flechas mueven el foco y la selección.
 */
export function useRovingGroup(count: number, onMove: (index: number) => void) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  function onKeyDown(event: KeyboardEvent<HTMLElement>, index: number) {
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    if (!forward && !backward) return;
    event.preventDefault();
    const next = (index + (forward ? 1 : -1) + count) % count;
    refs.current[next]?.focus();
    onMove(next);
  }
  const setRef = (index: number) => (el: HTMLElement | null) => {
    refs.current[index] = el;
  };
  return { onKeyDown, setRef };
}

/* ============================================================
   SegmentedTabs · dos vistas de una misma pantalla
   ============================================================ */

interface SegmentedTabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}

export function SegmentedTabs<T extends string>({ tabs, active, onChange, label }: SegmentedTabsProps<T>) {
  const { onKeyDown, setRef } = useRovingGroup(tabs.length, (i) => onChange(tabs[i].id));
  return (
    <div className="nd-seg" role="tablist" aria-label={label}>
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          ref={setRef(i)}
          type="button"
          role="tab"
          className="nd-seg__tab nd-press"
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   ChoiceTiles · escala de tres pasos en tarjetas
   ============================================================

   `bars`: 1 a 3 barras (sueño, despertar, autonomía y escalas de registro).
   `shape`: ● ◐/◆ ▲ centrada (resultado de una estrategia, ¿cómo respondió?).
   Una sola opción; sin selección inicial si `value` es null. */

interface ChoiceTilesProps<T extends string> {
  /** Eyebrow del dominio (DESCANSO NOCTURNO…), opcional. */
  eyebrow?: string;
  /** La pregunta; nombra el grupo para el lector de pantalla. */
  legend: string;
  /** `section`: 16 px (Bitácora, escalas); `field`: 13 px gris (detalle de una hoja). */
  legendStyle?: 'section' | 'field';
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  marker?: 'bars' | 'shape';
  /** Solo `shape`: 56 px (estrategia) o 64 px (¿cómo respondió?). */
  size?: 'md' | 'lg';
}

export function ChoiceTiles<T extends string>({
  eyebrow,
  legend,
  legendStyle = 'section',
  choices,
  value,
  onChange,
  marker = 'bars',
  size = 'md',
}: ChoiceTilesProps<T>) {
  const legendId = useId();
  const { onKeyDown, setRef } = useRovingGroup(choices.length, (i) => onChange(choices[i].value));
  const focusable = value === null ? 0 : choices.findIndex((c) => c.value === value);
  return (
    <div className="nd-question">
      {eyebrow && <p className="nd-eyebrow">{eyebrow}</p>}
      <p className={`nd-legend nd-legend--${legendStyle}`} id={legendId}>
        {legend}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={legendId}
        className={`nd-tiles nd-tiles--${marker}${marker === 'shape' ? ` nd-tiles--${size}` : ''}`}
      >
        {choices.map((choice, i) => {
          const checked = value === choice.value;
          return (
            <button
              key={choice.value}
              ref={setRef(i)}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={i === focusable ? 0 : -1}
              className="nd-tile nd-press"
              onClick={() => onChange(choice.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {marker === 'bars' ? (
                <LevelBars level={choice.level ?? ((i + 1) as Level)} />
              ) : (
                <ShapeMark
                  shape={choiceShape(choice)}
                  color={SEMANTIC_COLOR[choice.dot ?? 'neutral']}
                  size={size === 'lg' ? 12 : 10}
                />
              )}
              <span className="nd-tile__label">{choice.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   ShapeList · lista de una opción con forma y color (Digestión)
   ============================================================ */

interface ShapeListProps<T extends string> {
  label: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

export function ShapeList<T extends string>({ label, choices, value, onChange }: ShapeListProps<T>) {
  const { onKeyDown, setRef } = useRovingGroup(choices.length, (i) => onChange(choices[i].value));
  const focusable = value === null ? 0 : choices.findIndex((c) => c.value === value);
  return (
    <div role="radiogroup" aria-label={label} className="nd-shapelist">
      {choices.map((choice, i) => {
        const checked = value === choice.value;
        return (
          <button
            key={choice.value}
            ref={setRef(i)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === focusable ? 0 : -1}
            className="nd-shapelist__row nd-press"
            onClick={() => onChange(choice.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <ShapeMark shape={choiceShape(choice)} color={SEMANTIC_COLOR[choice.dot ?? 'neutral']} size={12} />
            <span className="nd-shapelist__label">{choice.label}</span>
            <span className="nd-radio" aria-hidden="true">
              {checked && <Icon name="check" size={14} strokeWidth={2.4} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   ChipGroup · catálogo cerrado en chips (reemplaza a Select)
   ============================================================

   `single`: radiogroup, flechas para moverse; tocar la opción elegida la
   quita (son campos opcionales: «sin responder» es distinto de cualquier opción).
   `multiple`: casillas independientes. Siempre empieza sin selección. */

type ChipGroupProps = {
  legend: string;
  legendStyle?: 'section' | 'field';
  hint?: string;
  options: string[];
} & (
  | { mode: 'single'; value: string | null; onChange: (value: string | null) => void }
  | {
      mode: 'multiple';
      value: string[];
      onChange: (value: string[]) => void;
      /** Opción «nada» («Ninguna», «No»): al elegirla se desmarcan las demás, y al revés. */
      exclusive?: string;
    }
);

export function ChipGroup(props: ChipGroupProps) {
  const { legend, legendStyle = 'field', hint, options } = props;
  const legendId = useId();
  const isOn = (option: string) =>
    props.mode === 'single' ? props.value === option : props.value.includes(option);
  const toggle = (option: string) => {
    if (props.mode === 'single') {
      props.onChange(props.value === option ? null : option);
      return;
    }
    if (isOn(option)) {
      props.onChange(props.value.filter((v) => v !== option));
    } else if (option === props.exclusive) {
      props.onChange([option]);
    } else {
      props.onChange([...props.value.filter((v) => v !== props.exclusive), option]);
    }
  };
  const { onKeyDown, setRef } = useRovingGroup(options.length, (i) => {
    if (props.mode === 'single') props.onChange(options[i]);
  });
  const selectedIndex = props.mode === 'single' ? options.indexOf(props.value ?? '') : -1;
  const focusable = selectedIndex >= 0 ? selectedIndex : 0;
  return (
    <div className="nd-question">
      <p className={`nd-legend nd-legend--${legendStyle}`} id={legendId}>
        {legend}
      </p>
      {hint && <p className="nd-hint">{hint}</p>}
      <div
        role={props.mode === 'single' ? 'radiogroup' : 'group'}
        aria-labelledby={legendId}
        className="nd-chips"
      >
        {options.map((option, i) => {
          const on = isOn(option);
          return (
            <button
              key={option}
              ref={setRef(i)}
              type="button"
              role={props.mode === 'single' ? 'radio' : 'checkbox'}
              aria-checked={on}
              tabIndex={props.mode === 'single' ? (i === focusable ? 0 : -1) : 0}
              className="nd-chip nd-press"
              onClick={() => toggle(option)}
              onKeyDown={props.mode === 'single' ? (e) => onKeyDown(e, i) : undefined}
            >
              {on && <Icon name="check" size={14} strokeWidth={3} />}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Switch · role="switch", nunca un div suelto (§3.4)
   ============================================================ */

interface SwitchProps {
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, checked, disabled, onChange }: SwitchProps) {
  const labelId = useId();
  return (
    <div className={`nd-switchrow${disabled ? ' nd-switchrow--disabled' : ''}`}>
      <span id={labelId} className="nd-switchrow__label">
        {label}
      </span>
      <button
        type="button"
        className="nd-switch"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="nd-switch__thumb" aria-hidden="true" />
      </button>
    </div>
  );
}

/* ============================================================
   Slider de intensidad (screens/Final-Registro-Desregulacion.html)
   ============================================================

   Parte sin valor (P13): el tutor debe elegir la intensidad. Mientras tanto
   el pulgar no se dibuja y el número dice «–». Un toque, un arrastre o una
   flecha del teclado cuentan como elección, aunque caiga en el 5 del medio. */

interface IntensityProps {
  value: number | null;
  onChange: (value: number) => void;
}

const INTENSITY_TONE: Record<string, { fill: string; bg: string; fg: string }> = {
  Leve: { fill: 'var(--nd-risk-low)', bg: 'var(--nd-risk-low-bg)', fg: 'var(--nd-risk-low-fg)' },
  Moderado: { fill: 'var(--nd-risk-mid)', bg: 'var(--nd-risk-mid-bg)', fg: 'var(--nd-risk-mid-fg)' },
  Fuerte: { fill: 'var(--nd-risk-high)', bg: 'var(--nd-risk-high-bg)', fg: 'var(--nd-risk-high-fg)' },
};

export function IntensitySlider({ value, onChange }: IntensityProps) {
  const id = useId();
  const word = value === null ? null : intensityWord(value);
  const tone = word ? INTENSITY_TONE[word] : null;
  const percent = value === null ? 0 : ((value - 1) / 9) * 100;
  const pick = (target: HTMLInputElement) => onChange(Number(target.value));
  return (
    <div className={`nd-intensity${value === null ? ' nd-intensity--empty' : ''}`}>
      <div className="nd-intensity__head">
        <label htmlFor={id} className="nd-intensity__label">
          Intensidad
        </label>
        <span className="nd-intensity__value">
          <strong>{value ?? '–'}</strong>
          {tone ? (
            <span className="nd-intensity__word" style={{ background: tone.bg, color: tone.fg }}>
              {word}
            </span>
          ) : (
            <span className="nd-intensity__word nd-intensity__word--empty">Sin elegir</span>
          )}
        </span>
      </div>
      <div className="nd-intensity__track">
        <div className="nd-intensity__rail" aria-hidden="true" />
        {tone && (
          <>
            <div className="nd-intensity__fill" aria-hidden="true" style={{ width: `${percent}%`, background: tone.fill }} />
            <div className="nd-intensity__thumb" aria-hidden="true" style={{ left: `calc(${percent}% - 14px)` }} />
          </>
        )}
        <input
          id={id}
          type="range"
          min={1}
          max={10}
          step={1}
          value={value ?? 5}
          aria-valuetext={value === null ? 'Sin elegir' : `${value}, ${word!.toLowerCase()}`}
          onChange={(e) => pick(e.target)}
          onPointerUp={(e) => value === null && pick(e.currentTarget)}
          onKeyUp={(e) => value === null && e.key.startsWith('Arrow') && pick(e.currentTarget)}
        />
      </div>
      <div className="nd-intensity__scale" aria-hidden="true">
        <span>1 · Leve</span>
        <span>Moderado</span>
        <span>Fuerte · 10</span>
      </div>
    </div>
  );
}

/* ============================================================
   Campo de texto
   ============================================================ */

interface FieldProps {
  label: string;
  value: string;
  placeholder?: string;
  help?: string;
  centered?: boolean;
  type?: string;
  onChange: (value: string) => void;
}

export function Field({ label, value, placeholder, help, centered, type = 'text', onChange }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="nd-fieldset">
      <label className="nd-fieldlabel" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={`nd-field${centered ? ' nd-field--center' : ''}`}
        value={value}
        placeholder={placeholder}
        aria-describedby={help ? helpId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {help && (
        <p className="nd-fieldhelp" id={helpId}>
          {help}
        </p>
      )}
    </div>
  );
}

/* ============================================================
   Área de texto · observaciones libres
   ============================================================ */

interface TextAreaProps {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  /** Muestra contador y corta la entrada. */
  maxLength?: number;
  help?: string;
  onChange: (value: string) => void;
}

export function TextArea({ label, value, placeholder, rows = 3, maxLength, help, onChange }: TextAreaProps) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="nd-fieldset">
      <label className="nd-fieldlabel" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="nd-field nd-field--area"
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-describedby={help ? helpId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {(help || maxLength) && (
        <div className="nd-fieldfoot">
          {help ? (
            <p className="nd-fieldhelp" id={helpId}>
              {help}
            </p>
          ) : (
            <span />
          )}
          {maxLength && (
            /* aria-live off: el contador cambia en cada tecla y sería ruido. */
            <span className="nd-fieldhelp" aria-hidden="true">
              {value.length} / {maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

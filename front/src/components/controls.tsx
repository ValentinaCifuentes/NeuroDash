/**
 * Primitivas de formulario del design system.
 *
 * Todas cumplen §3.4: área táctil ≥44px, `role` correcto, navegación con
 * flechas en grupos de opción, y ningún estado comunicado solo por color.
 */

import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Choice, Semantic } from '../domain/catalog';
import { SEMANTIC_COLOR, intensitySemantic, intensityWord } from '../domain/catalog';

/* ============================================================
   Tabs segmentados · máximo dos vistas (§2.4)
   ============================================================ */

interface TabsProps<T extends string> {
  tabs: { id: T; label: string; icon?: string }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}

export function Tabs<T extends string>({ tabs, active, onChange, label }: TabsProps<T>) {
  return (
    <div className="bl-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          className="bl-tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   Grupo de opciones · patrón central del producto (§2.3)
   ============================================================ */

interface OptionGroupProps<T extends string> {
  /** Eyebrow del dominio clínico: DESCANSO NOCTURNO, DIGESTIÓN… */
  eyebrow?: string;
  eyebrowIcon?: string;
  /** La pregunta concreta. */
  legend: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Envuelve en bloque `surface-alt` cuando agrupa dentro de una card. */
  boxed?: boolean;
  /**
   * `stack` (por defecto) apila las opciones: etiquetas largas, lectura
   * vertical. `row` las pone en tres columnas; solo para escalas de una
   * o dos palabras, donde caben sin truncarse a 320px.
   */
  layout?: 'stack' | 'row';
}

export function OptionGroup<T extends string>({
  eyebrow,
  eyebrowIcon,
  legend,
  choices,
  value,
  onChange,
  boxed = true,
  layout = 'stack',
}: OptionGroupProps<T>) {
  const legendId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const next = (index + (forward ? 1 : -1) + choices.length) % choices.length;
    refs.current[next]?.focus();
    onChange(choices[next].value);
  }

  const body = (
    <>
      {eyebrow && (
        <p className="bl-eyebrow" style={{ margin: 0 }}>
          {eyebrowIcon && <span aria-hidden="true">{eyebrowIcon}</span>}
          {eyebrow}
        </p>
      )}
      <p className="bl-legend" id={legendId}>
        {legend}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={legendId}
        className={layout === 'row' ? 'bl-optionrow' : undefined}
      >
        {choices.map((choice, i) => {
          const checked = value === choice.value;
          return (
            <button
              key={choice.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (value === null && i === 0) ? 0 : -1}
              className={`bl-option${layout === 'row' ? ' bl-option--compact' : ''}`}
              onClick={() => onChange(choice.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {choice.dot && (
                <span
                  className="bl-dot"
                  style={{ background: SEMANTIC_COLOR[choice.dot] }}
                  aria-hidden="true"
                />
              )}
              {choice.icon && <span aria-hidden="true">{choice.icon}</span>}
              <span className="bl-option__label">{choice.label}</span>
              <span className="bl-option__mark" aria-hidden="true">
                ✓
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  return boxed ? <div className="bl-group">{body}</div> : <div>{body}</div>;
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
    <div className="bl-switch-row" style={disabled ? { opacity: 0.45 } : undefined}>
      <button
        type="button"
        className="bl-switch"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
      <span id={labelId}>{label}</span>
    </div>
  );
}

/* ============================================================
   Slider de intensidad · badge numérico + escala textual (§2.2)
   ============================================================ */

interface IntensityProps {
  value: number;
  onChange: (value: number) => void;
}

export function IntensitySlider({ value, onChange }: IntensityProps) {
  const semantic: Semantic = intensitySemantic(value);
  return (
    <div className="bl-group" style={{ background: 'var(--bl-surface)' , border: 0, padding: 0 }}>
      <div className="app-row">
        <b style={{ color: 'var(--bl-text)', fontSize: 'var(--bl-fs-h3)' }}>
          Intensidad del episodio
        </b>
        <span
          className="bl-badge"
          style={
            semantic === 'danger'
              ? { background: 'var(--bl-danger)', color: '#fff' }
              : { background: 'var(--bl-warning-bg)', color: '#8A6D06' }
          }
        >
          {value} / 10 · {intensityWord(value)}
        </span>
      </div>
      <input
        className="bl-slider"
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Intensidad del episodio"
        aria-valuetext={`Intensidad ${value} de 10, ${intensityWord(value)}`}
      />
      <div className="bl-scale">
        <span>Leve</span>
        <span>Moderado</span>
        <span>Fuerte</span>
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

export function Field({
  label,
  value,
  placeholder,
  help,
  centered,
  type = 'text',
  onChange,
}: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="bl-field">
      <label className="bl-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={`bl-input${centered ? ' bl-input--center' : ''}`}
        value={value}
        placeholder={placeholder}
        aria-describedby={help ? helpId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {help && (
        <p className="bl-help" id={helpId}>
          {help}
        </p>
      )}
    </div>
  );
}

/* ============================================================
   Select · las categorías con vocabulario cerrado lo usan en vez
   de texto libre, para que el dato llegue comparable al motor
   ============================================================ */

interface SelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export function Select({ label, value, options, onChange }: SelectProps) {
  const id = useId();
  return (
    <div className="bl-field">
      <label className="bl-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="bl-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
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
  /** Muestra contador y corta la entrada. Los campos de sesión usan 2000. */
  maxLength?: number;
  help?: string;
  onChange: (value: string) => void;
}

export function TextArea({
  label,
  value,
  placeholder,
  rows = 3,
  maxLength,
  help,
  onChange,
}: TextAreaProps) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="bl-field">
      <label className="bl-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="bl-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-describedby={help ? helpId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {(help || maxLength) && (
        <div className="bl-field__foot">
          {help ? (
            <p className="bl-help" id={helpId}>
              {help}
            </p>
          ) : (
            <span />
          )}
          {maxLength && (
            /* aria-live off: el contador cambia en cada tecla y sería ruido. */
            <span className="bl-counter" aria-hidden="true">
              {value.length} / {maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

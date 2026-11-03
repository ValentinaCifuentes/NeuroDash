/**
 * Perfil sensorial: 5 canales × 3 niveles (Perfil · paso 3, DESIGN-SPEC §4).
 * Cada fila es un radiogroup («Sonidos») con flechas; cada celda se anuncia
 * entera («Sonidos: le molesta»). El valor viaja a `sensory_context` como −1/0/1.
 */

import { SENSORY_CHANNELS, SENSORY_LEVELS, type SensoryChannel, type SensoryLevel } from '../domain/catalog';
import { useRovingGroup } from './controls';

type SensoryValue = Partial<Record<SensoryChannel, SensoryLevel>>;

interface Props {
  value: SensoryValue;
  onChange: (channel: SensoryChannel, level: SensoryLevel) => void;
}

export function SensoryMatrix({ value, onChange }: Props) {
  return (
    <div className="nd-sensory">
      <div className="nd-sensory__row nd-sensory__head" aria-hidden="true">
        <span />
        {SENSORY_LEVELS.map((level) => (
          <span key={level.value}>{level.label}</span>
        ))}
      </div>
      {SENSORY_CHANNELS.map((channel) => (
        <SensoryRow
          key={channel.key}
          label={channel.label}
          selected={value[channel.key]}
          onSelect={(level) => onChange(channel.key, level)}
        />
      ))}
    </div>
  );
}

function SensoryRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: SensoryLevel | undefined;
  onSelect: (level: SensoryLevel) => void;
}) {
  const { onKeyDown, setRef } = useRovingGroup(SENSORY_LEVELS.length, (i) => onSelect(SENSORY_LEVELS[i].value));
  const focusable = selected === undefined ? 1 : SENSORY_LEVELS.findIndex((l) => l.value === selected);
  return (
    <div role="radiogroup" aria-label={label} className="nd-sensory__row">
      <span className="nd-sensory__label">{label}</span>
      {SENSORY_LEVELS.map((level, i) => {
        const checked = selected === level.value;
        return (
          <button
            key={level.value}
            ref={setRef(i)}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${label}: ${level.label.toLowerCase()}`}
            tabIndex={i === focusable ? 0 : -1}
            className="nd-sensory__cell nd-press"
            onClick={() => onSelect(level.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span
              className="nd-sensory__dot"
              aria-hidden="true"
              style={{ background: checked ? level.color : 'var(--nd-border-soft)' }}
            />
          </button>
        );
      })}
    </div>
  );
}

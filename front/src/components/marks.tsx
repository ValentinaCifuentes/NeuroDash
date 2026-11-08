/**
 * Marcas visuales sin emoji: refuerzan el significado de una opción con forma
 * y luminosidad, además del color (el color nunca es la única señal).
 *
 * - `LevelBars`: 1 a 3 barras crecientes, como en las tarjetas de sueño,
 *   despertar y autonomía del prototipo.
 * - `ShapeMark`: ● / ◐ / ◆ / ▲ para escalas de tres pasos (digestión, riesgo,
 *   resultado de una estrategia).
 *
 * Son decorativas (`aria-hidden`): el texto de la opción ya dice lo que significa.
 */

import { LEVEL_COLOR, type Level, type Shape } from '../domain/catalog';

export function LevelBars({ level }: { level: Level }) {
  const color = LEVEL_COLOR[level];
  return (
    <span className="nd-levelbars" aria-hidden="true">
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className="nd-levelbars__bar"
          style={{ height: 3 + bar * 3, background: bar <= level ? color : 'var(--nd-border-soft)' }}
        />
      ))}
    </span>
  );
}

export function ShapeMark({ shape, color, size = 12 }: { shape: Shape; color: string; size?: number }) {
  return (
    <svg
      className="nd-shape"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flex: `0 0 ${size}px` }}
    >
      {shape === 'circle' && <circle cx="12" cy="12" r="10" fill={color} />}
      {shape === 'half' && (
        <>
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.6" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill={color} />
        </>
      )}
      {shape === 'diamond' && <path d="M12 2 22 12 12 22 2 12z" fill={color} />}
      {shape === 'triangle' && <path d="M12 2 23 22H1z" fill={color} />}
    </svg>
  );
}

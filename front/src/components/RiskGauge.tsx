/**
 * Medidor de riesgo semicircular (screens/Final-Evolucion.html).
 *
 * Arco de 260×150 en tres tramos: solo el tramo del nivel actual lleva color.
 * El número es un índice demostrativo fijo por nivel, no el puntaje del modelo
 * (el contrato no lo expone). Riesgo y confianza son ejes distintos: la
 * confianza no cambia el color, solo se dice en la etiqueta accesible.
 *
 * `abstained`: arco punteado y guion (screens/Final-Evolucion-Abstencion.html).
 */

const CENTER = { x: 130, y: 130 };
const RADIUS = 110;

/** Tramos del arco en grados (180° = izquierda, 0° = derecha), con separación entre ellos. */
const SEGMENTS: { level: RiskLevel; from: number; to: number; color: string }[] = [
  { level: 'LOW', from: 178.2, to: 122.4, color: 'var(--nd-risk-low)' },
  { level: 'MODERATE', from: 117, to: 63, color: 'var(--nd-risk-mid)' },
  { level: 'ELEVATED', from: 57.6, to: 1.8, color: 'var(--nd-risk-high)' },
];

export type RiskLevel = 'LOW' | 'MODERATE' | 'ELEVATED';

export const RISK_INDEX: Record<RiskLevel, number> = { LOW: 20, MODERATE: 50, ELEVATED: 80 };

const RISK_WORD: Record<RiskLevel, string> = { LOW: 'riesgo bajo', MODERATE: 'riesgo moderado', ELEVATED: 'riesgo elevado' };

function point(degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  return { x: CENTER.x + RADIUS * Math.cos(rad), y: CENTER.y - RADIUS * Math.sin(rad) };
}

function arc(from: number, to: number) {
  const a = point(from);
  const b = point(to);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${RADIUS} ${RADIUS} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

interface Props {
  risk: RiskLevel | null;
  /** «Confianza media», etc.; se lee en la etiqueta accesible. */
  confidenceLabel?: string;
  abstained?: boolean;
}

export function RiskGauge({ risk, confidenceLabel, abstained }: Props) {
  if (abstained || !risk) {
    return (
      <div className="nd-gauge" aria-hidden="true">
        <svg width="250" height="130" viewBox="0 0 260 150">
          <path
            d="M20 130 A110 110 0 0 1 240 130"
            fill="none"
            stroke="var(--nd-neutral-1)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray="2 22"
          />
          <text x="130" y="118" textAnchor="middle" fontSize="48" fontWeight="600" fill="#B9ACB3">
            —
          </text>
        </svg>
      </div>
    );
  }

  const index = RISK_INDEX[risk];
  const marker = point(180 - (index / 100) * 180);
  const active = SEGMENTS.find((segment) => segment.level === risk)!;
  const label = [`Índice demostrativo ${index} de 100`, RISK_WORD[risk], confidenceLabel?.toLowerCase()]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="nd-gauge">
      <svg width="250" height="144" viewBox="0 0 260 150" role="img" aria-label={label}>
        {SEGMENTS.map((segment) => (
          <path
            key={segment.level}
            d={arc(segment.from, segment.to)}
            fill="none"
            stroke={segment.level === risk ? segment.color : 'var(--nd-neutral-1)'}
            strokeWidth="16"
            strokeLinecap="round"
          />
        ))}
        <circle cx={marker.x} cy={marker.y} r="10" fill="var(--nd-surface)" stroke={active.color} strokeWidth="5" />
        <text x="130" y="114" textAnchor="middle" fontSize="60" fontWeight="700" fill="var(--nd-ink)">
          {index}
        </text>
        <text x="130" y="140" textAnchor="middle" fontSize="13" fontWeight="500" fill="var(--nd-muted)">
          índice demostrativo
        </text>
      </svg>
    </div>
  );
}


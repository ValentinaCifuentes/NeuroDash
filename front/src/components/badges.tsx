/**
 * Insignias de la estimación. Riesgo y confianza son dos ejes distintos
 * (DESIGN-SPEC §1): el riesgo usa color + forma de su nivel; la confianza
 * usa tinta oscura y una forma propia, nunca los colores de riesgo.
 */

import { RISK_LABEL, RISK_SEMANTIC, RISK_SHAPE, SEMANTIC_BG, SEMANTIC_COLOR, SEMANTIC_FG } from '../domain/catalog';
import type { ConfidenceLevel } from '../types';
import { ShapeMark } from './marks';

export function RiskBadge({ risk }: { risk: 'LOW' | 'MODERATE' | 'ELEVATED' }) {
  const semantic = RISK_SEMANTIC[risk];
  return (
    <span className="nd-badge" style={{ background: SEMANTIC_BG[semantic], color: SEMANTIC_FG[semantic] }}>
      <ShapeMark shape={RISK_SHAPE[risk]} color={SEMANTIC_COLOR[semantic]} size={14} />
      {RISK_LABEL[risk]}
    </span>
  );
}

const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = {
  HIGH: 'Confianza alta',
  MEDIUM: 'Confianza media',
  LOW: 'Confianza baja',
  INSUFFICIENT: 'Información insuficiente',
};

/** Cuánto respaldo tiene la estimación: ● alta, ◐ media, ○ baja, círculo punteado si no alcanza. */
function ConfidenceMark({ level }: { level: ConfidenceLevel }) {
  if (level === 'INSUFFICIENT') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--nd-muted)" strokeWidth="2.4" strokeDasharray="3 3">
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill={level === 'HIGH' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" />
      {level === 'MEDIUM' && <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />}
    </svg>
  );
}

export function ConfidenceChip({ level }: { level: ConfidenceLevel }) {
  return (
    <span className={`nd-confidence${level === 'INSUFFICIENT' ? ' nd-confidence--insufficient' : ''}`}>
      <ConfidenceMark level={level} />
      {CONFIDENCE_TEXT[level]}
    </span>
  );
}

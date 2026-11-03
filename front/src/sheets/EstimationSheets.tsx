/**
 * Hojas de la estimación (screens/Final-Evolucion-Porque.html y -Datos.html).
 *
 * - «Por qué aparece así»: factores ↑/↓ con el nombre legible que envía el motor
 *   y, al pie, de dónde salen los datos (decisión D3 del plan).
 * - «Puede mejorar la lectura»: qué dato falta, por qué importa y dónde se registra.
 *
 * Lenguaje no causal: un factor «aparece junto a» más o menos riesgo, no lo causa.
 */

import type { RefObject } from 'react';
import { BottomSheet } from '../components/shell';
import { Icon } from '../components/icons';
import type { MissingDataItem, Prediction, PredictionFactor } from '../types';

/**
 * El motor envía una entrada por variable y ventana («estado al despertar» en
 * 1, 3 y 7 días…). El prototipo muestra una fila por variable: se deja la
 * primera (el motor las ordena por peso) y el resto queda en «Ver todas».
 */
export function factorFamily(code: string): string {
  return code
    .replace(/^desviacion_/, '')
    .replace(/_linea_base$/, '')
    .replace(/_(un_dia|dos_dias|tres_dias|siete_dias|catorce_dias)$/, '')
    .replace(/_promedio$/, '');
}

function strongestPerFamily(factors: PredictionFactor[]): PredictionFactor[] {
  const seen = new Set<string>();
  return factors.filter((factor) => {
    const family = factorFamily(factor.code);
    if (seen.has(family)) return false;
    seen.add(family);
    return true;
  });
}

/** Factores que se ven sin pedir más; el resto queda detrás de «Ver todas». */
const VISIBLE_FACTORS = 6;

interface SheetBaseProps {
  prediction: Prediction;
  onClose: () => void;
  returnFocusTo?: RefObject<HTMLElement>;
}

export function FactorsSheet({ prediction, onClose, returnFocusTo, showAll, onShowAll }: SheetBaseProps & { showAll: boolean; onShowAll: () => void }) {
  const grouped = strongestPerFamily(prediction.factors);
  const factors = showAll ? prediction.factors : grouped.slice(0, VISIBLE_FACTORS);
  const synthetic = isSynthetic(prediction);
  return (
    <BottomSheet title="Señales recientes" eyebrow="Por qué aparece así" onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="nd-factors__legend" aria-hidden="true">
        <span><b className="nd-up">↑</b> empuja hacia arriba</span>
        <span><b className="nd-down">↓</b> empuja hacia abajo</span>
      </div>
      <ul className="nd-factors">
        {factors.map((factor) => (
          <FactorRow key={factor.code + factor.window} factor={factor} />
        ))}
      </ul>
      {!showAll && prediction.factors.length > factors.length && (
        <button type="button" className="nd-linkbutton nd-press" onClick={onShowAll}>
          Ver todas las señales ({prediction.factors.length})
        </button>
      )}
      <p className="nd-provenance">
        <Icon name="info" size={16} />
        <span>
          {synthetic
            ? 'Estimación de demostración: usa datos sintéticos.'
            : 'Usa los datos registrados para este infante.'}{' '}
          Muestra asociaciones del historial, no causas, y no es un diagnóstico.
        </span>
      </p>
    </BottomSheet>
  );
}

function FactorRow({ factor }: { factor: PredictionFactor }) {
  const up = factor.direction === 'up';
  return (
    <li className="nd-factor">
      <span className={`nd-factor__dir nd-factor__dir--${factor.direction}`} aria-hidden="true">
        {up ? '↑' : '↓'}
      </span>
      <span className="nd-factor__text">
        <span className="nd-factor__label">
          {factor.label}
          <span className="nd-sr-only"> · empuja hacia {up ? 'arriba' : 'abajo'}</span>
        </span>
        {/* La ventana ya va en el nombre («…en los últimos tres días»). */}
        <span className="nd-factor__meta">Aparece junto a {up ? 'más' : 'menos'} riesgo</span>
      </span>
    </li>
  );
}

/** Dónde se registra cada dato que puede faltar. */
function whereToRecord(item: MissingDataItem): string {
  return ['event_count', 'dysregulation_count', 'max_intensity'].includes(item.code)
    ? 'Se registra con el botón + de la Bitácora'
    : 'Se registra en Bitácora · Mi Día';
}

export function MissingDataSheet({
  prediction,
  onClose,
  returnFocusTo,
  onOpenBitacora,
}: SheetBaseProps & { onOpenBitacora: () => void }) {
  const items = prediction.missingness;
  const single = items.length === 1 ? items[0] : null;
  // Abstención sin campos faltantes: lo que falta son días de historial (p. ej. PAC-C).
  const needsHistory = prediction.abstained && items.length === 0;
  return (
    <BottomSheet title="Puede mejorar la lectura" eyebrow="Datos que faltan" onClose={onClose} returnFocusTo={returnFocusTo}>
      {needsHistory ? (
        <ul className="nd-missing">
          <li className="nd-missing__item">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--nd-missing)" strokeWidth="2.4" strokeDasharray="3 3">
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span className="nd-missing__text">
              <b>Más días de registro</b>
              <span>Con pocos días de historial todavía no se puede estimar. Cada día registrado ayuda.</span>
              <span className="nd-missing__where">Se registra en Bitácora · Mi Día</span>
            </span>
          </li>
        </ul>
      ) : items.length === 0 ? (
        <p className="nd-sheet__copy">Con los datos registrados alcanza para esta lectura.</p>
      ) : (
        <ul className="nd-missing">
          {items.map((item) => (
            <li key={item.code} className="nd-missing__item">
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--nd-missing)" strokeWidth="2.4" strokeDasharray="3 3">
                <circle cx="12" cy="12" r="9" />
              </svg>
              <span className="nd-missing__text">
                <b>{item.label}</b>
                <span>
                  {item.is_core
                    ? 'Cuenta para la confianza de la estimación.'
                    : 'Es opcional: ayuda a la lectura, pero no baja la confianza.'}
                </span>
                <span className="nd-missing__where">{whereToRecord(item)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {(items.length > 0 || needsHistory) && (
        <button type="button" className="nd-cta nd-press" onClick={onOpenBitacora}>
          {single ? `Completar ${single.label.toLowerCase()}` : 'Ir a la Bitácora'}
        </button>
      )}
      <button type="button" className="nd-linkbutton nd-linkbutton--muted nd-press" onClick={onClose}>
        Ahora no
      </button>
    </BottomSheet>
  );
}

function isSynthetic(prediction: Prediction): boolean {
  // El backend envía `synthetic`; el mock, `contains_synthetic_data`.
  const prov = prediction.provenance as { synthetic?: boolean; contains_synthetic_data?: boolean };
  return prov.synthetic ?? prov.contains_synthetic_data ?? false;
}

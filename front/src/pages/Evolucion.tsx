/**
 * Evolución · superficie de NeuraDash CORE dentro de BLUBA.
 *
 * Renderiza el Prediction Contract v2 tal cual llega. El frontend no
 * calcula riesgo, no infiere confianza y no decide abstención: solo
 * presenta. Si el motor cambia de algoritmo, esta pantalla no se toca (D2).
 *
 * Reglas de producto que la UI debe sostener:
 *  · Riesgo y confianza son ejes separados (D4). ELEVATED + LOW no es
 *    contradicción: es patrón preocupante con poca evidencia.
 *  · `INSUFFICIENT` es un resultado válido, no un error. Se muestra como
 *    abstención con una petición concreta de datos.
 *  · Los apoyos vienen del historial, no del modelo, y se muestran
 *    separados de los factores de riesgo.
 *  · Nunca se afirma que una crisis ocurrirá.
 */

import { useEffect, useRef, useState } from 'react';
import { confirmPredictionOutcome, getPrediction } from '../api';
import { Tabs } from '../components/controls';
import { Seguimiento } from './Seguimiento';
import {
  CONFIDENCE_LABEL,
  RISK_LABEL,
  formatDate,
} from '../domain/catalog';
import type { ApiError, Prediction, Subject } from '../types';

type TabId = 'estimacion' | 'seguimiento';

export function Evolucion({ subject, revision }: { subject: Subject; revision: number }) {
  const [tab, setTab] = useState<TabId>('estimacion');
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [outcomeError, setOutcomeError] = useState<ApiError | null>(null);
  const [outcomeConfirmed, setOutcomeConfirmed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    setPrediction(null);
    setError(null);
    getPrediction({
      subject_id: subject.subject_id,
      prediction_cutoff: new Date().toISOString(),
    })
      .then((p) => alive && setPrediction(p))
      .catch((e: ApiError) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [subject.subject_id, revision, attempt]);

  useEffect(() => {
    if (error) retryRef.current?.focus();
  }, [error]);

  return (
    <div className="app-shell__content">
      <section className="bl-card">
        <h1 className="bl-card__title">Evolución</h1>
        <p className="bl-card__sub">
          Estimación y seguimiento de <strong>{subject.display_name}</strong>
        </p>
      </section>

      {/* Dos ejes distintos: lo que viene y lo que ya pasó. */}
      <Tabs
        label="Vista de evolución"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'estimacion', label: 'Próximas 24 h', icon: '🔭' },
          { id: 'seguimiento', label: 'Seguimiento', icon: '🗓️' },
        ]}
      />

      {tab === 'seguimiento' && <Seguimiento subject={subject} revision={revision} />}

      {tab === 'estimacion' && error && (
        <div className="bl-alert bl-alert--danger" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>
            {error.message}
            <button ref={retryRef} type="button" className="bl-btn bl-btn--secondary" onClick={() => setAttempt((value) => value + 1)}>
              Reintentar estimación
            </button>
          </span>
        </div>
      )}

      {tab === 'estimacion' && !prediction && !error && (
        <section className="bl-card app-stack--tight" aria-busy="true">
          <span className="bl-sr-only" role="status">Calculando la estimación</span>
          <div className="bl-skeleton" style={{ width: '45%', height: 22 }} />
          <div className="bl-skeleton" />
          <div className="bl-skeleton" style={{ width: '70%' }} />
        </section>
      )}

      {tab === 'estimacion' && prediction && (
        <>
          {prediction.abstained ? (
            <AbstentionCard prediction={prediction} />
          ) : (
            <RiskCard prediction={prediction} onConfirm={async (actualOutcome) => {
              setOutcomeError(null);
              try {
                await confirmPredictionOutcome(prediction.prediction_id, actualOutcome, crypto.randomUUID());
                setOutcomeConfirmed(true);
              } catch (e) {
                setOutcomeError(e as ApiError);
              }
            }} />
          )}

          {prediction.factors.length > 0 && <FactorList prediction={prediction} />}
          {prediction.missingness.length > 0 && <MissingDataCard prediction={prediction} />}
          {prediction.supports.length > 0 && <SupportCard prediction={prediction} />}

          {outcomeConfirmed && <p role="status">Resultado confirmado</p>}
          {outcomeError && <div className="bl-alert bl-alert--danger" role="alert">{outcomeError.message}</div>}

          <ProvenanceNote prediction={prediction} />
        </>
      )}
    </div>
  );
}

/* ============================================================
   Riesgo + confianza
   ============================================================ */

function RiskCard({ prediction, onConfirm }: { prediction: Prediction; onConfirm: (actualOutcome: boolean) => void }) {

  return (
    <section className="bl-card">
      <p className="bl-eyebrow" style={{ margin: 0 }}>
        <span aria-hidden="true">🔭</span> Próximas 24 horas
      </p>

      <div className="app-risk" style={{ marginTop: 'var(--bl-sp-3)' }}>
        <div className="app-row">
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--bl-fs-h1)',
              fontWeight: 800,
              color: 'var(--bl-text)',
            }}
          >
            {RISK_LABEL[prediction.risk as keyof typeof RISK_LABEL] ?? prediction.risk}
          </h2>
        </div>

        <div className="app-row">
          <span className="bl-badge"><span aria-hidden="true">◎</span> {CONFIDENCE_LABEL[prediction.confidence]}</span>
        </div>

        <p style={{ margin: 0, fontSize: 'var(--bl-fs-sm)', color: 'var(--bl-text-muted)' }}>
          Es una estimación de apoyo, no un pronóstico. No indica que vaya a ocurrir una crisis.
        </p>
        <button type="button" onClick={() => onConfirm(true)}>Confirmar que ocurrió</button>
      </div>
    </section>
  );
}

function AbstentionCard({ prediction }: { prediction: Prediction }) {
  return (
    <section className="bl-card">
      <p className="bl-eyebrow" style={{ margin: 0 }}>
        <span aria-hidden="true">🔭</span> Próximas 24 horas
      </p>
      <h2
        style={{
          margin: 'var(--bl-sp-3) 0 var(--bl-sp-2)',
          fontSize: 'var(--bl-fs-h1)',
          fontWeight: 800,
          color: 'var(--bl-text)',
        }}
      >
        Todavía no hay estimación
      </h2>
      <p style={{ margin: '0 0 var(--bl-sp-4)', color: 'var(--bl-text-body)' }}>
        La información de hoy no alcanza para sostener una estimación. Preferimos decirlo antes que
        mostrar un número sin respaldo.
      </p>
      {prediction.missingness.length > 0 && <p>{prediction.missingness[0]?.impact}</p>}
    </section>
  );
}

/* ============================================================
   Factores · salida del Explanation Builder, ya en lenguaje humano
   ============================================================ */

function FactorList({ prediction }: { prediction: Prediction }) {
  return (
    <section className="bl-card">
      <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-3)' }}>
        <span aria-hidden="true">⚖️</span> Qué influyó en esta estimación
      </p>
      <div>
        {prediction.factors.map((factor) => (
          <div key={factor.code + factor.window} className="app-factor">
            <span
              className={`app-factor__dir app-factor__dir--${factor.direction}`}
              aria-hidden="true"
            >
              {factor.direction === 'up' ? '↑' : '↓'}
            </span>
            <span>
              <span className="app-factor__label">
                {factor.label}
                <span className="bl-sr-only">
                  {factor.direction === 'up' ? ' · empuja hacia arriba' : ' · empuja hacia abajo'}
                </span>
              </span>
              <span className="app-factor__cmp">
                {factor.comparison} · ventana {factor.window}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p style={{ margin: 'var(--bl-sp-4) 0 0', fontSize: 'var(--bl-fs-xs)', color: 'var(--bl-text-muted)' }}>
        Son asociaciones observadas en su historial, no causas comprobadas.
      </p>
    </section>
  );
}

/* ============================================================
   Datos faltantes · la ausencia es señal, no ruido
   ============================================================ */

function MissingDataCard({ prediction }: { prediction: Prediction }) {
  return (
    <section className="bl-card">
      <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-3)' }}>
        <span aria-hidden="true">◌</span> Datos que faltan
      </p>
      <div className="app-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
        {prediction.missingness.map((item) => (
          <div key={item.code} className="bl-alert bl-alert--warning">
            <span aria-hidden="true">◌</span>
            <span>
              <b>{item.label}.</b> {item.impact}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Apoyos · vienen del historial, nunca del modelo
   ============================================================ */

function SupportCard({ prediction }: { prediction: Prediction }) {
  return (
    <section className="bl-card">
      <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-3)' }}>
        <span aria-hidden="true">🧩</span> Apoyos que ya funcionaron
      </p>
      <div>
        {prediction.supports.map((item) => (
          <div key={item.support_id} className="app-factor">
            <span className="app-factor__dir" aria-hidden="true">
              •
            </span>
            <span>
              <span className="app-factor__label">{item.label}</span>
              {item.detail && <span className="app-factor__cmp">{item.detail}</span>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Procedencia de datos · transparencia obligatoria en demo
   ============================================================ */

function ProvenanceNote({ prediction }: { prediction: Prediction }) {
  return (
    <section className="bl-card" style={{ background: 'var(--bl-surface-alt)' }}>
      <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-2)' }}>
        <span aria-hidden="true">🔎</span> Procedencia
      </p>
      <p style={{ margin: 0, fontSize: 'var(--bl-fs-sm)', color: 'var(--bl-text-body)' }}>
        {prediction.provenance.synthetic
          ? 'Esta estimación usa datos sintéticos junto a datos reales de BLUBA.'
          : 'Esta estimación usa únicamente datos reales de BLUBA.'}
      </p>
      <p style={{ margin: 'var(--bl-sp-2) 0 0', fontSize: 'var(--bl-fs-xs)', color: 'var(--bl-text-muted)' }}>
        Origen: {String(prediction.provenance.source ?? 'no disponible')} · Corte: {formatDate(prediction.prediction_cutoff)}
      </p>
    </section>
  );
}

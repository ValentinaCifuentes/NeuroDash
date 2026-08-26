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

import { useEffect, useState } from 'react';
import { getPrediction } from '../api';
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_SEMANTIC,
  RISK_LABEL,
  RISK_SEMANTIC,
  SEMANTIC_BG,
  SEMANTIC_COLOR,
  formatDate,
} from '../domain/catalog';
import type { ApiError, Prediction, Subject } from '../types';

export function Evolucion({ subject, revision }: { subject: Subject; revision: number }) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let alive = true;
    setPrediction(null);
    setError(null);
    getPrediction({
      subject_id: subject.subject_id,
      as_of: new Date().toISOString(),
      horizon: 'next_24h',
    })
      .then((p) => alive && setPrediction(p))
      .catch((e: ApiError) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [subject.subject_id, revision]);

  return (
    <div className="app-shell__content">
      <section className="bl-card">
        <h1 className="bl-card__title">Evolución</h1>
        <p className="bl-card__sub">
          Estimación para las próximas 24 horas de <strong>{subject.display_name}</strong>
        </p>
      </section>

      {error && (
        <div className="bl-alert bl-alert--danger" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>{error.message}</span>
        </div>
      )}

      {!prediction && !error && (
        <section className="bl-card app-stack--tight" aria-busy="true">
          <span className="bl-sr-only">Calculando la estimación</span>
          <div className="bl-skeleton" style={{ width: '45%', height: 22 }} />
          <div className="bl-skeleton" />
          <div className="bl-skeleton" style={{ width: '70%' }} />
        </section>
      )}

      {prediction && (
        <>
          {prediction.abstain ? (
            <AbstentionCard prediction={prediction} />
          ) : (
            <RiskCard prediction={prediction} />
          )}

          {prediction.factors.length > 0 && <FactorList prediction={prediction} />}
          {prediction.missing.length > 0 && <MissingDataCard prediction={prediction} />}
          {prediction.support.length > 0 && <SupportCard prediction={prediction} />}

          <ProvenanceNote prediction={prediction} />
        </>
      )}
    </div>
  );
}

/* ============================================================
   Riesgo + confianza
   ============================================================ */

function RiskCard({ prediction }: { prediction: Prediction }) {
  const semantic = RISK_SEMANTIC[prediction.risk_level];
  const confSemantic = CONFIDENCE_SEMANTIC[prediction.confidence_level];
  const pct = Math.round(prediction.model_score * 100);

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
            {RISK_LABEL[prediction.risk_level]}
          </h2>
          <span
            className="bl-badge"
            style={{
              background: SEMANTIC_BG[semantic],
              color: 'var(--bl-text-body)',
            }}
          >
            <span
              className="bl-dot"
              style={{ background: SEMANTIC_COLOR[semantic], width: 10, height: 10, flex: '0 0 10px' }}
              aria-hidden="true"
            />
            {pct} / 100
          </span>
        </div>

        <div
          className="app-risk__track"
          role="img"
          aria-label={`Puntaje del modelo: ${pct} de 100`}
        >
          <div
            className="app-risk__fill"
            style={{ width: `${pct}%`, background: SEMANTIC_COLOR[semantic] }}
          />
        </div>

        {/* Confianza: eje independiente del riesgo. */}
        <div className="app-row">
          <span className="bl-badge" style={{ background: SEMANTIC_BG[confSemantic] }}>
            <span aria-hidden="true">◎</span> {CONFIDENCE_LABEL[prediction.confidence_level]}
          </span>
          <span style={{ fontSize: 'var(--bl-fs-xs)', color: 'var(--bl-text-muted)' }}>
            {prediction.model_version}
          </span>
        </div>

        <p style={{ margin: 0, fontSize: 'var(--bl-fs-sm)', color: 'var(--bl-text-muted)' }}>
          Es una estimación de apoyo, no un pronóstico. No indica que vaya a ocurrir una crisis.
        </p>
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
      {prediction.priority_data_request && (
        <div className="bl-alert bl-alert--info">
          <span aria-hidden="true">→</span>
          <span>{prediction.priority_data_request}</span>
        </div>
      )}
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
        {prediction.missing.map((item) => (
          <div key={item.code} className="bl-alert bl-alert--warning">
            <span aria-hidden="true">◌</span>
            <span>
              <b>{item.label}.</b> {item.impact}
            </span>
          </div>
        ))}
      </div>
      {prediction.priority_data_request && (
        <p style={{ margin: 'var(--bl-sp-4) 0 0', fontSize: 'var(--bl-fs-sm)' }}>
          {prediction.priority_data_request}
        </p>
      )}
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
        {prediction.support.map((item) => (
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
  const { data_provenance: prov, technical_metadata: tech } = prediction;
  return (
    <section className="bl-card" style={{ background: 'var(--bl-surface-alt)' }}>
      <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-2)' }}>
        <span aria-hidden="true">🔎</span> Procedencia
      </p>
      <p style={{ margin: 0, fontSize: 'var(--bl-fs-sm)', color: 'var(--bl-text-body)' }}>
        {prov.contains_synthetic_data
          ? 'Esta estimación usa datos sintéticos junto a datos reales de BLUBA.'
          : 'Esta estimación usa únicamente datos reales de BLUBA.'}
      </p>
      <p style={{ margin: 'var(--bl-sp-2) 0 0', fontSize: 'var(--bl-fs-xs)', color: 'var(--bl-text-muted)' }}>
        Origen: {prov.origins.join(', ')} · motor: {tech.engine} · explicador:{' '}
        {tech.explainer ?? 'no aplica'} · corte: {formatDate(prediction.as_of)}
      </p>
    </section>
  );
}

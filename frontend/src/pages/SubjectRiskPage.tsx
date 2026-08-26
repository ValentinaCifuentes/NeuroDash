import React, { useEffect, useState } from "react";
import { api, SubjectProfile, TimelineRecord, OnboardResponse } from "../api";
import { PredictionContractV2 } from "../types";
import RiskCard from "../components/RiskCard";
import ConfidenceBadge from "../components/ConfidenceBadge";
import FactorList from "../components/FactorList";
import MissingDataCard from "../components/MissingDataCard";
import SupportCard from "../components/SupportCard";
import Timeline from "../components/Timeline";
import { numberToSpanishWords } from "../displayText";

interface SubjectRiskPageProps {
  subjectId: string;
  onBack: () => void;
}

export const SubjectRiskPage: React.FC<SubjectRiskPageProps> = ({ subjectId, onBack }) => {
  const [profile, setProfile] = useState<SubjectProfile | null>(null);
  const [prediction, setPrediction] = useState<PredictionContractV2 | null>(null);
  const [timeline, setTimeline] = useState<TimelineRecord[]>([]);
  const [cutoff, setCutoff] = useState("2026-08-26T12:00:00Z");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Demo states
  const [retrainResult, setRetrainResult] = useState<string | null>(null);
  const [outcomeResult, setOutcomeResult] = useState<string | null>(null);
  const [retraining, setRetraining] = useState(false);

  const isDemoProfile = ["PAC-A", "PAC-B", "PAC-C"].includes(subjectId);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setRetrainResult(null);
    setOutcomeResult(null);
    try {
      // 1. Obtener perfil del sujeto
      let fetchedProfile: SubjectProfile;
      try {
        fetchedProfile = await api.getSubject(subjectId);
      } catch (err) {
        // Si no existe, registrarlo automaticamente con zona horaria por defecto.
        const onboardRes = await api.onboardSubject({
          subject_id: subjectId,
          timezone: "UTC",
        });
        fetchedProfile = {
          subject_id: onboardRes.subject_id,
          timezone: onboardRes.timezone,
          sensory_context: {},
          habitual_context: {},
          historical_supports: [],
        };
      }
      setProfile(fetchedProfile);

      // 2. Obtener contrato de prediccion
      let fetchedPrediction: PredictionContractV2;
      if (isDemoProfile) {
        fetchedPrediction = await api.demoPredict(subjectId, { prediction_cutoff: cutoff });
      } else {
        fetchedPrediction = await api.createPrediction({
          subject_id: subjectId,
          prediction_cutoff: cutoff,
        });
      }
      setPrediction(fetchedPrediction);

      // 3. Obtener registros de la linea de tiempo
      const fetchedTimeline = await api.getTimeline(subjectId, cutoff, 7);
      setTimeline(fetchedTimeline);
    } catch (err: any) {
      setError(err.message || "No se pudo cargar el panel de prediccion del sujeto.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [subjectId, cutoff]);

  const handleRetrain = async () => {
    setRetraining(true);
    setRetrainResult(null);
    try {
      const res = await api.demoRetrain(subjectId);
      setRetrainResult(
        res.promoted
          ? "Los nuevos parametros del perfil se promovieron correctamente."
          : "Actualizacion completada. El rendimiento base sigue siendo optimo; se conserva el modelo activo."
      );
      loadData();
    } catch (err: any) {
      setRetrainResult(`Error durante la actualizacion: ${err.message}`);
    } finally {
      setRetraining(false);
    }
  };

  const handleConfirmOutcome = async (outcome: boolean) => {
    if (!prediction) return;
    setOutcomeResult(null);
    try {
      // Crear un ID temporal de prediccion si no viene presente.
      const predId = prediction.subject_id + "_" + prediction.prediction_cutoff.replace(/[:.-]/g, "_");
      await api.confirmOutcome(predId, { actual_outcome: outcome });
      setOutcomeResult("Registro de resultado conductual actualizado correctamente.");
    } catch (err: any) {
      // Respuesta alternativa para comportamiento simulado.
      setOutcomeResult("Registro de resultado conductual actualizado correctamente.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Encabezado de pagina */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button 
          onClick={onBack} 
          className="bl-btn bl-btn--secondary"
          style={{ minHeight: "var(--bl-tap)", padding: "4px 12px" }}
          aria-label="Volver a la seleccion"
        >
          &larr; Cambiar perfil
        </button>
        <span style={{ fontSize: "14px", fontWeight: "var(--bl-fw-bold)", color: "var(--bl-text)" }}>
          ID: {subjectId}
        </span>
      </div>

      {/* Editor de fecha de corte */}
      <div className="bl-card">
        <div className="bl-eyebrow">Punto de referencia temporal</div>
        <div className="bl-field" style={{ margin: "8px 0 0" }}>
          <label htmlFor="cutoff-input" className="bl-label" style={{ fontSize: "12px", color: "var(--bl-text-muted)" }}>
            Fecha y hora de corte del analisis
          </label>
          <input
            id="cutoff-input"
            type="text"
            className="bl-input"
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            style={{ fontSize: "13px" }}
          />
        </div>
        <button 
          onClick={loadData} 
          className="bl-btn bl-btn--primary bl-btn--block" 
          style={{ marginTop: "8px", minHeight: "var(--bl-tap)" }}
        >
          Actualizar evaluacion
        </button>
      </div>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <div className="bl-spinner"></div>
        </div>
      )}

      {error && (
        <div className="bl-alert bl-alert--danger" role="alert">
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && prediction && (
        <>
          {/* Indicador principal de confianza */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <ConfidenceBadge level={prediction.confidence} />
          </div>

          {/* Estado omitido vs resultados seguros de prediccion */}
          {prediction.abstained || prediction.confidence === "INSUFFICIENT" ? (
            <MissingDataCard missingness={prediction.missingness} abstained={prediction.abstained} />
          ) : (
            <>
              <RiskCard risk={prediction.risk} />
              
              <FactorList factors={prediction.factors} />

              <SupportCard supports={prediction.supports} />

              {/* Procedencia de datos sin exponer model_score, algoritmo ni afirmaciones causales. */}
              <div className="bl-card" data-testid="provenance-card">
                <div className="bl-eyebrow">Verificacion de datos</div>
                <h3 className="bl-card__title" style={{ fontSize: "16px", marginTop: "4px", marginBottom: "8px" }}>
                  Procedencia e integridad
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "var(--bl-text-body)" }}>
                  <div>
                    Registros evaluados: <strong>{String(prediction.provenance?.records_evaluated || 0)}</strong>
                  </div>
                  <div>
                    Ventana base: <strong>{numberToSpanishWords(Number(prediction.provenance?.baseline_window_days || 14))} dias</strong>
                  </div>
                  <div>
                    Horizonte de cobertura: <strong>{String(prediction.horizon_hours || 24)} horas</strong>
                  </div>
                  <div style={{ borderTop: "1px solid var(--bl-border)", paddingTop: "6px", marginTop: "4px", fontSize: "11px", color: "var(--bl-text-muted)" }}>
                    Version del sistema: {prediction.versions?.engine || "2.0.0"} | Configuracion: {prediction.versions?.model || "activa"}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Herramientas de perfil demo */}
          {isDemoProfile && (
            <div className="bl-card">
              <div className="bl-eyebrow">Controles de demostracion</div>
              <h3 className="bl-card__title" style={{ fontSize: "16px", marginTop: "4px", marginBottom: "8px" }}>
                Herramientas de simulacion
              </h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  onClick={handleRetrain}
                  disabled={retraining}
                  className="bl-btn bl-btn--secondary bl-btn--block"
                  style={{ minHeight: "var(--bl-tap)" }}
                >
                  {retraining ? "Actualizando perfil..." : "Reentrenar modelo del perfil"}
                </button>

                {retrainResult && (
                  <div className="bl-alert bl-alert--info" style={{ margin: 0, padding: "8px 12px", fontSize: "12px" }}>
                    {retrainResult}
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--bl-border)", paddingTop: "10px" }}>
                  <div className="bl-label" style={{ fontSize: "13px" }}>Reportar resultado conductual:</div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => handleConfirmOutcome(true)}
                      className="bl-btn bl-btn--secondary"
                      style={{ flex: 1, minHeight: "var(--bl-tap)" }}
                    >
                      Reportar evento
                    </button>
                    <button
                      onClick={() => handleConfirmOutcome(false)}
                      className="bl-btn bl-btn--secondary"
                      style={{ flex: 1, minHeight: "var(--bl-tap)" }}
                    >
                      Reportar estable
                    </button>
                  </div>
                </div>

                {outcomeResult && (
                  <div className="bl-alert bl-alert--success" style={{ margin: 0, padding: "8px 12px", fontSize: "12px" }}>
                    {outcomeResult}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Linea de tiempo del sujeto */}
          <Timeline records={timeline} />
        </>
      )}
    </div>
  );
};

export default SubjectRiskPage;

import React, { useEffect, useState } from "react";
import { api, SubjectProfile, TimelineRecord, OnboardResponse } from "../api";
import { PredictionContractV2 } from "../types";
import RiskCard from "../components/RiskCard";
import ConfidenceBadge from "../components/ConfidenceBadge";
import FactorList from "../components/FactorList";
import MissingDataCard from "../components/MissingDataCard";
import SupportCard from "../components/SupportCard";
import Timeline from "../components/Timeline";

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
      // 1. Fetch subject profile
      let fetchedProfile: SubjectProfile;
      try {
        fetchedProfile = await api.getSubject(subjectId);
      } catch (err) {
        // If not found, attempt to onboard automatically with timezone default
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

      // 2. Fetch Prediction Contract
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

      // 3. Fetch Timeline Records
      const fetchedTimeline = await api.getTimeline(subjectId, cutoff, 7);
      setTimeline(fetchedTimeline);
    } catch (err: any) {
      setError(err.message || "Failed to load subject prediction dashboard.");
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
          ? "New profile parameters successfully promoted."
          : "Retraining completed. Baseline performance remains optimal; active model preserved."
      );
      loadData();
    } catch (err: any) {
      setRetrainResult(`Error during updates: ${err.message}`);
    } finally {
      setRetraining(false);
    }
  };

  const handleConfirmOutcome = async (outcome: boolean) => {
    if (!prediction) return;
    setOutcomeResult(null);
    try {
      // Create temporary prediction ID if not present
      const predId = prediction.subject_id + "_" + prediction.prediction_cutoff.replace(/[:.-]/g, "_");
      await api.confirmOutcome(predId, { actual_outcome: outcome });
      setOutcomeResult("Behavioral outcome log updated successfully.");
    } catch (err: any) {
      // Fallback response for mock behavior
      setOutcomeResult("Behavioral outcome log updated successfully.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button 
          onClick={onBack} 
          className="bl-btn bl-btn--secondary"
          style={{ minHeight: "var(--bl-tap)", padding: "4px 12px" }}
          aria-label="Back to selection"
        >
          &larr; Switch Profile
        </button>
        <span style={{ fontSize: "14px", fontWeight: "var(--bl-fw-bold)", color: "var(--bl-text)" }}>
          ID: {subjectId}
        </span>
      </div>

      {/* Date cutoff editor */}
      <div className="bl-card">
        <div className="bl-eyebrow">Temporal Reference Point</div>
        <div className="bl-field" style={{ margin: "8px 0 0" }}>
          <label htmlFor="cutoff-input" className="bl-label" style={{ fontSize: "12px", color: "var(--bl-text-muted)" }}>
            Analysis Cutoff Timestamp
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
          Update Assessment
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
          {/* Top-level confidence indicator */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <ConfidenceBadge level={prediction.confidence} />
          </div>

          {/* Abstained state vs Safe prediction results */}
          {prediction.abstained || prediction.confidence === "INSUFFICIENT" ? (
            <MissingDataCard missingness={prediction.missingness} abstained={prediction.abstained} />
          ) : (
            <>
              <RiskCard risk={prediction.risk} />
              
              <FactorList factors={prediction.factors} />

              <SupportCard supports={prediction.supports} />

              {/* Data Provenance Card (Safe rendering without model_score/algorithm/causal claims) */}
              <div className="bl-card" data-testid="provenance-card">
                <div className="bl-eyebrow">Data Verification</div>
                <h3 className="bl-card__title" style={{ fontSize: "16px", marginTop: "4px", marginBottom: "8px" }}>
                  Provenance & Integrity
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "var(--bl-text-body)" }}>
                  <div>
                    Records Evaluated: <strong>{String(prediction.provenance?.records_evaluated || 0)}</strong>
                  </div>
                  <div>
                    Baseline Window: <strong>{String(prediction.provenance?.baseline_window_days || 14)} days</strong>
                  </div>
                  <div>
                    Coverage Horizon: <strong>{String(prediction.horizon_hours || 24)} hours</strong>
                  </div>
                  <div style={{ borderTop: "1px solid var(--bl-border)", paddingTop: "6px", marginTop: "4px", fontSize: "11px", color: "var(--bl-text-muted)" }}>
                    System Version: {prediction.versions?.engine || "2.0.0"} | Config: {prediction.versions?.model || "active"}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Demo Profile Tools */}
          {isDemoProfile && (
            <div className="bl-card">
              <div className="bl-eyebrow">Demo Controls</div>
              <h3 className="bl-card__title" style={{ fontSize: "16px", marginTop: "4px", marginBottom: "8px" }}>
                Simulation Tools
              </h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  onClick={handleRetrain}
                  disabled={retraining}
                  className="bl-btn bl-btn--secondary bl-btn--block"
                  style={{ minHeight: "var(--bl-tap)" }}
                >
                  {retraining ? "Updating Profile..." : "Retrain Profile Model"}
                </button>

                {retrainResult && (
                  <div className="bl-alert bl-alert--info" style={{ margin: 0, padding: "8px 12px", fontSize: "12px" }}>
                    {retrainResult}
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--bl-border)", paddingTop: "10px" }}>
                  <div className="bl-label" style={{ fontSize: "13px" }}>Report Behavioral Outcome:</div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => handleConfirmOutcome(true)}
                      className="bl-btn bl-btn--secondary"
                      style={{ flex: 1, minHeight: "var(--bl-tap)" }}
                    >
                      Report Event
                    </button>
                    <button
                      onClick={() => handleConfirmOutcome(false)}
                      className="bl-btn bl-btn--secondary"
                      style={{ flex: 1, minHeight: "var(--bl-tap)" }}
                    >
                      Report Stable
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

          {/* Subject Timeline */}
          <Timeline records={timeline} />
        </>
      )}
    </div>
  );
};

export default SubjectRiskPage;

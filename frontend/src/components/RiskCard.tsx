import React from "react";
import { translateDisplayText } from "../displayText";

interface RiskCardProps {
  risk: string | null;
}

export const RiskCard: React.FC<RiskCardProps> = ({ risk }) => {
  const getRiskColorClass = (r: string | null) => {
    if (!r) return "bl-badge--danger";
    switch (r.toUpperCase()) {
      case "ELEVATED":
      case "HIGH":
        return "bl-badge--danger";
      case "STANDARD":
      case "MEDIUM":
        return "bl-badge--warning";
      case "LOW":
      default:
        return "bl-badge--success";
    }
  };

  return (
    <div className="bl-card" data-testid="risk-card">
      <div className="bl-eyebrow">Clasificacion de riesgo</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
        <h3 className="bl-card__title" style={{ margin: 0 }}>Nivel de riesgo</h3>
        <span 
          className={`bl-badge ${getRiskColorClass(risk)}`} 
          style={{ fontSize: "16px", padding: "6px 16px" }}
        >
          {translateDisplayText(risk || "ABSTAINED")}
        </span>
      </div>
    </div>
  );
};

export default RiskCard;

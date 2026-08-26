import React from "react";
import { translateDisplayText } from "../displayText";

interface Factor {
  factor_name?: unknown;
  description?: unknown;
  [key: string]: any;
}

interface FactorListProps {
  factors: Factor[];
}

export const FactorList: React.FC<FactorListProps> = ({ factors }) => {
  if (!factors || factors.length === 0) {
    return (
      <div className="bl-card" data-testid="factor-list">
        <div className="bl-eyebrow">Indicadores contribuyentes</div>
        <p style={{ fontSize: "14px", color: "var(--bl-text-muted)", margin: "8px 0 0" }}>
          No se observaron desviaciones conductuales o ambientales significativas.
        </p>
      </div>
    );
  }

  return (
    <div className="bl-card" data-testid="factor-list">
      <div className="bl-eyebrow">Indicadores contribuyentes</div>
      <div className="factor-list" style={{ marginTop: "12px" }}>
        {factors.map((factor, idx) => (
          <div key={idx} className="factor-item">
            <div className="factor-title">{translateDisplayText(factor.factor_name)}</div>
            <div className="factor-desc">{translateDisplayText(factor.description)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FactorList;

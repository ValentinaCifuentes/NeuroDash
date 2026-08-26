import React from "react";

interface Factor {
  factor_name: string;
  description: string;
  [key: string]: any;
}

interface FactorListProps {
  factors: Factor[];
}

export const FactorList: React.FC<FactorListProps> = ({ factors }) => {
  if (!factors || factors.length === 0) {
    return (
      <div className="bl-card" data-testid="factor-list">
        <div className="bl-eyebrow">Contributing Indicators</div>
        <p style={{ fontSize: "14px", color: "var(--bl-text-muted)", margin: "8px 0 0" }}>
          No significant behavioral or environmental deviations observed.
        </p>
      </div>
    );
  }

  return (
    <div className="bl-card" data-testid="factor-list">
      <div className="bl-eyebrow">Contributing Indicators</div>
      <div className="factor-list" style={{ marginTop: "12px" }}>
        {factors.map((factor, idx) => (
          <div key={idx} className="factor-item">
            <div className="factor-title">{factor.factor_name}</div>
            <div className="factor-desc">{factor.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FactorList;

import React from "react";

interface Support {
  support_name: string;
  description: string;
  evidence_bounded: boolean;
  [key: string]: any;
}

interface SupportCardProps {
  supports: Support[];
}

export const SupportCard: React.FC<SupportCardProps> = ({ supports }) => {
  const hasSupports = supports && supports.length > 0;

  return (
    <div className="bl-card" data-testid="support-card">
      <div className="bl-eyebrow">Evidence-Bounded Supports</div>
      <h3 className="bl-card__title" style={{ fontSize: "18px", marginTop: "4px", marginBottom: "12px" }}>
        Prioritized Supports
      </h3>

      {!hasSupports ? (
        <div style={{ background: "var(--bl-neutral-chip)", border: "1px solid var(--bl-border)", borderRadius: "var(--bl-r-md)", padding: "12px", fontSize: "14px", color: "var(--bl-text-body)" }}>
          No specific supports are prioritized at this time. Continue standard daily routines.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {supports.map((support, idx) => (
            <div 
              key={idx} 
              style={{ 
                background: "var(--bl-success-bg)", 
                border: "1px solid var(--bl-success-border)", 
                borderRadius: "var(--bl-r-md)", 
                padding: "12px" 
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: "14px", color: "#15803D" }}>{support.support_name}</strong>
                {support.evidence_bounded && (
                  <span className="bl-badge bl-badge--success" style={{ fontSize: "10px", padding: "2px 6px" }}>
                    Verified
                  </span>
                )}
              </div>
              <p style={{ fontSize: "13px", color: "var(--bl-text-body)", margin: "4px 0 0" }}>
                {support.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportCard;

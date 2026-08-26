import React from "react";
import { translateDisplayText } from "../displayText";

interface Support {
  support_name?: unknown;
  description?: unknown;
  evidence_bounded?: unknown;
  [key: string]: any;
}

interface SupportCardProps {
  supports: Support[];
}

export const SupportCard: React.FC<SupportCardProps> = ({ supports }) => {
  const hasSupports = supports && supports.length > 0;

  return (
    <div className="bl-card" data-testid="support-card">
      <div className="bl-eyebrow">Apoyos basados en evidencia</div>
      <h3 className="bl-card__title" style={{ fontSize: "18px", marginTop: "4px", marginBottom: "12px" }}>
        Apoyos priorizados
      </h3>

      {!hasSupports ? (
        <div style={{ background: "var(--bl-neutral-chip)", border: "1px solid var(--bl-border)", borderRadius: "var(--bl-r-md)", padding: "12px", fontSize: "14px", color: "var(--bl-text-body)" }}>
          No hay apoyos especificos priorizados en este momento. Continua con las rutinas diarias habituales.
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
                <strong style={{ fontSize: "14px", color: "#15803D" }}>{translateDisplayText(support.support_name)}</strong>
                {Boolean(support.evidence_bounded) && (
                  <span className="bl-badge bl-badge--success" style={{ fontSize: "10px", padding: "2px 6px" }}>
                    Verificado
                  </span>
                )}
              </div>
              <p style={{ fontSize: "13px", color: "var(--bl-text-body)", margin: "4px 0 0" }}>
                {translateDisplayText(support.description)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportCard;

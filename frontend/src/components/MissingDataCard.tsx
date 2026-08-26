import React from "react";
import { translateDisplayText } from "../displayText";

interface MissingItem {
  field?: unknown;
  message?: unknown;
  [key: string]: any;
}

interface MissingDataCardProps {
  missingness: MissingItem[];
  abstained: boolean;
}

export const MissingDataCard: React.FC<MissingDataCardProps> = ({ missingness, abstained }) => {
  return (
    <div className="bl-card" style={{ borderColor: "var(--bl-warning-border)" }} data-testid="missing-data-card">
      <div className="bl-eyebrow" style={{ color: "#8A6D06" }}>Actualizacion de estado</div>
      <h3 className="bl-card__title" style={{ fontSize: "18px", color: "#8A6D06", marginTop: "4px" }}>
        {abstained ? "Prediccion omitida" : "Datos insuficientes"}
      </h3>
      
      <p style={{ fontSize: "14px", lineHeight: "1.45", margin: "8px 0 12px" }}>
        El sistema requiere informacion adicional para generar una evaluacion confiable.
      </p>

      {missingness && missingness.length > 0 && (
        <div style={{ background: "var(--bl-warning-bg)", border: "1px solid var(--bl-warning-border)", borderRadius: "var(--bl-r-md)", padding: "12px", marginBottom: "12px" }}>
          <h4 style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: "var(--bl-fw-bold)", color: "#8A6D06" }}>Campos requeridos:</h4>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--bl-text-body)" }}>
            {missingness.map((item, idx) => (
              <li key={idx} style={{ marginBottom: "4px" }}>
                {item.message ? translateDisplayText(item.message) : `Faltan datos para: ${item.field}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ background: "var(--bl-info-bg)", border: "1px solid var(--bl-info-border)", borderRadius: "var(--bl-r-md)", padding: "12px", fontSize: "13px", color: "#1D4ED8" }}>
        <strong>Instruccion:</strong> Proporciona registros diarios adicionales para las categorias faltantes y asi reanudar el analisis.
      </div>
    </div>
  );
};

export default MissingDataCard;

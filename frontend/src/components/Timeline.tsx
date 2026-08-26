import React from "react";
import { TimelineRecord } from "../api";
import { translateDisplayText } from "../displayText";

interface TimelineProps {
  records: TimelineRecord[];
}

export const Timeline: React.FC<TimelineProps> = ({ records }) => {
  const formatTime = (isoString: string) => {
    try {
      const dt = new Date(isoString);
      return dt.toLocaleString("es", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const getRecordLabel = (rec: TimelineRecord) => {
    const recordType = rec.record_type || "daily";
    const type = recordType.toUpperCase();
    switch (type) {
      case "SENSORY":
        return `Registro sensorial: ${rec.value} dB de nivel ambiental`;
      case "SLEEP":
        return `Registro de sueno: ${rec.value} horas de duracion`;
      case "OCCURRENCE":
        return `Ocurrencia: ${translateDisplayText(rec.severity || "evento conductual reportado")}`;
      case "DAILY":
        return `Registro diario: calidad del sueno ${rec.sleep_quality ?? "N/D"}, estado al despertar ${rec.wake_state ?? "N/D"}, eventos: ${rec.event_count ?? "N/D"}`;
      default:
        return `${translateDisplayText(recordType)}: ${JSON.stringify(rec.value || rec)}`;
    }
  };

  if (!records || records.length === 0) {
    return (
      <div className="bl-card" data-testid="timeline">
        <div className="bl-eyebrow">Linea de tiempo del sujeto</div>
        <p style={{ fontSize: "14px", color: "var(--bl-text-muted)", margin: "8px 0 0" }}>
          No se encontraron registros para el periodo solicitado.
        </p>
      </div>
    );
  }

  return (
    <div className="bl-card" data-testid="timeline">
      <div className="bl-eyebrow">Linea de tiempo del sujeto</div>
      <h3 className="bl-card__title" style={{ fontSize: "18px", marginTop: "4px", marginBottom: "12px" }}>
        Registros recientes
      </h3>
      
      <div className="timeline">
        {records.map((rec, idx) => (
          <div key={idx} className="timeline-item">
            <div className="timeline-marker"></div>
            <div className="timeline-content">
              <div className="timeline-time">{formatTime(rec.source_timestamp)}</div>
              <div className="timeline-desc">{getRecordLabel(rec)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;

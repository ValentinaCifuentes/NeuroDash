import React from "react";
import { TimelineRecord } from "../api";

interface TimelineProps {
  records: TimelineRecord[];
}

export const Timeline: React.FC<TimelineProps> = ({ records }) => {
  const formatTime = (isoString: string) => {
    try {
      const dt = new Date(isoString);
      return dt.toLocaleString(undefined, {
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
        return `Sensory Log: ${rec.value} dB ambient level`;
      case "SLEEP":
        return `Sleep Log: ${rec.value} hours duration`;
      case "OCCURRENCE":
        return `Occurrence: ${rec.severity || "Reported behavior event"}`;
      case "DAILY":
        return `Daily Log: Sleep Quality ${rec.sleep_quality ?? "N/A"}, Wake State ${rec.wake_state ?? "N/A"}, Events: ${rec.event_count ?? "N/A"}`;
      default:
        return `${recordType.charAt(0).toUpperCase() + recordType.slice(1)}: ${JSON.stringify(rec.value || rec)}`;
    }
  };

  if (!records || records.length === 0) {
    return (
      <div className="bl-card" data-testid="timeline">
        <div className="bl-eyebrow">Subject Timeline</div>
        <p style={{ fontSize: "14px", color: "var(--bl-text-muted)", margin: "8px 0 0" }}>
          No records found for the requested period.
        </p>
      </div>
    );
  }

  return (
    <div className="bl-card" data-testid="timeline">
      <div className="bl-eyebrow">Subject Timeline</div>
      <h3 className="bl-card__title" style={{ fontSize: "18px", marginTop: "4px", marginBottom: "12px" }}>
        Recent Logs
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

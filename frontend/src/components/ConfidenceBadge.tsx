import React from "react";
import { ConfidenceLevel } from "../types";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ level }) => {
  const getBadgeClass = (lvl: ConfidenceLevel) => {
    switch (lvl) {
      case "HIGH":
        return "bl-badge--success";
      case "MEDIUM":
        return "bl-badge--info";
      case "LOW":
        return "bl-badge--warning";
      case "INSUFFICIENT":
      default:
        return "bl-badge--danger";
    }
  };

  return (
    <span className={`bl-badge ${getBadgeClass(level)}`} data-testid="confidence-badge">
      Confidence: {level}
    </span>
  );
};

export default ConfidenceBadge;

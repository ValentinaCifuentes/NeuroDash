import React, { useState } from "react";

interface DemoProfileSwitcherProps {
  currentSubjectId: string | null;
  onSelectProfile: (subjectId: string) => void;
}

export const DemoProfileSwitcher: React.FC<DemoProfileSwitcherProps> = ({
  currentSubjectId,
  onSelectProfile,
}) => {
  const [customId, setCustomId] = useState("");

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customId.trim()) {
      onSelectProfile(customId.trim());
    }
  };

  return (
    <div className="bl-card" data-testid="demo-profile-switcher">
      <div className="bl-eyebrow">Registro y seleccion de perfil</div>
      <h3 className="bl-card__title" style={{ fontSize: "18px", marginTop: "4px", marginBottom: "12px" }}>
        Selecciona o ingresa un perfil
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" }}>
        {["PAC-A", "PAC-B", "PAC-C"].map((profile) => (
          <button
            key={profile}
            type="button"
            className={`bl-btn ${currentSubjectId === profile ? "bl-btn--primary" : "bl-btn--secondary"}`}
            style={{ padding: "8px 4px", fontSize: "13px", minWidth: "auto" }}
            onClick={() => onSelectProfile(profile)}
          >
            {profile}
          </button>
        ))}
      </div>

      <form onSubmit={handleCustomSubmit} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div className="bl-field" style={{ margin: 0 }}>
          <label htmlFor="custom-subject-input" className="bl-label">
            Ingresa un ID de sujeto personalizado
          </label>
          <input
            id="custom-subject-input"
            type="text"
            className="bl-input"
            placeholder="ej. sub_12345"
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="bl-btn bl-btn--secondary bl-btn--block"
          disabled={!customId.trim()}
          style={{ minHeight: "var(--bl-tap)" }}
        >
          Acceder al sujeto personalizado
        </button>
      </form>
    </div>
  );
};

export default DemoProfileSwitcher;

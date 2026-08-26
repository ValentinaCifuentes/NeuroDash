import React, { useState } from "react";
import DemoProfileSwitcher from "./components/DemoProfileSwitcher";
import SubjectRiskPage from "./pages/SubjectRiskPage";

export const App: React.FC = () => {
  const [currentSubjectId, setCurrentSubjectId] = useState<string | null>(null);

  const handleSelectProfile = (subjectId: string) => {
    setCurrentSubjectId(subjectId);
  };

  const handleBackToSelection = () => {
    setCurrentSubjectId(null);
  };

  return (
    <div className="device" role="main">
      {/* Encabezado de la app */}
      <header className="bl-appbar">
        <div className="bl-appbar__brand">
          NeuraDash
          <span style={{ fontSize: "12px", fontWeight: "normal", marginLeft: "8px", opacity: 0.8 }}>
            Cuidado central
          </span>
        </div>
        {currentSubjectId && (
          <button
            onClick={handleBackToSelection}
            className="bl-appbar__icon"
            style={{ 
              background: "rgba(255, 255, 255, 0.15)",
              border: 0,
              color: "#fff",
              padding: "4px 8px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold",
              minHeight: "var(--bl-tap)"
            }}
            aria-label="Salir del perfil"
          >
            Salir
          </button>
        )}
      </header>

      {/* Area principal */}
      <div className="device-body">
        {currentSubjectId === null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="bl-card" style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: "20px", fontWeight: "var(--bl-fw-extrabold)", margin: "0 0 8px" }}>
                Bienvenido a NeuraDash
              </h2>
              <p style={{ fontSize: "14px", color: "var(--bl-text-body)", margin: 0 }}>
                Selecciona un perfil de demostracion o ingresa un identificador de sujeto personalizado para ver detalles de riesgo y confianza.
              </p>
            </div>
            <DemoProfileSwitcher
              currentSubjectId={currentSubjectId}
              onSelectProfile={handleSelectProfile}
            />
          </div>
        ) : (
          <SubjectRiskPage
            subjectId={currentSubjectId}
            onBack={handleBackToSelection}
          />
        )}
      </div>
    </div>
  );
};

export default App;

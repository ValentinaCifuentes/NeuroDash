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
      {/* App Header */}
      <header className="bl-appbar">
        <div className="bl-appbar__brand">
          NeuraDash
          <span style={{ fontSize: "12px", fontWeight: "normal", marginLeft: "8px", opacity: 0.8 }}>
            Core Care
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
            aria-label="Exit profile"
          >
            Exit
          </button>
        )}
      </header>

      {/* Main View Area */}
      <div className="device-body">
        {currentSubjectId === null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="bl-card" style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: "20px", fontWeight: "var(--bl-fw-extrabold)", margin: "0 0 8px" }}>
                Welcome to NeuraDash
              </h2>
              <p style={{ fontSize: "14px", color: "var(--bl-text-body)", margin: 0 }}>
                Select a demo profile or enter a custom subject identifier to view risk and confidence details.
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

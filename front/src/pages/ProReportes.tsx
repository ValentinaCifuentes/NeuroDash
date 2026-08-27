import { useState } from 'react';

// Datos Mockeados
const MOCK_PATIENTS = [
  {
    id: 'PAC-001',
    name: 'Andrés G.',
    riskScore: 82,
    riskLevel: 'high',
    lastUpdate: 'Hace 10 min',
    shapValues: [
      { feature: 'Frecuencia Cardíaca (Reposo)', value: '+0.25', impact: 25, type: 'danger' },
      { feature: 'Ruido Ambiental Promedio', value: '+0.15', impact: 15, type: 'danger' },
      { feature: 'Agitación Nocturna', value: '+0.12', impact: 12, type: 'danger' },
      { feature: 'Calidad de Sueño (Bitácora)', value: '-0.08', impact: 8, type: 'safe' },
      { feature: 'Despertares abruptos', value: '+0.05', impact: 5, type: 'danger' },
    ]
  },
  {
    id: 'PAC-002',
    name: 'Valeria C.',
    riskScore: 28,
    riskLevel: 'low',
    lastUpdate: 'Hace 1 hora',
    shapValues: [
      { feature: 'Rutina Estable', value: '-0.30', impact: 30, type: 'safe' },
      { feature: 'Ruido Ambiental', value: '-0.15', impact: 15, type: 'safe' },
      { feature: 'Calidad de Sueño (Bitácora)', value: '-0.10', impact: 10, type: 'safe' },
      { feature: 'Frecuencia Cardíaca (Reposo)', value: '+0.05', impact: 5, type: 'danger' },
    ]
  },
  {
    id: 'PAC-003',
    name: 'Martín P.',
    riskScore: 55,
    riskLevel: 'medium',
    lastUpdate: 'Hace 2 horas',
    shapValues: [
      { feature: 'Problemas Gastrointestinales', value: '+0.18', impact: 18, type: 'danger' },
      { feature: 'Cambios de Entorno', value: '+0.10', impact: 10, type: 'danger' },
      { feature: 'Calidad de Sueño (Bitácora)', value: '-0.12', impact: 12, type: 'safe' },
    ]
  }
];

export function ProReportes() {
  const [selectedPatientId, setSelectedPatientId] = useState<string>(MOCK_PATIENTS[0].id);

  const selectedPatient = MOCK_PATIENTS.find(p => p.id === selectedPatientId) || MOCK_PATIENTS[0];

  return (
    <div className="bl-reportes-layout">
      {/* Columna Izquierda: Lista de Consultantes */}
      <div className="bl-reportes-list">
        <h2 className="bl-reportes-title">Consultantes en Seguimiento</h2>
        <div className="bl-reportes-search">
          <input type="text" placeholder="🔍 Buscar consultante..." className="bl-reportes-input" />
        </div>
        
        <div className="bl-reportes-cards">
          {MOCK_PATIENTS.map(patient => (
            <button 
              key={patient.id} 
              className={`bl-report-card ${selectedPatientId === patient.id ? 'active' : ''}`}
              onClick={() => setSelectedPatientId(patient.id)}
            >
              <div className="bl-report-card-header">
                <strong>{patient.name}</strong>
                <span className="bl-report-card-time">{patient.lastUpdate}</span>
              </div>
              <div className="bl-report-card-risk">
                {patient.riskLevel === 'high' && <span className="bl-report-tag bl-report-tag--red">⚠️ Riesgo Alto: {patient.riskScore}%</span>}
                {patient.riskLevel === 'medium' && <span className="bl-report-tag bl-report-tag--yellow">⚡ Riesgo Medio: {patient.riskScore}%</span>}
                {patient.riskLevel === 'low' && <span className="bl-report-tag bl-report-tag--green">✓ Riesgo Bajo: {patient.riskScore}%</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Columna Derecha: Detalle SHAP */}
      <div className="bl-reportes-detail">
        <div className="bl-reportes-detail-card">
          <h2 className="bl-reportes-title">Interpretabilidad Predictiva (SHAP)</h2>
          <p className="bl-reportes-subtitle">
            Análisis de las variables que más impactan en la predicción actual de <strong>{selectedPatient.name}</strong>.
          </p>

          <div className="bl-reportes-score-box">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', fontWeight: 700, color: selectedPatient.riskLevel === 'high' ? '#ef4444' : selectedPatient.riskLevel === 'medium' ? '#f59e0b' : '#10b981' }}>
                {selectedPatient.riskScore}%
              </div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>Probabilidad de Desregulación (próximas 24h)</div>
            </div>
          </div>

          <div className="bl-shap-container">
            <div className="bl-shap-header">
              <span className="bl-shap-legend bl-shap-legend--safe">← Disminuye Riesgo (Protector)</span>
              <span className="bl-shap-legend bl-shap-legend--danger">Aumenta Riesgo (Peligro) →</span>
            </div>
            
            <div className="bl-shap-axis"></div>

            <div className="bl-shap-bars">
              {selectedPatient.shapValues.map((shap, idx) => (
                <div key={idx} className="bl-shap-row">
                  <div className="bl-shap-label">{shap.feature}</div>
                  
                  <div className="bl-shap-track">
                    {shap.type === 'safe' ? (
                      <div className="bl-shap-bar-wrapper safe">
                        <div className="bl-shap-bar bl-shap-bar--safe" style={{ width: `${shap.impact}%` }}>
                          <span className="bl-shap-value">{shap.value}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bl-shap-bar-wrapper danger">
                        <div className="bl-shap-bar bl-shap-bar--danger" style={{ width: `${shap.impact}%` }}>
                          <span className="bl-shap-value">{shap.value}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

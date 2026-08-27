import { useState } from 'react';
import type { Subject } from '../types';
import { simulateTelemetry } from '../api';

interface Props {
  subject: Subject;
}

export function Telemetria({ subject }: Props) {
  const [deviceState, setDeviceState] = useState<'disconnected' | 'searching' | 'found' | 'connected'>('disconnected');
  const [simulating, setSimulating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSearch = () => {
    setDeviceState('searching');
    setTimeout(() => {
      setDeviceState('found');
    }, 2000);
  };

  const handleLink = () => {
    setDeviceState('connected');
  };

  const handleSimulate = async (profile: 'estable' | 'riesgo_acumulado' | 'datos_insuficientes') => {
    setSimulating(true);
    setToastMessage(null);
    try {
      const res = await simulateTelemetry(subject.subject_id, profile);
      setToastMessage(`¡Éxito! ${res.stored_count} observaciones generadas.`);
    } catch (e: any) {
      setToastMessage(`Error: ${e.message || 'Desconocido'}`);
    } finally {
      setSimulating(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  return (
    <div className="app-shell__content">
      <section className="bl-card">
        <h1 className="bl-card__title">Dispositivos de Telemetría</h1>
        <p className="bl-card__sub">
          Módulo SENSE/CONNECT para <strong>{subject.display_name}</strong>
        </p>
      </section>

      <section className="bl-card">
        <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-4)' }}>
          <span aria-hidden="true">⌚</span> Reloj Inteligente (NeuraWatch)
        </p>
        
        {deviceState === 'disconnected' && (
          <div style={{ textAlign: 'center', padding: 'var(--bl-sp-4)' }}>
            <p style={{ marginBottom: 'var(--bl-sp-4)' }}>No hay dispositivos vinculados actualmente.</p>
            <button className="bl-button bl-button--primary" onClick={handleSearch}>
              Buscar dispositivos cercanos
            </button>
          </div>
        )}

        {deviceState === 'searching' && (
          <div style={{ textAlign: 'center', padding: 'var(--bl-sp-4)' }} aria-busy="true">
            <div className="bl-skeleton" style={{ width: '100%', height: '40px', marginBottom: 'var(--bl-sp-2)' }} />
            <p>Buscando señales Bluetooth...</p>
          </div>
        )}

        {deviceState === 'found' && (
          <div style={{ padding: 'var(--bl-sp-4)', border: '1px solid var(--bl-border-subtle)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>NeuraWatch v1.2</strong>
                <div style={{ fontSize: '0.9em', color: 'var(--bl-text-muted)' }}>Señal Fuerte</div>
              </div>
              <button className="bl-button bl-button--primary" onClick={handleLink}>
                Vincular
              </button>
            </div>
          </div>
        )}

        {deviceState === 'connected' && (
          <div style={{ display: 'grid', gap: 'var(--bl-sp-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bl-sp-2)' }}>
              <span style={{ color: 'var(--bl-semantic-green)' }} aria-hidden="true">✅</span>
              <strong>NeuraWatch v1.2 conectado</strong>
            </div>
            
            <p style={{ fontSize: '0.95em', color: 'var(--bl-text-muted)' }}>
              El dispositivo está listo para transmitir datos de frecuencia cardíaca, ruido ambiental y agitación.
            </p>

            <div style={{ marginTop: 'var(--bl-sp-4)' }}>
              <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-3)' }}>Simulador de Datos</p>
              <div style={{ display: 'flex', gap: 'var(--bl-sp-2)', flexWrap: 'wrap' }}>
                <button 
                  className="bl-button" 
                  onClick={() => handleSimulate('estable')}
                  disabled={simulating}
                >
                  Ráfaga: Estable
                </button>
                <button 
                  className="bl-button" 
                  onClick={() => handleSimulate('riesgo_acumulado')}
                  disabled={simulating}
                >
                  Ráfaga: Riesgo Acumulado
                </button>
              </div>
              
              {toastMessage && (
                <div className="bl-alert" style={{ marginTop: 'var(--bl-sp-3)' }}>
                  {toastMessage}
                </div>
              )}
            </div>
            
            <div style={{ marginTop: 'var(--bl-sp-4)', textAlign: 'right' }}>
               <button className="bl-button" onClick={() => setDeviceState('disconnected')}>
                 Desvincular
               </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

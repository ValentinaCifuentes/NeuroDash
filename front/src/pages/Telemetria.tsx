import { useState, useEffect } from 'react';
import type { Subject } from '../types';
import { simulateTelemetry } from '../api';

interface Props {
  subject: Subject;
}

export function Telemetria({ subject }: Props) {
  const [deviceState, setDeviceState] = useState<'disconnected' | 'searching' | 'found' | 'connected'>('disconnected');
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSearch = () => {
    setDeviceState('searching');
    setTimeout(() => {
      setDeviceState('found');
    }, 2000);
  };

  const handleLink = async () => {
    setDeviceState('connected');
    setIsOnline(true);
    // Simular sincronización inicial automática
    await syncData('estable');
  };

  const syncData = async (profile: 'estable' | 'riesgo_acumulado' | 'datos_insuficientes') => {
    setIsSyncing(true);
    try {
      await simulateTelemetry(subject.subject_id, profile);
      setLastSync(new Date());
    } catch (e: any) {
      setToastMessage(`Error al sincronizar: ${e.message || 'Desconocido'}`);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Opcional: efecto para reconectar y sincronizar automáticamente si vuelve a estar en línea
  useEffect(() => {
    if (deviceState === 'connected' && isOnline && !lastSync) {
      syncData('estable');
    }
  }, [isOnline, deviceState, lastSync]);

  return (
    <div className="app-shell__content">
      <section className="bl-card">
        <h1 className="bl-card__title">Dispositivos de Telemetría</h1>
        <p className="bl-card__sub">
          Módulo SENSE/CONNECT para <strong>{subject.display_name}</strong>
        </p>
      </section>

      <section className="bl-card">
        <div className="bl-card__header" style={{ marginBottom: 'var(--bl-sp-4)' }}>
          <p className="bl-eyebrow">
            <span aria-hidden="true">⌚</span> Reloj Inteligente
          </p>
        </div>
        
        {deviceState === 'disconnected' && (
          <div style={{ textAlign: 'center', padding: 'var(--bl-sp-4)' }}>
            <p style={{ marginBottom: 'var(--bl-sp-4)' }}>No hay dispositivos vinculados actualmente.</p>
            <div className="app-cta">
              <button className="bl-btn bl-btn--primary bl-btn--block" onClick={handleSearch}>
                <span aria-hidden="true">🔍</span> Buscar dispositivos cercanos
              </button>
            </div>
          </div>
        )}

        {deviceState === 'searching' && (
          <div style={{ textAlign: 'center', padding: 'var(--bl-sp-4)' }} aria-busy="true">
            <div className="bl-skeleton" style={{ width: '100%', height: '44px', marginBottom: 'var(--bl-sp-2)' }} />
            <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--bl-sp-2)' }}>
               <span className="bl-spinner" aria-hidden="true" /> Buscando señales Bluetooth...
            </p>
          </div>
        )}

        {deviceState === 'found' && (
          <div style={{ padding: 'var(--bl-sp-4)', border: '1px solid var(--bl-border-subtle)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>NeuraWatch v1.2</strong>
                <div style={{ fontSize: '0.9em', color: 'var(--bl-text-muted)' }}>Señal Fuerte (RSSI: -45dBm)</div>
              </div>
              <button className="bl-btn bl-btn--primary" onClick={handleLink}>
                Vincular
              </button>
            </div>
          </div>
        )}

        {deviceState === 'connected' && (
          <div style={{ display: 'grid', gap: 'var(--bl-sp-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--bl-sp-2)' }}>
                <span className="bl-icon-tile" style={{ backgroundColor: 'var(--bl-semantic-green-bg)', color: 'var(--bl-semantic-green)' }} aria-hidden="true">⌚</span>
                <div>
                  <strong style={{ display: 'block' }}>NeuraWatch v1.2</strong>
                  <span style={{ fontSize: '0.85em', color: 'var(--bl-text-muted)' }}>MAC: 00:1A:7D:DA:71:13</span>
                </div>
              </div>
              
              <button 
                className="bl-btn bl-btn--ghost" 
                onClick={() => setIsOnline(!isOnline)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: '16px',
                  backgroundColor: isOnline ? '#e6f4ea' : '#fce8e6',
                  color: isOnline ? '#137333' : '#c5221f',
                  fontSize: '0.85em',
                  border: 'none'
                }}
              >
                <span style={{ 
                  display: 'inline-block', 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  backgroundColor: isOnline ? '#137333' : '#c5221f' 
                }} />
                {isOnline ? 'En Línea' : 'Sin Conexión'}
              </button>
            </div>

            {!isOnline && (
              <div className="bl-alert bl-alert--warning" style={{ marginTop: 0 }}>
                <span aria-hidden="true">⚠️</span>
                <span>
                  El dispositivo perdió la conexión con el servidor. Las lecturas se almacenarán localmente
                  en el NeuraWatch y se sincronizarán automáticamente cuando vuelva a haber conexión.
                </span>
              </div>
            )}
            
            <div style={{ padding: 'var(--bl-sp-3)', backgroundColor: 'var(--bl-bg-subtle)', borderRadius: '8px' }}>
              <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-2)' }}>Estado de Sincronización</p>
              {isSyncing ? (
                 <p style={{ display: 'flex', alignItems: 'center', gap: 'var(--bl-sp-2)', fontSize: '0.9em', color: 'var(--bl-text-muted)' }}>
                   <span className="bl-spinner" aria-hidden="true" /> Transmitiendo telemetría al motor...
                 </p>
              ) : (
                 <p style={{ fontSize: '0.9em', color: 'var(--bl-text-muted)' }}>
                   Última sincronización: {lastSync ? lastSync.toLocaleTimeString() : 'Nunca'}
                 </p>
              )}
              {toastMessage && (
                <div style={{ marginTop: 'var(--bl-sp-2)', color: 'var(--bl-semantic-red)', fontSize: '0.85em' }}>
                  {toastMessage}
                </div>
              )}
            </div>
            
            <div>
              <p className="bl-eyebrow" style={{ margin: '0 0 var(--bl-sp-2)' }}>Variables Sensoriales Activas</p>
              <ul style={{ 
                margin: 0, 
                padding: '0 0 0 var(--bl-sp-4)', 
                color: 'var(--bl-text-muted)',
                fontSize: '0.9em',
                lineHeight: '1.6'
              }}>
                <li>Frecuencia Cardíaca (bpm)</li>
                <li>Ruido Ambiental (dBA)</li>
                <li>Agitación de Movimiento (g)</li>
                <li>Luminosidad (lux)</li>
              </ul>
            </div>
            
            <div style={{ marginTop: 'var(--bl-sp-4)', textAlign: 'center' }}>
               <button 
                 className="bl-btn bl-btn--ghost" 
                 style={{ color: 'var(--bl-semantic-red)' }}
                 onClick={() => {
                   setDeviceState('disconnected');
                   setLastSync(null);
                 }}
               >
                 Desvincular Dispositivo
               </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

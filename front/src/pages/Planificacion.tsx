import { useState } from 'react';

// Datos Mockeados de planes
const INITIAL_PLANS = [
  {
    id: 1,
    title: 'Cita con el Dentista',
    date: 'Mañana, 15:30',
    category: 'Salud',
    impactTag: 'Desagradable',
    impactType: 'danger' // Para CSS
  },
  {
    id: 2,
    title: 'Visita a la Abuela',
    date: 'Sábado, 12:00',
    category: 'Social',
    impactTag: 'Agradable',
    impactType: 'safe'
  },
  {
    id: 3,
    title: 'Cumpleaños de Martín (Mucho ruido)',
    date: 'Domingo, 16:00',
    category: 'Social',
    impactTag: 'Estresante',
    impactType: 'danger'
  }
];

export function Planificacion() {
  const [plans, setPlans] = useState(INITIAL_PLANS);
  const [showModal, setShowModal] = useState(false);

  // Estados del formulario mock
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Salud');
  const [newImpact, setNewImpact] = useState('Desagradable');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    
    const impactType = newImpact === 'Agradable' ? 'safe' : (newImpact === 'Estresante' || newImpact === 'Desagradable' ? 'danger' : 'warning');
    
    const newPlan = {
      id: Date.now(),
      title: newTitle,
      date: 'Próximamente',
      category: newCategory,
      impactTag: newImpact,
      impactType: impactType
    };
    
    setPlans([newPlan, ...plans]);
    setShowModal(false);
    setNewTitle('');
  };

  return (
    <div className="app-shell__content app-stack">
      <section className="bl-card">
        <h1 className="bl-card__title">Planificación de Eventos</h1>
        <p className="bl-card__sub">
          Registra eventos futuros para mejorar las predicciones del modelo.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <button 
            onClick={() => setShowModal(true)}
            className="bl-btn bl-btn--primary"
            style={{ width: '100%' }}
          >
            Añadir Nuevo Evento
          </button>
        </div>
      </section>

      {plans.map(plan => (
        <div key={plan.id} className="bl-card app-stack--tight" style={{ borderLeft: `4px solid \${plan.impactType === 'danger' ? '#ef4444' : plan.impactType === 'safe' ? '#10b981' : '#f59e0b'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--bl-primary-900)' }}>{plan.title}</h3>
            <span style={{ fontSize: '0.75rem', backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>
              {plan.category}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--bl-text-light)' }}>
            <span aria-hidden="true">🗓️</span> {plan.date}
          </p>
          
          <div style={{ marginTop: '0.5rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', borderRadius: '12px',
              backgroundColor: plan.impactType === 'danger' ? '#fee2e2' : plan.impactType === 'safe' ? '#d1fae5' : '#fef3c7',
              color: plan.impactType === 'danger' ? '#b91c1c' : plan.impactType === 'safe' ? '#065f46' : '#92400e'
            }}>
              {plan.impactType === 'danger' ? '⚠️' : plan.impactType === 'safe' ? '💚' : '⚡'} 
              Impacto esperado: {plan.impactTag}
            </span>
          </div>
        </div>
      ))}



      {/* Modal Mock */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }}>
          <div style={{
            background: 'white', width: '100%', maxWidth: '500px', 
            borderTopLeftRadius: '16px', borderTopRightRadius: '16px',
            padding: '1.5rem', boxShadow: '0 -4px 16px rgba(0,0,0,0.1)',
            animation: 'slideUp 0.3s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Añadir Evento</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem' }}>✕</button>
            </div>

            <form onSubmit={handleAdd} className="app-stack">
              <div>
                <label className="bl-label">Nombre del Evento</label>
                <input 
                  type="text" className="bl-input" required
                  value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="Ej: Cumpleaños, Doctor, Viaje..."
                />
              </div>

              <div>
                <label className="bl-label">Categoría</label>
                <select className="bl-input" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                  <option>Salud</option>
                  <option>Social</option>
                  <option>Escolar</option>
                  <option>Rutina</option>
                </select>
              </div>

              <div>
                <label className="bl-label">Expectativa del Evento (Para el modelo)</label>
                <select className="bl-input" value={newImpact} onChange={e => setNewImpact(e.target.value)}>
                  <option>Agradable</option>
                  <option>Neutro</option>
                  <option>Estresante</option>
                  <option>Desagradable</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--bl-text-light)', marginTop: '4px' }}>
                  Esta etiqueta ayudará al modelo a ponderar el riesgo de desregulación para este día.
                </p>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <button type="submit" className="bl-btn bl-btn--primary" style={{ width: '100%' }}>
                  Guardar Evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

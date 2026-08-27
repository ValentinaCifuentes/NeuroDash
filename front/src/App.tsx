/**
 * Raíz de la app.
 *
 * Mantiene el chrome (app bar, sidebar, FAB, sheet, toast) y el estado de
 * navegación. Las páginas no conocen el chrome; el chrome no conoce las
 * páginas más allá de la ruta activa.
 */

import { useEffect, useRef, useState } from 'react';
import { AppBar } from './components/AppBar';
import { SubjectGate } from './components/SubjectGate';
import { Sidebar } from './components/Sidebar';
import type { Route } from './components/Sidebar';
import { Fab, Toast } from './components/shell';
import { CategorySheet, EventSheet } from './sheets/EventSheets';
import { BitacoraDiaria } from './pages/BitacoraDiaria';
import { Evolucion } from './pages/Evolucion';
import { Sesiones } from './pages/Sesiones';
import { BuscarProfesionales, FichaInicial, MisTickets } from './pages/Placeholders';
import { Telemetria } from './pages/Telemetria';
import { getSubject, saveDailyRecord, saveEvent, USING_MOCK } from './api';
import { CATEGORY_BY_ID } from './domain/catalog';
import type { ApiError, DailyRecord, DysregulationEvent, LogCategory, Subject, SubjectOnboardingInput } from './types';


type SheetState = { kind: 'none' } | { kind: 'categories' } | { kind: 'event'; category: LogCategory };

export default function App() {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [route, setRoute] = useState<Route>('bitacora');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    listSubjects()
      .then(setSubjects)
      .catch((e: ApiError) => setLoadError(e))
      .finally(() => setLoadingSubjects(false));
  }, []);

  async function onOnboard(input: SubjectOnboardingInput) {
    const created = await onboardSubject(input);
    setSubjects((current) => [...current.filter((item) => item.subject_id !== created.subject_id), created]);
    setSubject(created);
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  /** La acción conserva su nombre: "Guardar estado basal" → "Estado basal guardado". */
  async function onSaveBasal(record: DailyRecord) {
    setSaving(true);
    try {
      await saveDailyRecord(record);
      setRevision((r) => r + 1);
      setToast('Estado basal guardado');
    } catch (e) {
      setToast((e as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEvent(event: DysregulationEvent) {
    setSaving(true);
    try {
      await saveEvent(event);
      setRevision((r) => r + 1);
      setSheet({ kind: 'none' });
      const name = CATEGORY_BY_ID[
        Object.keys(CATEGORY_BY_ID).find(
          (k) => CATEGORY_BY_ID[k as LogCategory].eventType === event.event_type,
        ) as LogCategory
      ].name;
      setToast(`${name} registrada`);
    } catch (e) {
      setToast((e as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="app-shell">
        <div className="app-shell__content">
          <div className="bl-alert bl-alert--danger" role="alert">
            <span aria-hidden="true">⚠️</span>
            <span>{loadError.message}</span>
          </div>
        </div>
      </div>
    );
  }

  if (loadingSubjects) {
    return (
      <div className="app-shell">
        <div className="app-shell__bar">
          <AppBar initials="··" onOpenMenu={() => {}} />
        </div>
        <div className="app-shell__content" aria-busy="true">
          <span className="bl-sr-only">Cargando</span>
          <div className="bl-card app-stack--tight">
            <div className="bl-skeleton" style={{ width: '60%', height: 22 }} />
            <div className="bl-skeleton" style={{ width: '80%' }} />
          </div>
          <div className="bl-card app-stack--tight">
            <div className="bl-skeleton" />
            <div className="bl-skeleton" />
            <div className="bl-skeleton" style={{ width: '70%' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!subject) {
    return <SubjectGate subjects={subjects} onSelect={setSubject} onOnboard={onOnboard} />;
  }

  const showFab = route === 'bitacora';

  return (
    <div className="app-shell">
      <a className="bl-skip" href="#contenido">
        Saltar al contenido
      </a>

      <div className="app-shell__bar">
        <AppBar initials={subject.initials} onOpenMenu={() => setMenuOpen(true)} />
      </div>

      <main className="app-shell__scroll" id="contenido">
        {route === 'bitacora' && (
          <BitacoraDiaria
            subject={subject}
            revision={revision}
            saving={saving}
            onSaveBasal={onSaveBasal}
          />
        )}
        {route === 'evolucion' && <Evolucion subject={subject} revision={revision} />}
        {route === 'sesiones' && (
          <Sesiones
            subject={subject}
            onSaved={(message) => {
              setRevision((r) => r + 1);
              setToast(message);
            }}
            onError={setToast}
          />
        )}
        {route === 'ficha' && <FichaInicial subject={subject} />}
        {route === 'profesionales' && <BuscarProfesionales />}
        {route === 'tickets' && <MisTickets />}
        {route === 'telemetria' && <Telemetria subject={subject} />}
      </main>

      {showFab && sheet.kind === 'none' && (
        <Fab innerRef={fabRef} aboveCta onClick={() => setSheet({ kind: 'categories' })} />
      )}

      {sheet.kind === 'categories' && (
        <CategorySheet
          returnFocusTo={fabRef}
          onPick={(category) => setSheet({ kind: 'event', category })}
          onClose={() => setSheet({ kind: 'none' })}
        />
      )}

      {sheet.kind === 'event' && (
        <EventSheet
          category={sheet.category}
          subjectId={subject.subject_id}
          saving={saving}
          returnFocusTo={fabRef}
          onSave={onSaveEvent}
          onBack={() => setSheet({ kind: 'categories' })}
          onClose={() => setSheet({ kind: 'none' })}
        />
      )}

      <Sidebar
        open={menuOpen}
        current={route}
        subjectName={subject.display_name}
        onNavigate={(r) => {
          setRoute(r);
          setMenuOpen(false);
        }}
        onClose={() => setMenuOpen(false)}
      />

      {toast && <Toast message={toast} />}

      {USING_MOCK && (
        <span className="bl-sr-only">
          Modo demostración: los datos provienen de un fixture de interfaz, no del motor.
        </span>
      )}
    </div>
  );
}

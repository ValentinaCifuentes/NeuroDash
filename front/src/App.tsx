/**
 * Raíz de la app.
 *
 * Mantiene el chrome (app bar, sidebar, FAB, sheet, toast) y el estado de
 * navegación. Las páginas no conocen el chrome; el chrome no conoce las
 * páginas más allá de la ruta activa.
 */

import { useEffect, useRef, useState } from 'react';
import { SubjectGate } from './components/SubjectGate';
import { BottomNav, ROUTES, type Route } from './components/BottomNav';
import { PageHeader, type PageHeaderProps } from './components/PageHeader';
import { Toast } from './components/shell';
import { CategorySheet, EventSheet } from './sheets/EventSheets';
import { BitacoraDiaria } from './pages/BitacoraDiaria';
import { Evolucion } from './pages/Evolucion';
import { FichaInicial, MisTickets } from './pages/Ficha';
import { Planificacion } from './pages/Planificacion';
import { getSubject, listSubjects, onboardSubject, saveDailyRecord, saveEvent, USING_MOCK } from './api';
import { CATEGORY_BY_ID } from './domain/catalog';
import type { ApiError, DailyRecord, DysregulationEvent, LogCategory, Subject, SubjectOnboardingInput } from './types';
import { Icon } from './components/icons';


type SheetState = { kind: 'none' } | { kind: 'categories' } | { kind: 'event'; category: LogCategory };

export default function App() {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const fabRef = useRef<HTMLButtonElement>(null);

  // La ruta vive en la dirección (#seguimiento…): «atrás» del navegador y del
  // teléfono funciona, y al recargar se vuelve a la misma vista. Con «#» no hace
  // falta configurar rutas en el servidor.
  useEffect(() => {
    if (window.location.hash !== `#${route}`) window.history.pushState(null, '', `#${route}`);
  }, [route]);
  useEffect(() => {
    const onPop = () => setRoute(routeFromHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    listSubjects()
      .then(setSubjects)
      .catch((e: ApiError) => setLoadError(e))
      .finally(() => setLoadingSubjects(false));
  }, []);

  // El listado no trae el perfil inicial: al elegir un infante se pide completo
  // (Ficha, señales tempranas de la Bitácora). Si falla, se sigue con el del listado.
  const subjectId = subject?.subject_id;
  useEffect(() => {
    if (!subjectId) return;
    let alive = true;
    getSubject(subjectId)
      .then((full) => alive && setSubject((current) => (current?.subject_id === full.subject_id ? { ...current, ...full } : current)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [subjectId]);

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
  async function onSaveBasal(record: DailyRecord): Promise<boolean> {
    setSaving(true);
    try {
      await saveDailyRecord(record);
      setRevision((r) => r + 1);
      setToast('Estado basal guardado');
      return true;
    } catch (e) {
      setToast((e as ApiError).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEvent(event: DysregulationEvent): Promise<boolean> {
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
      return true;
    } catch (e) {
      setToast((e as ApiError).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="nd-shell">
        <div className="nd-screen">
          <div className="nd-alert" role="alert">
            <Icon name="alert" size={18} />
            <span>{loadError.message}</span>
          </div>
        </div>
      </div>
    );
  }

  if (loadingSubjects) {
    return (
      <div className="nd-shell">
        <div className="nd-screen" aria-busy="true">
          <span className="nd-sr-only">Cargando</span>
          <div className="nd-card">
            <div className="nd-skeleton" style={{ width: '60%', height: 22 }} />
            <div className="nd-skeleton" style={{ width: '80%' }} />
          </div>
          <div className="nd-card">
            <div className="nd-skeleton" />
            <div className="nd-skeleton" />
            <div className="nd-skeleton" style={{ width: '70%' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="nd-shell">
        <SubjectGate subjects={subjects} onSelect={setSubject} onOnboard={onOnboard} />
      </div>
    );
  }

  return (
    <div className="nd-shell">
      <a className="nd-skip" href="#contenido">
        Saltar al contenido
      </a>

      <main className="nd-shell__scroll" id="contenido">
        <PageHeader
          {...headerFor(route, subject.display_name, () => setRoute('ficha'))}
          initials={subject.initials}
          subjectName={subject.display_name}
          onChangeSubject={() => setSubject(null)}
        />
        {(route === 'bitacora' || route === 'historial') && (
          <BitacoraDiaria
            view={route === 'historial' ? 'historial' : 'basal'}
            onChangeView={(view) => setRoute(view === 'historial' ? 'historial' : 'bitacora')}
            subject={subject}
            revision={revision}
            saving={saving}
            onSaveBasal={onSaveBasal}
            onAddEvent={sheet.kind === 'none' ? () => setSheet({ kind: 'categories' }) : undefined}
            fabRef={fabRef}
          />
        )}
        {(route === 'evolucion' || route === 'seguimiento') && (
          <Evolucion
            subject={subject}
            revision={revision}
            onOpenBitacora={() => setRoute('bitacora')}
            view={route === 'seguimiento' ? 'seguimiento' : 'estimacion'}
            onChangeView={(view) => setRoute(view === 'seguimiento' ? 'seguimiento' : 'evolucion')}
          />
        )}
        {route === 'ficha' && <FichaInicial subject={subject} onOpenTickets={() => setRoute('tickets')} />}
        {route === 'tickets' && <MisTickets />}
        {route === 'planificacion' && (
          <Planificacion subject={subject} onSaved={() => setToast('Evento guardado')} />
        )}
        {USING_MOCK && (
          // Dentro de <main>: quien navega por zonas también lo encuentra (axe · region).
          <p className="nd-sr-only">
            Modo demostración sin servidor: las estimaciones son las de la demo y no cambian al registrar.
          </p>
        )}
      </main>

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

      <BottomNav current={route} onNavigate={setRoute} />

      {toast && <Toast message={toast} />}

    </div>
  );
}

type HeaderCopy = Pick<PageHeaderProps, 'title' | 'subtitle' | 'brand' | 'back'>;

/** Título y subtítulo de cada pantalla, tal como en `screens/` del prototipo. */
function routeFromHash(): Route {
  const hash = window.location.hash.slice(1) as Route;
  return ROUTES.includes(hash) ? hash : 'evolucion';
}

function headerFor(route: Route, name: string, backToFicha: () => void): HeaderCopy {
  switch (route) {
    case 'evolucion':
    case 'seguimiento':
      return { title: 'Evolución' };
    case 'bitacora':
    case 'historial':
      return {
        brand: true,
        title: 'Bitácora Diaria',
        subtitle: (
          <>
            Registra el estado basal y eventos cotidianos de <strong>{name}</strong>
          </>
        ),
      };
    case 'planificacion':
      return {
        brand: true,
        title: 'Planificación de Eventos',
        subtitle: 'Anota lo que viene para anticiparte.',
      };
    case 'ficha':
      return {
        brand: true,
        title: 'Ficha Inicial',
        subtitle: (
          <>
            Perfil de <strong>{name}</strong>
          </>
        ),
      };
    case 'tickets':
      return { back: { label: 'Ficha', onClick: backToFicha }, title: 'Mis Tickets', subtitle: 'Solicitudes al equipo de soporte' };
  }
}

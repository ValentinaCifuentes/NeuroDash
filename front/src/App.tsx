/**
 * Raíz de la app.
 *
 * Mantiene el chrome (app bar, sidebar, FAB, sheet, toast) y el estado de
 * navegación. Las páginas no conocen el chrome; el chrome no conoce las
 * páginas más allá de la ruta activa.
 */

import { useEffect, useRef, useState } from 'react';
import { SubjectGate } from './components/SubjectGate';
import { BottomNav, type Route } from './components/BottomNav';
import { PageHeader, type PageHeaderProps } from './components/PageHeader';
import { Toast } from './components/shell';
import { CategorySheet, EventSheet } from './sheets/EventSheets';
import { BitacoraDiaria } from './pages/BitacoraDiaria';
import { Evolucion } from './pages/Evolucion';
import { FichaInicial, MisTickets } from './pages/Placeholders';
import { Planificacion } from './pages/Planificacion';
import { listSubjects, onboardSubject, saveDailyRecord, saveEvent, USING_MOCK } from './api';
import { CATEGORY_BY_ID } from './domain/catalog';
import type { ApiError, DailyRecord, DysregulationEvent, LogCategory, Subject, SubjectOnboardingInput } from './types';
import { Icon } from './components/icons';


type SheetState = { kind: 'none' } | { kind: 'categories' } | { kind: 'event'; category: LogCategory };

export default function App() {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [route, setRoute] = useState<Route>('evolucion');
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
            <Icon name="alert" size={18} />
            <span>{loadError.message}</span>
          </div>
        </div>
      </div>
    );
  }

  if (loadingSubjects) {
    return (
      <div className="app-shell">
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

  return (
    <div className="app-shell app-shell--nav">
      <a className="bl-skip" href="#contenido">
        Saltar al contenido
      </a>

      <main className="app-shell__scroll" id="contenido">
        <PageHeader
          {...headerFor(route, subject.display_name, () => setRoute('ficha'))}
          initials={subject.initials}
          subjectName={subject.display_name}
          onChangeSubject={() => setSubject(null)}
        />
        {route === 'bitacora' && (
          <BitacoraDiaria
            subject={subject}
            revision={revision}
            saving={saving}
            onSaveBasal={onSaveBasal}
            onAddEvent={sheet.kind === 'none' ? () => setSheet({ kind: 'categories' }) : undefined}
            fabRef={fabRef}
          />
        )}
        {route === 'evolucion' && (
          <Evolucion subject={subject} revision={revision} onOpenBitacora={() => setRoute('bitacora')} />
        )}
        {route === 'ficha' && <FichaInicial subject={subject} onOpenTickets={() => setRoute('tickets')} />}
        {route === 'tickets' && <MisTickets />}
        {route === 'planificacion' && <Planificacion />}
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

      {USING_MOCK && (
        <span className="bl-sr-only">
          Modo demostración: los datos provienen de un fixture de interfaz, no del motor.
        </span>
      )}
    </div>
  );
}

type HeaderCopy = Pick<PageHeaderProps, 'title' | 'subtitle' | 'brand' | 'back'>;

/** Título y subtítulo de cada pantalla, tal como en `screens/` del prototipo. */
function headerFor(route: Route, name: string, backToFicha: () => void): HeaderCopy {
  switch (route) {
    case 'evolucion':
      return { title: 'Evolución' };
    case 'bitacora':
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
        subtitle: 'Registra eventos futuros para mejorar las predicciones del modelo.',
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

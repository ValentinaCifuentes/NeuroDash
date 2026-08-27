/**
 * Seguimiento · lectura retrospectiva dentro de Evolución.
 *
 * Complementa la estimación: mientras el Prediction Contract mira las
 * próximas 24 h, esto muestra lo que ya pasó. Son ejes distintos y por eso
 * viven en pestañas separadas, no apilados.
 *
 * Todo lo que se ve acá sale del timeline —que el backend ya recortó por
 * cutoff— agrupado por día. El frontend no infiere nada clínico.
 */

import { useEffect, useState } from 'react';
import { getTimeline } from '../api';
import { buildDaySummaries, dayStatus, localDay } from '../domain/aggregate';
import type { DaySummary } from '../domain/aggregate';
import {
  DAY_REGULATION_CHOICES,
  HEAT_STEPS,
  SEMANTIC_BG,
  SEMANTIC_COLOR,
  SLEEP_ICON,
  WAKE_CHOICES,
  WEEKDAY_SHORT,
  dayLabel,
} from '../domain/catalog';
import type { Subject } from '../types';

const HEATMAP_DAYS = 30;
const TRACKING_DAYS = 5;
const MULTIVARIABLE_DAYS = 14;

export function Seguimiento({ subject, revision }: { subject: Subject; revision: number }) {
  const [days, setDays] = useState<DaySummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    setDays(null);
    getTimeline(subject.subject_id, new Date().toISOString(), HEATMAP_DAYS)
      .then((res) => alive && setDays(buildDaySummaries(res.entries, new Date(), HEATMAP_DAYS)))
      .catch(() => alive && setDays([]));
    return () => {
      alive = false;
    };
  }, [subject.subject_id, revision]);

  if (days === null) {
    return (
      <section className="bl-card app-stack--tight" aria-busy="true">
        <span className="bl-sr-only">Cargando el seguimiento</span>
        <div className="bl-skeleton" style={{ width: '50%', height: 22 }} />
        <div className="bl-skeleton" style={{ height: 120 }} />
      </section>
    );
  }

  return (
    <>
      <MultivariableTimeline days={days.slice(-MULTIVARIABLE_DAYS)} />
      <Heatmap days={days} />
      <DailyTracking days={days.slice(-TRACKING_DAYS)} subject={subject} />
    </>
  );
}

/* ============================================================
   Evolución compacta de 14 días
   ============================================================ */

function MultivariableTimeline({ days }: { days: DaySummary[] }) {
  const hasRegulation = days.some((day) => day.regulation !== null);
  const daysWithRecord = days.filter((day) => day.hasRecord).length;
  const daysWithEvents = days.filter((day) => day.eventCount > 0).length;
  const sleepWatchDays = days.filter(
    (day) => day.sleep === 'Interrumpido' || day.sleep === 'Dificultad de Conciliación',
  ).length;

  return (
    <section className="bl-card">
      <div className="bl-card__header">
        <span className="bl-icon-tile" aria-hidden="true">
          ⇄
        </span>
        <h2>Evolución de 14 días</h2>
      </div>
      <p className="bl-card__sub" style={{ marginTop: 0 }}>
        Lectura rápida de sueño, despertar, regulación y eventos registrados. Un día sin registro se muestra como dato faltante.
      </p>

      <div className="app-summary-strip" aria-label="Resumen de los últimos 14 días">
        <span><strong>{daysWithRecord}</strong> días con registro</span>
        <span><strong>{daysWithEvents}</strong> con eventos</span>
        <span><strong>{sleepWatchDays}</strong> noches para observar</span>
      </div>

      <div className="app-timeline14" role="table" aria-label="Evolución de los últimos 14 días">
        <div className="app-timeline14__row app-timeline14__row--head" role="row">
          <span role="columnheader">Variable</span>
          {days.map((day) => (
            <span key={day.date} role="columnheader">
              {day.date.slice(8, 10)}
            </span>
          ))}
        </div>

        <TimelineRow label="Sueño" days={days} getValue={sleepMark} />
        <TimelineRow label="Despertar" days={days} getValue={wakeMark} />
        {hasRegulation && <TimelineRow label="Regulación" days={days} getValue={regulationMark} />}
        <TimelineRow label="Eventos" days={days} getValue={eventMark} />
      </div>

      <div className="app-legend" aria-hidden="true">
        <span className="app-legend__item">● dentro de lo esperado o tranquilo</span>
        <span className="app-legend__item">◐ observar</span>
        <span className="app-legend__item">▲ señal relevante</span>
        <span className="app-legend__item">— sin dato</span>
      </div>
    </section>
  );
}

function TimelineRow({
  label,
  days,
  getValue,
}: {
  label: string;
  days: DaySummary[];
  getValue: (day: DaySummary) => TimelineMark;
}) {
  return (
    <div className="app-timeline14__row" role="row">
      <span role="rowheader">{label}</span>
      {days.map((day) => {
        const mark = getValue(day);
        return (
          <span key={day.date} className={`app-timeline14__mark app-timeline14__mark--${mark.semantic}`} role="cell">
            <span aria-hidden="true">{mark.symbol}</span>
            <span className="bl-sr-only">
              {dayLabel(day.date).short}: {mark.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

type TimelineMark = {
  symbol: string;
  label: string;
  semantic: 'success' | 'warning' | 'danger' | 'neutral';
};

function sleepMark(day: DaySummary): TimelineMark {
  if (!day.hasRecord || !day.sleep) return { symbol: '—', label: 'sin registro de sueño', semantic: 'neutral' };
  if (day.sleep === 'Reparador') return { symbol: '●', label: 'sueño reparador', semantic: 'success' };
  if (day.sleep === 'Interrumpido') return { symbol: '◐', label: 'sueño interrumpido', semantic: 'warning' };
  return { symbol: '▲', label: 'dificultad para conciliar el sueño', semantic: 'danger' };
}

function wakeMark(day: DaySummary): TimelineMark {
  if (!day.hasRecord || !day.wake) return { symbol: '—', label: 'sin registro de despertar', semantic: 'neutral' };
  if (day.wake === 'Tranquilo/Alegre') return { symbol: '●', label: wakeLabel(day.wake), semantic: 'success' };
  if (day.wake === 'Cansado/Con Sueño') return { symbol: '◐', label: wakeLabel(day.wake), semantic: 'warning' };
  return { symbol: '▲', label: wakeLabel(day.wake), semantic: 'danger' };
}

function regulationMark(day: DaySummary): TimelineMark {
  if (!day.hasRecord || !day.regulation) return { symbol: '—', label: 'sin cierre de regulación', semantic: 'neutral' };
  if (day.regulation === 'Excelente') return { symbol: '●', label: regulationLabel(day.regulation), semantic: 'success' };
  if (day.regulation === 'Estable con Apoyo') return { symbol: '◐', label: regulationLabel(day.regulation), semantic: 'warning' };
  return { symbol: '▲', label: regulationLabel(day.regulation), semantic: 'danger' };
}

function eventMark(day: DaySummary): TimelineMark {
  if (day.eventCount === 0) return { symbol: '●', label: 'sin eventos registrados', semantic: 'success' };
  if ((day.maxIntensity ?? 0) >= 8 || day.eventCount >= 3) {
    return { symbol: '▲', label: `${day.eventCount} eventos registrados`, semantic: 'danger' };
  }
  return { symbol: '◐', label: `${day.eventCount} eventos registrados`, semantic: 'warning' };
}

function wakeLabel(value: NonNullable<DaySummary['wake']>): string {
  return WAKE_CHOICES.find((choice) => choice.value === value)?.label ?? value;
}

function regulationLabel(value: NonNullable<DaySummary['regulation']>): string {
  return DAY_REGULATION_CHOICES.find((choice) => choice.value === value)?.label ?? value;
}

/* ============================================================
   Mapa de calor mensual
   ============================================================

   Se dibuja como tabla real, no como grid de divs: un calendario ES una
   tabla, y así el lector de pantalla puede recorrerlo por día de la
   semana en vez de escuchar 30 números sueltos.

   Las celdas no son interactivas a propósito. A 375px un día mide ~40px
   y no llegaría a los 44px de área táctil (§3.4); antes que un objetivo
   táctil que falla, preferimos que sea lectura.
   ============================================================ */

function Heatmap({ days }: { days: DaySummary[] }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return null;

  // Semanas que parten en lunes, con relleno antes del primer día y después del último.
  const start = new Date(`${first.date}T00:00:00`);
  const end = new Date(`${last.date}T00:00:00`);
  const lead = (start.getDay() + 6) % 7; // domingo=0 → lunes=0
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - lead);

  const weeks: (DaySummary | { date: string; outside: true })[][] = [];
  const cursor = new Date(gridStart);
  while (cursor <= end || (cursor.getDay() + 6) % 7 !== 0) {
    const week: (DaySummary | { date: string; outside: true })[] = [];
    for (let i = 0; i < 7; i++) {
      const key = localDay(cursor.toISOString());
      const found = byDate.get(key);
      week.push(found ?? { date: key, outside: true });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (weeks.length > 6) break;
  }

  const withEvents = days.filter((d) => d.eventCount > 0).length;

  return (
    <section className="bl-card">
      <div className="bl-card__header">
        <span className="bl-icon-tile" aria-hidden="true">
          ▦
        </span>
        <h2>Mapa de calor mensual</h2>
      </div>
      <p className="bl-card__sub" style={{ marginTop: 0 }}>
        Densidad de eventos registrados en los últimos {HEATMAP_DAYS} días. Los tonos más oscuros
        indican más registros, no mayor gravedad.
      </p>

      <table className="app-heat" >
        <caption className="bl-sr-only">
          Calendario de los últimos {HEATMAP_DAYS} días. {withEvents} días con eventos registrados.
        </caption>
        <thead>
          <tr>
            {WEEKDAY_SHORT.map((wd) => (
              <th key={wd} scope="col">
                {wd}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((cell) => {
                const dayNumber = Number(cell.date.slice(8, 10));
                if ('outside' in cell) {
                  return (
                    <td key={cell.date} className="app-heat__cell app-heat__cell--outside">
                      <span aria-hidden="true">{dayNumber}</span>
                    </td>
                  );
                }
                const step = HEAT_STEPS[cell.heat]!;
                const { short } = dayLabel(cell.date);
                return (
                  <td
                    key={cell.date}
                    className="app-heat__cell"
                    style={{ background: step.bg, borderColor: step.border }}
                  >
                    <span
                      className={`app-heat__num${cell.heat === 3 ? ' app-heat__num--on' : ''}`}
                      aria-hidden="true"
                    >
                      {dayNumber}
                    </span>
                    {cell.sleep && (
                      <span className="app-heat__sleep" aria-hidden="true">
                        {SLEEP_ICON[cell.sleep]}
                      </span>
                    )}
                    <span className="bl-sr-only">
                      {short}: {step.text}
                      {cell.sleep ? `, sueño ${cell.sleep}` : ', sin registro de sueño'}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="app-legend" aria-hidden="true">
        <div className="app-legend__group">
          <span className="app-legend__title">Eventos</span>
          {HEAT_STEPS.map((step) => (
            <span key={step.label} className="app-legend__item">
              <span
                className="app-legend__swatch"
                style={{ background: step.bg, borderColor: step.border }}
              />
              {step.label}
            </span>
          ))}
        </div>
        <div className="app-legend__group">
          <span className="app-legend__title">Sueño</span>
          {(Object.keys(SLEEP_ICON) as (keyof typeof SLEEP_ICON)[]).map((key) => (
            <span key={key} className="app-legend__item">
              {SLEEP_ICON[key]} {key === 'Dificultad de Conciliación' ? 'Difícil' : key}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Últimos días de seguimiento
   ============================================================

   El mockup es una tabla de 5 columnas. A 375px eso obliga a scroll
   horizontal o a truncar, así que cada día se convierte en una fila-card
   apilada: la fecha manda y los datos van como chips debajo.
   ============================================================ */

function DailyTracking({ days, subject }: { days: DaySummary[]; subject: Subject }) {
  return (
    <section className="bl-card">
      <div className="bl-card__header">
        <span className="bl-icon-tile" aria-hidden="true">
          🗓️
        </span>
        <h2>Últimos {days.length} días</h2>
      </div>
      <p className="bl-card__sub" style={{ marginTop: 0 }}>
        Cruce de descanso nocturno y eventos registrados para{' '}
        <strong>{subject.display_name}</strong>
      </p>

      <ul className="app-track" style={{ listStyle: 'none', margin: 'var(--bl-sp-4) 0 0', padding: 0 }}>
        {[...days].reverse().map((day) => {
          const status = dayStatus(day);
          const { weekday, short } = dayLabel(day.date);
          return (
            <li key={day.date} className="app-track__row">
              <div className="app-track__head">
                <span>
                  <b className="app-track__day">{weekday}</b>
                  <span className="app-track__date">{short}</span>
                </span>
                <span
                  className="bl-badge"
                  style={{
                    background: SEMANTIC_BG[status.semantic],
                    color: 'var(--bl-text-body)',
                  }}
                >
                  <span
                    className="bl-dot"
                    style={{
                      background: SEMANTIC_COLOR[status.semantic],
                      width: 10,
                      height: 10,
                      flex: '0 0 10px',
                    }}
                    aria-hidden="true"
                  />
                  {status.label}
                </span>
              </div>

              <div className="app-track__chips">
                <span className="app-chip">
                  {day.sleep ? (
                    <>
                      <span aria-hidden="true">{SLEEP_ICON[day.sleep]}</span>
                      {day.sleep === 'Dificultad de Conciliación' ? 'Difícil' : day.sleep}
                    </>
                  ) : (
                    <span className="app-chip--muted">Sin registro de sueño</span>
                  )}
                </span>
                <span className="app-chip">
                  {day.eventCount} evento{day.eventCount === 1 ? '' : 's'}
                </span>
                {day.maxIntensity !== null && (
                  <span className="app-chip">Máx. {day.maxIntensity}/10</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p style={{ margin: 'var(--bl-sp-4) 0 0', fontSize: 'var(--bl-fs-xs)', color: 'var(--bl-text-muted)' }}>
        Resume lo que se registró cada día. No es una estimación del motor: eso vive en la pestaña
        «Próximas 24 h».
      </p>
    </section>
  );
}

/**
 * Seguimiento · lo que ya pasó (screens/Final-Seguimiento.html y -desplegado.html).
 *
 * 1. Calendario del mes con escala de calor por cantidad de eventos; se toca
 *    un día para ver su detalle.
 * 2. Detalle del día: sueño, despertar, regulación y eventos, cada uno con forma.
 * 3. «Evolución de 14 días» (Disclosure): cerrado dice qué subió; abierto,
 *    dos semanas de barras por variable y la comparación con la anterior.
 *
 * Todo sale del timeline, que el backend ya recortó por cutoff, agrupado por
 * día. El frontend no infiere nada clínico: resume lo registrado.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { getTimeline } from '../api';
import { Disclosure } from '../components/Disclosure';
import { ShapeMark } from '../components/marks';
import {
  TRACKED_VARIABLES,
  buildDaySummaries,
  comparisonHeadline,
  dayMark,
  dayStatus,
  localDay,
  weeklyComparison,
  type DayMark,
  type DaySummary,
  type TrackedVariable,
  type WeekComparison,
} from '../domain/aggregate';
import { Icon } from '../components/icons';
import { DAY_REGULATION_CHOICES, HEAT_STEPS, SEMANTIC_BG, SEMANTIC_COLOR, SEMANTIC_FG, SEMANTIC_SHAPE, WEEKDAY_SHORT, dayLabel } from '../domain/catalog';
import type { Subject } from '../types';

/** Días pedidos al timeline: alcanzan para el mes en curso, el anterior completo y los 14 días. */
const HISTORY_DAYS = 70;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function Seguimiento({ subject, revision }: { subject: Subject; revision: number }) {
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const today = localDay(new Date().toISOString());
  const [selected, setSelected] = useState(today);
  /** 0 = mes en curso, -1 = mes anterior (lo que alcanza el historial pedido). */
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    let alive = true;
    setDays(null);
    getTimeline(subject.subject_id, new Date().toISOString(), HISTORY_DAYS)
      .then((res) => alive && setDays(buildDaySummaries(res.entries, new Date(), HISTORY_DAYS)))
      .catch(() => alive && setDays([]));
    return () => {
      alive = false;
    };
  }, [subject.subject_id, revision]);

  if (days === null) {
    return (
      <section className="nd-card" aria-busy="true">
        <span className="nd-sr-only">Cargando el seguimiento</span>
        <div className="nd-skeleton" style={{ width: '50%', height: 22 }} />
        <div className="nd-skeleton" style={{ height: 120 }} />
      </section>
    );
  }

  const byDate = new Map(days.map((day) => [day.date, day]));
  const selectedDay = byDate.get(selected) ?? null;
  const comparison = weeklyComparison(days);

  return (
    <>
      <MonthCalendar
        byDate={byDate}
        today={today}
        monthOffset={monthOffset}
        onMonthChange={(offset) => {
          setMonthOffset(offset);
          // Al cambiar de mes se elige su último día con registro (o el último día pasado).
          const cells = monthCells(today, offset).filter((cell) => cell.inMonth && !cell.future);
          const logged = cells.filter((cell) => {
            const day = byDate.get(cell.date);
            return day && (day.hasRecord || day.eventCount > 0);
          });
          setSelected((logged.at(-1) ?? cells.at(-1))!.date);
        }}
        selected={selected}
        onSelect={setSelected}
      />
      <DayDetail date={selected} day={selectedDay} />
      <Disclosure title="Evolución de 14 días" summary={comparisonHeadline(comparison)}>
        <FourteenDays comparison={comparison} days={days.slice(-14)} />
      </Disclosure>
    </>
  );
}

/* ============================================================
   Calendario del mes
   ============================================================ */

interface Cell {
  date: string;
  inMonth: boolean;
  future: boolean;
}

function monthCells(today: string, offset = 0): Cell[] {
  const [ty, tm] = today.split('-').map(Number);
  const shown = new Date(ty, tm - 1 + offset, 1);
  const y = shown.getFullYear();
  const m = shown.getMonth() + 1;
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // lunes = 0
  const start = new Date(y, m - 1, 1 - lead);
  const daysInMonth = new Date(y, m, 0).getDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const date = localDay(d.toISOString());
    return { date, inMonth: d.getMonth() === m - 1, future: date > today };
  });
}

function MonthCalendar({
  byDate,
  today,
  monthOffset,
  onMonthChange,
  selected,
  onSelect,
}: {
  byDate: Map<string, DaySummary>;
  today: string;
  monthOffset: number;
  onMonthChange: (offset: number) => void;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const cells = useMemo(() => monthCells(today, monthOffset), [today, monthOffset]);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const monthIndex = Number(cells.find((cell) => cell.inMonth)!.date.slice(5, 7)) - 1;
  const month = MONTHS[monthIndex];
  const selectable = cells.filter((cell) => cell.inMonth && !cell.future).map((cell) => cell.date);

  function onKeyDown(event: KeyboardEvent, date: string) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const target = selectable[selectable.indexOf(date) + step];
    if (!target) return;
    onSelect(target);
    refs.current.get(target)?.focus();
  }

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <section className="nd-card nd-calendar" aria-labelledby="cal-titulo">
      <div className="nd-calendar__head">
        <div className="nd-calendar__nav">
          <button
            type="button"
            className="nd-calendar__arrow nd-press"
            aria-label="Mes anterior"
            disabled={monthOffset <= -1}
            onClick={() => onMonthChange(monthOffset - 1)}
          >
            <Icon name="back" size={16} strokeWidth={2.4} />
          </button>
          <h2 id="cal-titulo" className="nd-calendar__month" aria-live="polite">{capitalize(month)}</h2>
          <button
            type="button"
            className="nd-calendar__arrow nd-press"
            aria-label="Mes siguiente"
            disabled={monthOffset >= 0}
            onClick={() => onMonthChange(monthOffset + 1)}
          >
            <Icon name="chevronRight" size={16} strokeWidth={2.4} />
          </button>
        </div>
        <span className="nd-calendar__legend" aria-hidden="true">
          menos
          {HEAT_STEPS.map((step) => (
            <span key={step.label} className="nd-calendar__swatch" style={{ background: step.bg, borderColor: step.border }} />
          ))}
          más eventos
        </span>
      </div>
      <div role="grid" aria-label="Calendario del mes: toca un día para ver su detalle" className="nd-calendar__grid">
        <div role="row" className="nd-calendar__row">
          {WEEKDAY_SHORT.map((weekday) => (
            <span key={weekday} role="columnheader" className="nd-calendar__weekday">
              {weekday}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} role="row" className="nd-calendar__row">
            {week.map((cell) => {
              const number = Number(cell.date.slice(8, 10));
              if (!cell.inMonth || cell.future) {
                return (
                  <span key={cell.date} role="gridcell" aria-disabled="true" className="nd-calendar__cell nd-calendar__cell--off">
                    <span aria-hidden="true">{number}</span>
                  </span>
                );
              }
              const day = byDate.get(cell.date);
              const logged = !!day && (day.hasRecord || day.eventCount > 0);
              const heat = day?.heat ?? 0;
              const isSelected = cell.date === selected;
              return (
                <button
                  key={cell.date}
                  ref={(el) => {
                    if (el) refs.current.set(cell.date, el);
                  }}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={`${number} de ${month}: ${logged ? HEAT_STEPS[heat].text.toLowerCase() : 'sin registro'}`}
                  tabIndex={isSelected ? 0 : -1}
                  className={`nd-calendar__cell nd-press nd-heat-${logged ? heat : 'none'}`}
                  onClick={() => onSelect(cell.date)}
                  onKeyDown={(event) => onKeyDown(event, cell.date)}
                >
                  {number}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Detalle del día
   ============================================================ */

const MARK_STYLE: Record<Exclude<DayMark, 'none'>, { shape: 'circle' | 'half' | 'triangle'; color: string }> = {
  good: { shape: 'circle', color: 'var(--nd-risk-low)' },
  watch: { shape: 'half', color: 'var(--nd-risk-mid)' },
  alert: { shape: 'triangle', color: 'var(--nd-risk-high)' },
};

const SLEEP_TEXT: Record<string, string> = { 'Dificultad de Conciliación': 'Muy Difícil' };
const WAKE_TEXT: Record<string, string> = {
  'Tranquilo/Alegre': 'Tranquilo / Alegre',
  'Cansado/Con Sueño': 'Cansado / Con sueño',
  'Irritable/Llorando': 'Irritable / Llorando',
};

function DayDetail({ date, day }: { date: string; day: DaySummary | null }) {
  const { weekday, short } = dayLabel(date);
  const status = day ? dayStatus(day) : null;
  const value = (variable: TrackedVariable): string => {
    if (!day) return 'Sin registro';
    if (variable === 'sleep') return day.sleep ? SLEEP_TEXT[day.sleep] ?? day.sleep : 'Sin registro';
    if (variable === 'wake') return day.wake ? WAKE_TEXT[day.wake] ?? day.wake : 'Sin registro';
    if (variable === 'regulation') {
      return DAY_REGULATION_CHOICES.find((choice) => choice.value === day.regulation)?.label ?? 'Sin registro';
    }
    if (day.eventCount === 0) return day.hasRecord ? 'Sin eventos' : 'Sin registro';
    const count = `${day.eventCount} ${day.eventCount === 1 ? 'evento' : 'eventos'}`;
    return day.maxIntensity ? `${count} · Máx. ${day.maxIntensity}/10` : count;
  };

  return (
    <section className="nd-card nd-daydetail" aria-labelledby="dia-titulo" aria-live="polite">
      <div className="nd-daydetail__head">
        <h2 id="dia-titulo" className="nd-daydetail__title">
          <span>{weekday}</span>
          <span className="nd-daydetail__date">{short}</span>
        </h2>
        {status && status.semantic !== 'neutral' && (
          <span className="nd-badge nd-badge--sm" style={{ background: SEMANTIC_BG[status.semantic], color: SEMANTIC_FG[status.semantic] }}>
            <ShapeMark shape={SEMANTIC_SHAPE[status.semantic]} color={SEMANTIC_COLOR[status.semantic]} size={10} />
            {status.label}
          </span>
        )}
      </div>
      <dl className="nd-daydetail__grid">
        {TRACKED_VARIABLES.map(({ key, label }) => {
          const mark = day ? dayMark(key, day) : 'none';
          return (
            <div key={key} className="nd-daydetail__item">
              <dt>{label}</dt>
              <dd className={mark === 'none' ? 'nd-daydetail__empty' : undefined}>
                {key !== 'events' && mark !== 'none' && (
                  <ShapeMark shape={MARK_STYLE[mark].shape} color={MARK_STYLE[mark].color} size={11} />
                )}
                {value(key)}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/* ============================================================
   Evolución de 14 días
   ============================================================ */

const TREND: Record<WeekComparison['trend'], { text: string; symbol: string; className: string }> = {
  up: { text: 'Más que la semana anterior', symbol: '↑', className: 'nd-trend--up' },
  down: { text: 'Menos que la semana anterior', symbol: '↓', className: 'nd-trend--down' },
  same: { text: 'Igual que la semana anterior', symbol: '=', className: 'nd-trend--same' },
};

function weekRange(days: DaySummary[]): string {
  if (days.length === 0) return '';
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const short = (date: string) => MONTHS[Number(date.slice(5, 7)) - 1].slice(0, 3);
  const day = (date: string) => Number(date.slice(8, 10));
  // «21–27 oct», o «28 oct – 3 nov» si la semana cruza de mes.
  return short(first) === short(last)
    ? `${day(first)}–${day(last)} ${short(last)}`
    : `${day(first)} ${short(first)} – ${day(last)} ${short(last)}`;
}

function FourteenDays({ comparison, days }: { comparison: WeekComparison[]; days: DaySummary[] }) {
  return (
    <div className="nd-fourteen">
      <p className="nd-fourteen__intro">
        Solo se marcan los días que conviene mirar: barra media para observar, barra completa para señal relevante.
      </p>
      <div className="nd-fourteen__weeks" aria-hidden="true">
        <span>Semana anterior · {weekRange(days.slice(0, 7))}</span>
        <span>Esta semana · {weekRange(days.slice(7))}</span>
      </div>
      {comparison.map((item) => {
        const trend = TREND[item.trend];
        const summary = `Esta semana: ${item.currentCount} ${item.unit} · semana anterior: ${item.previousCount}`;
        return (
          <div key={item.variable} role="group" aria-label={`${item.label}. ${summary}. ${trend.text}`} className="nd-fourteen__var">
            <div className="nd-fourteen__varhead">
              <span className="nd-fourteen__label">{item.label}</span>
              <span className={`nd-trend ${trend.className}`}>
                <span aria-hidden="true">{trend.symbol}</span>
                {trend.text}
              </span>
            </div>
            <div className="nd-fourteen__bars" aria-hidden="true">
              {[item.previous, item.current].map((week, w) => (
                <div key={w} className="nd-fourteen__week">
                  {week.map((mark, i) => (
                    <span key={i} className={`nd-bar nd-bar--${mark}`} />
                  ))}
                </div>
              ))}
            </div>
            <span className="nd-fourteen__summary">{summary}</span>
          </div>
        );
      })}
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

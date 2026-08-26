/**
 * Catálogo de dominio.
 *
 * Une el vocabulario clínico de los CSV de BLUBA con las etiquetas que ve
 * el tutor. Regla: el `value` es siempre el literal del CSV (lo que viaja
 * al motor); el `label` es lenguaje de tutor (lo que se muestra).
 *
 * Design system §2.3: toda opción clínica lleva punto de color de 14px o
 * icono como refuerzo. El color nunca es la única señal.
 */

import type {
  GiStatus,
  IntensityBand,
  LogCategory,
  SleepQuality,
  StartAutonomy,
  StrategyOutcome,
  EventType,
  WakeMode,
  DayRegulationLevel,
} from '../types';

export type Semantic = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** Emoji o glifo; refuerzo no cromático del significado. */
  icon?: string;
  /** Punto de color de 14px para contexto clínico. */
  dot?: Semantic;
}

export const SEMANTIC_COLOR: Record<Semantic, string> = {
  success: 'var(--bl-success)',
  warning: 'var(--bl-warning)',
  danger: 'var(--bl-danger)',
  info: 'var(--bl-info)',
  neutral: 'var(--bl-border-strong)',
};

export const SEMANTIC_BG: Record<Semantic, string> = {
  success: 'var(--bl-success-bg)',
  warning: 'var(--bl-warning-bg)',
  danger: 'var(--bl-danger-bg)',
  info: 'var(--bl-info-bg)',
  neutral: 'var(--bl-neutral-chip)',
};

/* --- Descanso nocturno (calidad_sueno) --- */
export const SLEEP_CHOICES: Choice<SleepQuality>[] = [
  { value: 'Reparador', label: 'Reparador', icon: '😌' },
  { value: 'Interrumpido', label: 'Interrumpido', icon: '😐' },
  // El CSV guarda "Dificultad de Conciliación"; el tutor lee "Muy Difícil".
  { value: 'Dificultad de Conciliación', label: 'Muy Difícil', icon: '😫' },
];

/* --- Al despertar (modo_despertar) --- */
export const WAKE_CHOICES: Choice<WakeMode>[] = [
  { value: 'Tranquilo/Alegre', label: 'Tranquilo / Alegre', icon: '🙂' },
  { value: 'Cansado/Con Sueño', label: 'Cansado / Con sueño', icon: '🥱' },
  { value: 'Irritable/Llorando', label: 'Irritable / Llorando', icon: '😢' },
];

/* --- Inicio del día (autonomia_inicio_dia) --- */
export const START_AUTONOMY_CHOICES: Choice<StartAutonomy>[] = [
  { value: 'Por sí solo', label: 'Por sí solo', icon: '🚶' },
  { value: 'Con alarma', label: 'Con alarma', icon: '⏰' },
  { value: 'Con insistencia', label: 'Con insistencia', icon: '🤝' },
];

/* --- Digestión (estado_gastrointestinal) --- */
export const GI_CHOICES: Choice<GiStatus>[] = [
  { value: 'Normal', label: 'Normal', dot: 'success' },
  { value: 'Estreñimiento', label: 'Estreñimiento', dot: 'warning' },
  { value: 'Diarrea', label: 'Diarrea / Irritación', dot: 'danger' },
];

/* --- Cierre de jornada (nivel_regulacion_general_dia) --- */
export const DAY_REGULATION_CHOICES: Choice<DayRegulationLevel>[] = [
  { value: 'Excelente', label: 'Excelente', dot: 'success' },
  { value: 'Estable con Apoyo', label: 'Estable con apoyo', dot: 'warning' },
  { value: 'Desregulación Frecuente', label: 'Desregulación frecuente', dot: 'danger' },
];

/* --- Resultado de la estrategia (resultado_estrategia) --- */
export const STRATEGY_OUTCOME_CHOICES: Choice<StrategyOutcome>[] = [
  { value: 'Regulación Exitosa', label: 'Se reguló', dot: 'success' },
  { value: 'Regulación Parcial', label: 'Se reguló en parte', dot: 'warning' },
  { value: 'Sin Regulación', label: 'No se reguló', dot: 'danger' },
];

/* --- Categorías del sheet de registro (FAB → sheet) --- */
export interface CategoryDef {
  id: LogCategory;
  name: string;
  desc: string;
  icon: string;
  /** Clase modificadora del design system: bl-cat--food | crisis | trans | sens */
  modifier: 'food' | 'crisis' | 'trans' | 'sens';
  semantic: Semantic;
  /** A qué `tipo_evento` del CSV resuelve la categoría. */
  eventType: EventType;
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'alimentacion',
    name: 'Alimentación',
    desc: 'Comidas, hidratación y colaciones',
    icon: '🍏',
    modifier: 'food',
    semantic: 'success',
    eventType: 'Alimentación',
  },
  {
    id: 'desregulacion',
    name: 'Desregulación',
    desc: 'Crisis, conductas y desbordes',
    icon: '⚡',
    modifier: 'crisis',
    semantic: 'danger',
    eventType: 'Desregulación Emocional',
  },
  {
    id: 'transicion',
    name: 'Transición',
    desc: 'Cambios de actividad o entorno',
    icon: '⇄',
    modifier: 'trans',
    semantic: 'warning',
    eventType: 'Transición de Actividad',
  },
  {
    id: 'sensorial',
    name: 'Dieta Sensorial',
    desc: 'Apoyos, estímulos y descompresión',
    icon: '🎧',
    modifier: 'sens',
    semantic: 'info',
    eventType: 'Dieta Sensorial',
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<LogCategory, CategoryDef>;

/* ============================================================
   Formularios por categoría
   ============================================================

   Cada categoría pregunta lo suyo. Desregulación es la única que necesita
   granularidad 1-10 (es la variable clínica del CSV); las demás se
   registran con una escala cualitativa de tres pasos, que es lo que el
   tutor puede responder de memoria a mitad del día.

   La escala cualitativa igual produce `intensity_band`, para no romper el
   contrato con `5_eventos_desregulacion_tutor.csv`. Ahí la banda no
   significa "intensidad de crisis" sino "dificultad del registro"; el
   literal que eligió la persona viaja aparte en `qualitative_outcome`.
   ============================================================ */

/** Campo select propio de una categoría. `key` decide a qué campo del evento va. */
export interface CategorySelect {
  key: 'support_used' | 'sensory_activity' | 'sensory_response';
  label: string;
  options: string[];
}

export interface CategoryForm {
  /** `null` → la categoría usa el slider 1-10 en vez de escala cualitativa. */
  scaleLegend: string | null;
  scale: Choice<string>[];
  /** Equivalente 1-10 de cada opción, para derivar `intensity_band`. */
  scaleIntensity: Record<string, number>;
  /** Texto bajo "Registro rápido". */
  quickHint: string;
  selects: CategorySelect[];
  /** Etiqueta del disclosure de detalle. */
  detailsLabel: string;
}

/** "¿Cómo respondió?" reusa `resultado_estrategia` con lenguaje sensorial. */
const SENSORY_RESPONSE_OPTIONS = ['Muy bien', 'Con altibajos', 'No le acomodó'];

export const SENSORY_RESPONSE_TO_OUTCOME: Record<string, StrategyOutcome> = {
  'Muy bien': 'Regulación Exitosa',
  'Con altibajos': 'Regulación Parcial',
  'No le acomodó': 'Sin Regulación',
};

export const CATEGORY_FORM: Record<LogCategory, CategoryForm> = {
  alimentacion: {
    scaleLegend: '¿Cómo fue la alimentación hoy?',
    scale: [
      { value: 'Adecuada', label: 'Adecuada', dot: 'success' },
      { value: 'Regular', label: 'Regular', dot: 'warning' },
      { value: 'Dificultosa', label: 'Dificultosa', dot: 'danger' },
    ],
    scaleIntensity: { Adecuada: 2, Regular: 5, Dificultosa: 8 },
    quickHint: 'Registra alimentación con la hora actual',
    selects: [],
    detailsLabel: '¿Deseas agregar más detalles? (opcional)',
  },

  desregulacion: {
    // Única categoría con slider: la intensidad es el dato clínico del CSV.
    scaleLegend: null,
    scale: [],
    scaleIntensity: {},
    quickHint: 'Guarda la intensidad con la hora actual',
    selects: [],
    detailsLabel: '¿Deseas agregar más detalles clínicos? (opcional)',
  },

  transicion: {
    scaleLegend: '¿Cómo resultó la transición?',
    scale: [
      { value: 'Fácil', label: 'Fácil', dot: 'success' },
      { value: 'Con ayuda', label: 'Con ayuda', dot: 'warning' },
      { value: 'Difícil', label: 'Difícil', dot: 'danger' },
    ],
    scaleIntensity: { 'Fácil': 2, 'Con ayuda': 5, 'Difícil': 8 },
    quickHint: 'Registra transición con la hora actual',
    selects: [
      {
        key: 'support_used',
        label: 'Apoyo utilizado',
        options: [
          'Ninguno',
          'Anticipación verbal',
          'Apoyo visual / pictogramas',
          'Objeto de transición',
          'Acompañamiento físico',
          'Tiempo extra',
        ],
      },
    ],
    detailsLabel: '¿Deseas agregar más detalles? (opcional)',
  },

  sensorial: {
    scaleLegend: '¿Se realizó la dieta sensorial?',
    scale: [
      { value: 'Completa', label: 'Completa', dot: 'success' },
      { value: 'Parcial', label: 'Parcial', dot: 'warning' },
      { value: 'No realizada', label: 'No realizada', dot: 'danger' },
    ],
    scaleIntensity: { Completa: 2, Parcial: 5, 'No realizada': 8 },
    quickHint: 'Registra dieta sensorial con la hora actual',
    selects: [
      {
        key: 'sensory_activity',
        label: 'Actividad realizada',
        options: [
          'Columpio',
          'Presión profunda',
          'Cepillado',
          'Chaleco o peso',
          'Balanceo',
          'Masticables',
          'Música o audífonos',
          'Otra',
        ],
      },
      {
        key: 'sensory_response',
        label: '¿Cómo respondió?',
        options: SENSORY_RESPONSE_OPTIONS,
      },
    ],
    detailsLabel: '¿Deseas agregar más detalles? (opcional)',
  },
};

/* --- Intensidad: el slider entrega 1..10, el CSV guarda la banda --- */
export function intensityBand(value: number): IntensityBand {
  if (value <= 3) return 'Leve (1-3)';
  if (value <= 7) return 'Moderada (4-7)';
  return 'Severa (8-10)';
}

/** Etiqueta corta para el badge. Nunca se muestra el número solo. */
export function intensityWord(value: number): string {
  if (value <= 3) return 'Leve';
  if (value <= 7) return 'Moderado';
  return 'Fuerte';
}

export function intensitySemantic(value: number): Semantic {
  if (value <= 3) return 'warning';
  if (value <= 7) return 'warning';
  return 'danger';
}

/* --- Riesgo y confianza (Prediction Contract v2) --- */
export const RISK_LABEL: Record<string, string> = {
  LOW: 'Riesgo bajo',
  MODERATE: 'Riesgo moderado',
  ELEVATED: 'Riesgo elevado',
};

export const RISK_SEMANTIC: Record<string, Semantic> = {
  LOW: 'success',
  MODERATE: 'warning',
  ELEVATED: 'danger',
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: 'Confianza alta',
  MEDIUM: 'Confianza media',
  LOW: 'Confianza baja',
  INSUFFICIENT: 'Información insuficiente',
};

export const CONFIDENCE_SEMANTIC: Record<string, Semantic> = {
  HIGH: 'success',
  MEDIUM: 'info',
  LOW: 'warning',
  INSUFFICIENT: 'neutral',
};

/* --- Formato de hora en es-CL: "2:50 p.m." --- */
export function formatTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('es-CL', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s?a\.?\s?m\.?/i, ' a.m.')
    .replace(/\s?p\.?\s?m\.?/i, ' p.m.');
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Fecha de hoy en zona local, como "2026-08-26".
 *
 * `new Date().toISOString().slice(0,10)` daría la fecha UTC, que en Chile
 * (UTC-4) es la de mañana a partir de las 20:00. El día del registro es
 * el día del tutor, no el de Greenwich.
 */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * "14:30" → ISO del día indicado, interpretado en hora local.
 *
 * Se construye desde las partes Y-M-D en vez de `new Date(dateIso)`: esa
 * forma parsea "2026-08-26" como medianoche UTC, así que en Chile el
 * evento caía el día anterior y desaparecía del historial de hoy.
 */
export function toIsoAt(dateIso: string, hhmm: string): string {
  const [y, mo, d] = dateIso.slice(0, 10).split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, 0, 0).toISOString();
}

/** ISO → "14:30" para `<input type="time">`. */
export function toHhMm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

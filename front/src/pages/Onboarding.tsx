/**
 * Crear perfil en 3 pasos (screens/Final-Perfil-1.html, -2.html, -3.html).
 *
 * 1. Sobre quien vas a acompañar: alias, edad, neurodivergencia, apoyo, comunicación.
 * 2. Cómo suelen ser sus crisis: frecuencia, señales tempranas, gatillantes, momentos.
 * 3. Lo que le ayuda: estrategias que funcionan y perfil sensorial.
 *
 * Todo es opcional salvo el alias. «Completar más tarde» crea el perfil con
 * lo que haya hasta ese momento; nada viene preseleccionado (P13).
 */

import { useEffect, useRef, useState } from 'react';
import { ChipGroup } from '../components/controls';
import { Icon } from '../components/icons';
import { SensoryMatrix } from '../components/SensoryMatrix';
import { PROFILE_STEP_1, PROFILE_STEP_2, PROFILE_SUPPORT_OPTIONS, type ProfileQuestion } from '../domain/catalog';
import { EMPTY_PROFILE, buildOnboardingInput, type ProfileAnswers } from '../domain/onboarding';
import type { SubjectOnboardingInput } from '../types';

const STEPS = [
  {
    title: 'Sobre quien vas a acompañar',
    copy: 'Datos básicos para personalizar los registros. Todo es opcional salvo el alias.',
  },
  {
    title: 'Cómo suelen ser sus crisis',
    copy: 'Con esto preparamos las preguntas diarias que más ayudan a anticipar.',
  },
  {
    title: 'Lo que le ayuda',
    copy: 'Estas respuestas alimentan «Qué puedo hacer ahora» desde el primer día.',
  },
];

interface Props {
  initialAlias?: string;
  onCancel: () => void;
  onCreate: (input: SubjectOnboardingInput) => Promise<void>;
}

export function Onboarding({ initialAlias = '', onCancel, onCreate }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ProfileAnswers>({ ...EMPTY_PROFILE, alias: initialAlias });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Al cambiar de paso, el lector de pantalla y la vista parten desde el título.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView?.({ block: 'start' });
  }, [step]);

  const hasAlias = answers.alias.trim().length > 0;
  const isLast = step === STEPS.length - 1;

  const setContext = (key: string, value: string | string[] | null) =>
    setAnswers((prev) => ({ ...prev, context: { ...prev.context, [key]: value } }));

  async function create() {
    if (!hasAlias) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate(buildOnboardingInput(answers, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'));
    } catch (reason) {
      const message = (reason as { message?: string })?.message;
      setError(message || 'No se pudo crear el perfil. Inténtalo otra vez.');
      setSaving(false);
    }
  }

  function next() {
    if (!hasAlias) return;
    if (isLast) void create();
    else setStep((value) => value + 1);
  }

  return (
    <div className="nd-onboarding">
      <div className="nd-onboarding__top">
        <button
          type="button"
          className="nd-roundbutton nd-press"
          aria-label={step === 0 ? 'Volver a la selección de infante' : 'Volver al paso anterior'}
          onClick={() => (step === 0 ? onCancel() : setStep((value) => value - 1))}
        >
          <Icon name="back" size={20} />
        </button>
        <div className="nd-onboarding__progress">
          <span className="nd-onboarding__step">
            Paso {step + 1} de {STEPS.length}
          </span>
          <div
            role="progressbar"
            aria-label="Progreso del perfil"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step + 1}
            className="nd-onboarding__bar"
          >
            {STEPS.map((_, i) => (
              <span key={i} className={i <= step ? 'is-done' : undefined} />
            ))}
          </div>
        </div>
      </div>

      <header className="nd-onboarding__header">
        <h1 ref={titleRef} tabIndex={-1}>
          {STEPS[step].title}
        </h1>
        <p>{STEPS[step].copy}</p>
      </header>

      {step === 0 && (
        <>
          <section className="nd-qcard" aria-labelledby="alias-titulo">
            <div className="nd-qcard__head">
              <h2 id="alias-titulo">Alias</h2>
              <p id="alias-ayuda">Usa un apodo o iniciales: NeuroDash no necesita el nombre real.</p>
            </div>
            <input
              type="text"
              className="nd-field"
              aria-labelledby="alias-titulo"
              aria-describedby="alias-ayuda"
              placeholder="Ej: Tomi, M.P."
              autoComplete="off"
              value={answers.alias}
              onChange={(e) => setAnswers((prev) => ({ ...prev, alias: e.target.value }))}
            />
          </section>
          <Questions questions={PROFILE_STEP_1} answers={answers} onChange={setContext} />
        </>
      )}

      {step === 1 && <Questions questions={PROFILE_STEP_2} answers={answers} onChange={setContext} />}

      {step === 2 && (
        <>
          <section className="nd-qcard">
            <ChipGroup
              mode="multiple"
              legendStyle="card"
              legend="Estímulos positivos y estrategias que funcionan"
              hint="Puedes marcar varios."
              options={PROFILE_SUPPORT_OPTIONS}
              value={answers.supports}
              onChange={(supports) => setAnswers((prev) => ({ ...prev, supports }))}
            />
          </section>
          <section className="nd-qcard" aria-labelledby="sensorial-titulo">
            <div className="nd-qcard__head">
              <h2 id="sensorial-titulo">Perfil sensorial</h2>
              <p>Cómo reacciona a cada tipo de estímulo. Si no estás seguro, déjalo sin marcar.</p>
            </div>
            <SensoryMatrix
              value={answers.sensory}
              onChange={(channel, level) =>
                setAnswers((prev) => ({ ...prev, sensory: { ...prev.sensory, [channel]: level } }))
              }
            />
          </section>
        </>
      )}

      <div className="nd-onboarding__footer">
        {error && (
          <p className="nd-onboarding__error" role="alert">
            {error}
          </p>
        )}
        {!hasAlias && (
          <p id="alias-falta" className="nd-onboarding__hint">
            {step === 0 ? 'Escribe un alias para continuar.' : 'Vuelve al paso 1 y escribe un alias.'}
          </p>
        )}
        <button
          type="button"
          className="nd-cta nd-press"
          disabled={!hasAlias || saving}
          aria-describedby={hasAlias ? undefined : 'alias-falta'}
          onClick={next}
        >
          {saving ? 'Creando perfil…' : isLast ? 'Crear perfil' : 'Continuar'}
        </button>
        <button
          type="button"
          className="nd-linkbutton nd-linkbutton--muted nd-press"
          disabled={!hasAlias || saving}
          onClick={() => void create()}
        >
          Completar más tarde
        </button>
      </div>
    </div>
  );
}

function Questions({
  questions,
  answers,
  onChange,
}: {
  questions: ProfileQuestion[];
  answers: ProfileAnswers;
  onChange: (key: string, value: string | string[] | null) => void;
}) {
  return (
    <>
      {questions.map((question) => (
        <section key={question.key} className="nd-qcard">
          {question.mode === 'single' ? (
            <ChipGroup
              mode="single"
              legendStyle="card"
              legend={question.title}
              hint={question.hint}
              options={question.options}
              value={(answers.context[question.key] as string | null) ?? null}
              onChange={(value) => onChange(question.key, value)}
            />
          ) : (
            <ChipGroup
              mode="multiple"
              legendStyle="card"
              legend={question.title}
              hint={question.hint}
              options={question.options}
              value={(answers.context[question.key] as string[] | undefined) ?? []}
              onChange={(value) => onChange(question.key, value)}
            />
          )}
        </section>
      ))}
    </>
  );
}

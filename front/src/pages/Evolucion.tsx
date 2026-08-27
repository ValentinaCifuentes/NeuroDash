/**
 * Evolución · superficie de NeuraDash CORE dentro de BLUBA.
 *
 * Renderiza el Prediction Contract v2 tal cual llega. El frontend no
 * calcula riesgo, no infiere confianza y no decide abstención: solo
 * presenta. Si el motor cambia de algoritmo, esta pantalla no se toca (D2).
 *
 * Reglas de producto que la UI debe sostener:
 *  · Riesgo y confianza son ejes separados (D4). ELEVATED + LOW no es
 *    contradicción: es patrón preocupante con poca evidencia.
 *  · `INSUFFICIENT` es un resultado válido, no un error. Se muestra como
 *    abstención con una petición concreta de datos.
 *  · Los apoyos vienen del historial, no del modelo, y se muestran
 *    separados de los factores de riesgo.
 *  · Nunca se afirma que una crisis ocurrirá.
 */

import { useEffect, useState } from "react";
import { getPrediction } from "../api";
import { Tabs } from "../components/controls";
import {
    CONFIDENCE_LABEL,
    CONFIDENCE_SEMANTIC,
    RISK_LABEL,
    RISK_SEMANTIC,
    SEMANTIC_BG,
    SEMANTIC_COLOR,
    formatDate,
} from "../domain/catalog";
import type { ApiError, Prediction, Subject } from "../types";
import { Seguimiento } from "./Seguimiento";

type TabId = "estimacion" | "seguimiento";

export function Evolucion({ subject, revision }: { subject: Subject; revision: number }) {
    const [tab, setTab] = useState<TabId>("estimacion");
    const [prediction, setPrediction] = useState<Prediction | null>(null);
    const [error, setError] = useState<ApiError | null>(null);

    useEffect(() => {
        let alive = true;
        setPrediction(null);
        setError(null);
        getPrediction({
            subject_id: subject.subject_id,
            as_of: new Date().toISOString(),
            horizon: "next_24h",
        })
            .then(p => alive && setPrediction(p))
            .catch((e: ApiError) => alive && setError(e));
        return () => {
            alive = false;
        };
    }, [subject.subject_id, revision]);

    return (
        <div className="app-shell__content">
            <section className="bl-card">
                <h1 className="bl-card__title">Evolución</h1>
                <p className="bl-card__sub">
                    Vista para tutor de <strong>{subject.display_name}</strong>: qué mirar, por qué y qué hacer ahora.
                </p>
                <div className="app-profile-line" aria-label="Perfil del consultante">
                    <span>{subject.age_range}</span>
                    <span>{subject.diagnosis}</span>
                    <span>{subject.sensory_profile}</span>
                </div>
            </section>

            {/* Dos ejes distintos: lo que viene y lo que ya pasó. */}
            <Tabs
                label="Vista de evolución"
                active={tab}
                onChange={setTab}
                tabs={[
                    { id: "estimacion", label: "Próximas 24 h", icon: "🔭" },
                    { id: "seguimiento", label: "Seguimiento", icon: "🗓️" },
                ]}
            />

            {tab === "seguimiento" && <Seguimiento subject={subject} revision={revision} />}

            {tab === "estimacion" && error && (
                <div className="bl-alert bl-alert--danger" role="alert">
                    <span aria-hidden="true">⚠️</span>
                    <span>{error.message}</span>
                </div>
            )}

            {tab === "estimacion" && !prediction && !error && (
                <section className="bl-card app-stack--tight" aria-busy="true">
                    <span className="bl-sr-only">Calculando la estimación</span>
                    <div className="bl-skeleton" style={{ width: "45%", height: 22 }} />
                    <div className="bl-skeleton" />
                    <div className="bl-skeleton" style={{ width: "70%" }} />
                </section>
            )}

            {tab === "estimacion" && prediction && (
                <>
                    {prediction.abstain ? (
                        <AbstentionCard prediction={prediction} />
                    ) : (
                        <RiskCard prediction={prediction} />
                    )}

                    {prediction.factors.length > 0 && <FactorList prediction={prediction} />}
                    {prediction.missing.length > 0 && <MissingDataCard prediction={prediction} />}
                    {prediction.support.length > 0 && <SupportCard prediction={prediction} />}

                    <ProvenanceNote prediction={prediction} />
                </>
            )}
        </div>
    );
}

/* ============================================================
   Riesgo + confianza
   ============================================================ */

function RiskCard({ prediction }: { prediction: Prediction }) {
    const semantic = RISK_SEMANTIC[prediction.risk_level];
    const confSemantic = CONFIDENCE_SEMANTIC[prediction.confidence_level];
    const score = scoreOutOf100(prediction.model_score);
    const primary = riskPrimaryText(prediction.risk_level);
    const next = riskNextStepText(prediction.risk_level, prediction.support.length > 0);

    return (
        <section className="bl-card app-risk-card">
            <div className="app-card-heading">
                <p className="bl-eyebrow" style={{ margin: 0 }}>Próximas 24 horas</p>
                <span className="bl-badge" style={{ background: SEMANTIC_BG[semantic], color: "var(--bl-text-body)" }}>
                    <span
                        className="bl-dot"
                        style={{ background: SEMANTIC_COLOR[semantic], width: 10, height: 10, flex: "0 0 10px" }}
                        aria-hidden="true"
                    />
                    {RISK_LABEL[prediction.risk_level]}
                </span>
            </div>

            <h2 className="app-answer-title">{primary}</h2>
            <p className="app-answer-copy">{next}</p>

            <div className="app-risk-meter" role="img" aria-label={`Índice demostrativo ${score} de 100`}>
                <div className="app-risk-meter__labels" aria-hidden="true">
                    <span>Bajo</span>
                    <span>Medio</span>
                    <span>Elevado</span>
                </div>
                <div className="app-risk-meter__track">
                    <span className="app-risk-meter__segment app-risk-meter__segment--low" />
                    <span className="app-risk-meter__segment app-risk-meter__segment--mid" />
                    <span className="app-risk-meter__segment app-risk-meter__segment--high" />
                    <span className="app-risk-meter__marker" style={{ left: `${score}%`, background: SEMANTIC_COLOR[semantic] }} />
                </div>
                <div className="app-risk-meter__foot">
                    <strong>Índice demostrativo {score} / 100</strong>
                    <span>No es probabilidad clínica</span>
                </div>
            </div>

            <div className="app-confidence-panel">
                <div>
                    <span className="app-mini-label">Confianza de la información</span>
                    <strong>{CONFIDENCE_LABEL[prediction.confidence_level]}</strong>
                </div>
                <span className="bl-badge" style={{ background: SEMANTIC_BG[confSemantic], color: "var(--bl-text-body)" }}>
                    Riesgo ≠ confianza
                </span>
            </div>

            <p className="app-fine-print">
                Estimación de apoyo. No afirma que una crisis vaya a ocurrir.
            </p>
        </section>
    );
}

function AbstentionCard({ prediction }: { prediction: Prediction }) {
    return (
        <section className="bl-card">
            <p className="bl-eyebrow" style={{ margin: 0 }}>
                <span aria-hidden="true">🔭</span> Próximas 24 horas
            </p>
            <h2
                style={{
                    margin: "var(--bl-sp-3) 0 var(--bl-sp-2)",
                    fontSize: "var(--bl-fs-h1)",
                    fontWeight: 800,
                    color: "var(--bl-text)",
                }}
            >
                Todavía no hay estimación
            </h2>
            <p style={{ margin: "0 0 var(--bl-sp-4)", color: "var(--bl-text-body)" }}>
                La información de hoy no alcanza para sostener una estimación. Preferimos decirlo antes que mostrar un
                número sin respaldo.
            </p>
            {prediction.priority_data_request && (
                <div className="bl-alert bl-alert--info">
                    <span aria-hidden="true">→</span>
                    <span>{prediction.priority_data_request}</span>
                </div>
            )}
        </section>
    );
}

/* ============================================================
   Factores · salida del Explanation Builder, ya en lenguaje humano
   ============================================================ */

function FactorList({ prediction }: { prediction: Prediction }) {
    const [showAll, setShowAll] = useState(false);
    const visibleFactors = showAll ? prediction.factors : prediction.factors.slice(0, 3);
    const hiddenCount = prediction.factors.length - visibleFactors.length;

    return (
        <section className="bl-card">
            <p className="bl-eyebrow" style={{ margin: "0 0 var(--bl-sp-2)" }}>Por qué aparece así</p>
            <h2 className="app-section-title">Señales más relevantes</h2>
            <p className="bl-card__sub" style={{ marginTop: 0 }}>
                Son asociaciones observadas en los datos recientes, no causas confirmadas.
            </p>
            <div>
                {visibleFactors.map(factor => (
                    <div key={factor.code + factor.window} className="app-factor">
                        <span className={`app-factor__dir app-factor__dir--${factor.direction}`} aria-hidden="true">
                            {factor.direction === "up" ? "↑" : "↓"}
                        </span>
                        <span>
                            <span className="app-factor__label">
                                {factor.label}
                                <span className="bl-sr-only">
                                    {factor.direction === "up" ? " · empuja hacia arriba" : " · empuja hacia abajo"}
                                </span>
                            </span>
                            <span className="app-factor__cmp">
                                {factor.comparison} · {displayWindow(factor.window)}
                            </span>
                        </span>
                    </div>
                ))}
            </div>
            {prediction.factors.length > 3 && (
                <button
                    type="button"
                    className="bl-btn bl-btn--ghost bl-btn--block"
                    aria-expanded={showAll}
                    onClick={() => setShowAll(value => !value)}
                    style={{ marginTop: "var(--bl-sp-3)" }}
                >
                    {showAll ? "Mostrar menos" : `Mostrar más (${hiddenCount})`}
                </button>
            )}
        </section>
    );
}

/* ============================================================
   Datos faltantes · la ausencia es señal, no ruido
   ============================================================ */

function MissingDataCard({ prediction }: { prediction: Prediction }) {
    return (
        <section className="bl-card">
            <p className="bl-eyebrow" style={{ margin: "0 0 var(--bl-sp-2)" }}>Datos que faltan</p>
            <h2 className="app-section-title">Esto puede bajar la confianza</h2>
            <div className="app-stack--tight" style={{ display: "flex", flexDirection: "column" }}>
                {prediction.missing.map(item => (
                    <div key={item.code} className="bl-alert bl-alert--warning">
                        <span aria-hidden="true">◌</span>
                        <span>
                            <b>{item.label}.</b> {item.impact}
                        </span>
                    </div>
                ))}
            </div>
            {prediction.priority_data_request && (
                <p style={{ margin: "var(--bl-sp-4) 0 0", fontSize: "var(--bl-fs-sm)" }}>
                    {prediction.priority_data_request}
                </p>
            )}
        </section>
    );
}

/* ============================================================
   Apoyos · vienen del historial, nunca del modelo
   ============================================================ */

function SupportCard({ prediction }: { prediction: Prediction }) {
    return (
        <section className="bl-card">
            <p className="bl-eyebrow" style={{ margin: "0 0 var(--bl-sp-2)" }}>Qué puedo hacer ahora</p>
            <h2 className="app-section-title">Apoyos registrados previamente</h2>
            <p className="bl-card__sub" style={{ marginTop: 0 }}>
                Se muestran desde el historial o catálogo validado; no son una orden automática.
            </p>
            <div>
                {prediction.support.map(item => (
                    <div key={item.support_id} className="app-factor">
                        <span className="app-factor__dir" aria-hidden="true">
                            •
                        </span>
                        <span>
                            <span className="app-factor__label">{item.label}</span>
                            {item.detail && <span className="app-factor__cmp">{item.detail}</span>}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function scoreOutOf100(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score * 100)));
}

function riskPrimaryText(level: Prediction["risk_level"]): string {
    if (level === "ELEVATED") return "Conviene prestar atención hoy";
    if (level === "MODERATE") return "Hay algunas señales para observar";
    return "No aparecen señales de alerta fuertes";
}

function riskNextStepText(level: Prediction["risk_level"], hasSupport: boolean): string {
    if (level === "ELEVATED") {
        return hasSupport
            ? "Revisa los apoyos sugeridos y registra cualquier episodio relevante para sostener el seguimiento."
            : "Observa de cerca el día y registra cambios importantes para mejorar la lectura de mañana.";
    }
    if (level === "MODERATE") {
        return "Mantén las rutinas de apoyo y completa los datos pendientes si aparecen cambios durante el día.";
    }
    return "Continúa registrando el estado basal y los eventos si ocurren; los días tranquilos también ayudan.";
}

function displayWindow(window: string): string {
    if (window === "actual") return "dato actual";
    if (window.endsWith("d")) return `últimos ${window}`;
    return `ventana ${window}`;
}

/* ============================================================
   Procedencia de datos · transparencia obligatoria en demo
   ============================================================ */

function ProvenanceNote({ prediction }: { prediction: Prediction }) {
    const { data_provenance: prov, technical_metadata: tech } = prediction;
    return (
        <section className="bl-card" style={{ background: "var(--bl-surface-alt)" }}>
            <p className="bl-eyebrow" style={{ margin: "0 0 var(--bl-sp-2)" }}>
                <span aria-hidden="true">🔎</span> Procedencia
            </p>
            <p style={{ margin: 0, fontSize: "var(--bl-fs-sm)", color: "var(--bl-text-body)" }}>
                {prov.contains_synthetic_data
                    ? "Esta estimación usa datos sintéticos junto a datos reales de BLUBA."
                    : "Esta estimación usa únicamente datos reales de BLUBA."}
            </p>
            <p style={{ margin: "var(--bl-sp-2) 0 0", fontSize: "var(--bl-fs-xs)", color: "var(--bl-text-muted)" }}>
                Origen: {prov.origins.join(", ")} · motor: {tech.engine} · explicador: {tech.explainer ?? "no aplica"} ·
                corte: {formatDate(prediction.as_of)}
            </p>
        </section>
    );
}

/**
 * Evolución · superficie de NeuroDash CORE (screens/Final-Evolucion.html).
 *
 * Renderiza el Prediction Contract v2 tal cual llega. El frontend no calcula
 * riesgo, no infiere confianza y no decide abstención: solo presenta (D2).
 *
 * Orden: pestañas → tarjeta de estimación (con «Confirmar que ocurrió» dentro)
 * → filas hacia «Por qué aparece así» y «Puede mejorar la lectura» → «Qué puedo
 * hacer ahora», completo. Sin estimación: medidor punteado y solo la fila de datos.
 */

import { useEffect, useRef, useState } from "react";
import { confirmPredictionOutcome, getPrediction } from "../api";
import { ConfidenceChip, RiskBadge } from "../components/badges";
import { SegmentedTabs } from "../components/controls";
import { Icon } from "../components/icons";
import { NavList, NavRow } from "../components/NavRow";
import { RiskGauge, type RiskLevel } from "../components/RiskGauge";
import { CONFIDENCE_LABEL } from "../domain/catalog";
import { FactorsSheet, MissingDataSheet, highlightedFactors } from "../sheets/EstimationSheets";
import type { ApiError, Prediction, Subject } from "../types";
import { Seguimiento } from "./Seguimiento";

export type TabId = "estimacion" | "seguimiento";
type SheetId = "factors" | "missing" | null;

interface Props {
    subject: Subject;
    revision: number;
    /** «Puede mejorar la lectura» lleva a la Bitácora para completar el dato. */
    onOpenBitacora?: () => void;
    /** Vista activa; es una ruta de App (`#evolucion` / `#seguimiento`). */
    view?: TabId;
    onChangeView?: (view: TabId) => void;
}

export function Evolucion({ subject, revision, onOpenBitacora, view, onChangeView }: Props) {
    // Controlada por App; sin `view` (pruebas aisladas) guarda su propio estado.
    const [ownTab, setOwnTab] = useState<TabId>("estimacion");
    const tab = view ?? ownTab;
    const setTab = onChangeView ?? setOwnTab;
    const [prediction, setPrediction] = useState<Prediction | null>(null);
    const [error, setError] = useState<ApiError | null>(null);
    const [retryNonce, setRetryNonce] = useState(0);
    const retryRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        let alive = true;
        setPrediction(null);
        setError(null);
        getPrediction({
            subject_id: subject.subject_id,
            prediction_cutoff: new Date().toISOString(),
        })
            .then(p => alive && setPrediction(p))
            .catch((e: ApiError) => alive && setError(e));
        return () => {
            alive = false;
        };
    }, [subject.subject_id, revision, retryNonce]);

    useEffect(() => {
        if (error) retryRef.current?.focus();
    }, [error]);

    return (
        <div className="nd-screen">
            {/* Dos ejes distintos: lo que viene y lo que ya pasó. */}
            <SegmentedTabs
                label="Vista de evolución"
                active={tab}
                onChange={setTab}
                tabs={[
                    // El horizonte sale del contrato; antes de tenerlo no se inventa un número.
                    { id: "estimacion", label: prediction ? `Próximas ${prediction.horizon_hours} h` : "Próximas horas" },
                    { id: "seguimiento", label: "Seguimiento" },
                ]}
            />

            {tab === "seguimiento" && <Seguimiento subject={subject} revision={revision} />}

            {tab === "estimacion" && error && (
                <div className="nd-alert" role="alert">
                    <Icon name="alert" size={18} />
                    <span>{error.message}</span>
                    <button ref={retryRef} type="button" className="nd-button-outline nd-press" onClick={() => setRetryNonce(value => value + 1)}>
                        Reintentar estimación
                    </button>
                </div>
            )}

            {tab === "estimacion" && !prediction && !error && (
                <section className="nd-card nd-card--hero" aria-busy="true">
                    <span className="nd-sr-only">Calculando la estimación</span>
                    <div className="nd-skeleton" style={{ width: "45%", height: 22 }} />
                    <div className="nd-skeleton" />
                    <div className="nd-skeleton" style={{ width: "70%" }} />
                </section>
            )}

            {tab === "estimacion" && prediction && (
                <Estimation prediction={prediction} onOpenBitacora={onOpenBitacora} />
            )}
        </div>
    );
}

function Estimation({ prediction, onOpenBitacora }: { prediction: Prediction; onOpenBitacora?: () => void }) {
    const [sheet, setSheet] = useState<SheetId>(null);
    const [showAllFactors, setShowAllFactors] = useState(false);
    const factorsRow = useRef<HTMLButtonElement>(null);
    const missingRow = useRef<HTMLButtonElement>(null);
    const coreMissing = prediction.missingness.filter(item => item.is_core).length;
    // La fila resume la señal más clara (P29), no la variable técnica de más peso.
    const lead = highlightedFactors(prediction.factors)[0] ?? prediction.factors[0];
    // Sin estimación solo quedan los apoyos que el tutor registró (P23); el aviso de
    // «falta información» ya lo dicen la tarjeta y «Puede mejorar la lectura».
    const ownSupports = prediction.supports.filter(item => item.source === "historical_support");

    return (
        <>
            {prediction.abstained ? <AbstentionCard prediction={prediction} /> : <RiskCard prediction={prediction} />}

            <NavList label="Detalle de la estimación">
                {!prediction.abstained && lead && (
                        <NavRow
                            ref={factorsRow}
                            icon={lead.direction === "up" ? "arrowUp" : "arrowDown"}
                            tone="risk"
                            title="Por qué aparece así"
                            summary={lead.summary ?? lead.label}
                            onClick={() => setSheet("factors")}
                        />
                )}
                    <NavRow
                        ref={missingRow}
                        icon="plus"
                        tone="missing"
                        title="Puede mejorar la lectura"
                        summary={missingSummary(prediction.missingness.length, coreMissing, prediction.abstained)}
                        onClick={() => setSheet("missing")}
                    />
            </NavList>

            {!prediction.abstained && prediction.supports.length > 0 && <Supports supports={prediction.supports} />}
            {prediction.abstained && ownSupports.length > 0 && (
                <Supports
                    supports={ownSupports}
                    title="Lo que le ayuda"
                    intro="Lo que registraste que le sirve. Con más días de registro se podrá sugerir según el momento."
                />
            )}

            {sheet === "factors" && (
                <FactorsSheet
                    prediction={prediction}
                    showAll={showAllFactors}
                    onShowAll={() => setShowAllFactors(true)}
                    onClose={() => setSheet(null)}
                    returnFocusTo={factorsRow}
                />
            )}
            {sheet === "missing" && (
                <MissingDataSheet
                    prediction={prediction}
                    onClose={() => setSheet(null)}
                    onOpenBitacora={() => {
                        setSheet(null);
                        onOpenBitacora?.();
                    }}
                    returnFocusTo={missingRow}
                />
            )}
        </>
    );
}

function missingSummary(total: number, core: number, abstained: boolean): string {
    if (total === 0) return abstained ? "Hacen falta más días de registro" : "Con los datos registrados alcanza";
    if (core > 0) return core === 1 ? "Falta 1 dato que cuenta para la confianza" : `Faltan ${core} datos que cuentan para la confianza`;
    return total === 1 ? "Falta 1 dato opcional" : `Faltan ${total} datos opcionales`;
}

/* ============================================================
   Tarjeta de estimación: riesgo + confianza, ejes separados
   ============================================================ */

function RiskCard({ prediction }: { prediction: Prediction }) {
    const [confirmed, setConfirmed] = useState(false);
    const level = (prediction.risk ?? "LOW") as RiskLevel;

    return (
        <section className="nd-card nd-card--hero nd-estimate" aria-labelledby="estimacion-titulo">
            <div className="nd-estimate__head">
                <span className="nd-eyebrow nd-eyebrow--flat">{horizonEyebrow(prediction)}</span>
                <RiskBadge risk={level} />
            </div>
            <RiskGauge risk={level} confidenceLabel={CONFIDENCE_LABEL[prediction.confidence]} />
            <h2 id="estimacion-titulo" className="nd-estimate__title">{riskPrimaryText(level)}</h2>
            <p className="nd-estimate__copy">{riskNextStepText(level, prediction.supports.length > 0)}</p>
            <ConfidenceChip level={prediction.confidence} />
            {confirmed ? (
                <p className="nd-estimate__confirmed" role="status">
                    <Icon name="check" size={16} strokeWidth={2.6} /> Resultado confirmado
                </p>
            ) : (
                <button
                    type="button"
                    className="nd-button-outline nd-press"
                    onClick={async () => {
                        await confirmPredictionOutcome(prediction.prediction_id, true, crypto.randomUUID());
                        setConfirmed(true);
                    }}
                >
                    Confirmar que ocurrió
                </button>
            )}
        </section>
    );
}

function AbstentionCard({ prediction }: { prediction: Prediction }) {
    return (
        <section className="nd-card nd-card--hero nd-estimate" aria-labelledby="abstencion-titulo">
            <div className="nd-estimate__head">
                <span className="nd-eyebrow nd-eyebrow--flat">{horizonEyebrow(prediction)}</span>
                <ConfidenceChip level="INSUFFICIENT" />
            </div>
            <RiskGauge risk={null} abstained />
            <h2 id="abstencion-titulo" className="nd-estimate__title">Todavía no hay estimación</h2>
            <p className="nd-estimate__copy">
                La información de hoy no alcanza para sostener una estimación. Preferimos decirlo antes que mostrar un
                número sin respaldo.
            </p>
        </section>
    );
}

/** «Próximas 8 horas»: el horizonte sale del contrato, nunca se escribe a mano. */
function horizonEyebrow(prediction: Prediction): string {
    return `Próximas ${prediction.horizon_hours} horas`;
}

/* ============================================================
   Qué puedo hacer ahora: completo, sin colapsar
   ============================================================ */

function Supports({
    supports,
    title = "Apoyos disponibles",
    intro,
}: {
    supports: Prediction["supports"];
    title?: string;
    intro?: string;
}) {
    return (
        <section className="nd-supports" aria-labelledby="apoyos-titulo">
            <span className="nd-supports__eyebrow">Qué puedo hacer ahora</span>
            <h2 id="apoyos-titulo" className="nd-supports__title">{title}</h2>
            {intro && <p className="nd-supports__intro">{intro}</p>}
            {supports.map(item => (
                <div key={item.support_id} className="nd-support">
                    <span className="nd-support__icon" aria-hidden="true">
                        <Icon name="shield" size={18} />
                    </span>
                    <span className="nd-support__text">
                        <span className="nd-support__label">{item.label}</span>
                        {item.detail && <span className="nd-support__detail">{item.detail}</span>}
                    </span>
                </div>
            ))}
        </section>
    );
}

function riskPrimaryText(level: string): string {
    if (level === "ELEVATED") return "Conviene prestar atención hoy";
    if (level === "MODERATE") return "Hay algunas señales para observar";
    return "No aparecen señales de alerta fuertes";
}

function riskNextStepText(level: string, hasSupport: boolean): string {
    if (level === "ELEVATED") {
        return hasSupport
            ? "Revisa los apoyos disponibles y mantén el registro si aparece algún cambio durante el día."
            : "Mantén el registro habitual y observa si aparecen cambios durante el día.";
    }
    if (level === "MODERATE") {
        return "Mantén las rutinas de apoyo y completa el registro si aparece algún cambio durante el día.";
    }
    return "Por ahora no aparecen señales fuertes. Mantén el registro habitual.";
}

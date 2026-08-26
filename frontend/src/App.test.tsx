import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import App from "./App";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("Caregiver Experience (App.tsx)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should show onboarding profile-first selection initially", async () => {
    render(<App />);

    // Caregivers should be asked to select or enter a subject profile first
    expect(screen.getByText(/Selecciona o ingresa un perfil/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /PAC-A/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /PAC-B/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /PAC-C/i })).toBeDefined();
    
    // Custom ID input field should be present
    expect(screen.getByLabelText(/Ingresa un ID de sujeto personalizado/i)).toBeDefined();
  });

  it("renders safe results separately labeling risk and confidence, factors, provenance, and supports", async () => {
    // Mock subject profile and prediction responses
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subject_id: "PAC-A",
          timezone: "America/New_York",
          sensory_context: { preference: "quiet" },
          habitual_context: { sleep: "regular" },
          historical_supports: [{ id: "sup_1", name: "Scheduled downtime" }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          contract_version: "2",
          subject_id: "PAC-A",
          prediction_cutoff: "2026-08-26T12:00:00Z",
          horizon_hours: 24,
          risk: "ELEVATED",
          model_score: 0.76, // Technical score in contract
          confidence: "HIGH",
          abstained: false,
          factors: [
            { factor_name: "Sleep duration change", description: "Shorter sleep duration observed over prior 3 days" },
            { factor_name: "Sensory environment noise", description: "Increased ambient decibel readings" }
          ],
          missingness: [],
          supports: [
            { support_name: "Visual Schedule", evidence_bounded: true, description: "Structured visual representation of daily flow" }
          ],
          provenance: {
            features_calculated: 4,
            records_evaluated: 25,
            baseline_window_days: 14
          },
          versions: { engine: "1.0.0", model: "PAC-A-v1" }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            source_timestamp: "2026-08-26T11:00:00Z",
            availability_timestamp: "2026-08-26T11:30:00Z",
            record_type: "sensory",
            value: 45
          }
        ]
      });

    render(<App />);

    // Click PAC-A button to onboard
    const pacAButton = screen.getByRole("button", { name: /PAC-A/i });
    fireEvent.click(pacAButton);

    // Wait for the risk dashboard to load
    await waitFor(() => {
      expect(screen.getByText(/Nivel de riesgo/i)).toBeDefined();
    });

    // Check risk level is separately labeled and visible
    expect(screen.getByText(/ELEVADO/i)).toBeDefined();

    // Check confidence is separately badge-labeled
    expect(screen.getByText(/Confianza: ALTO/i)).toBeDefined();

    // Check non-causal factors are shown
    expect(screen.getByText(/Cambio en la duracion del sueno/i)).toBeDefined();
    expect(screen.getByText(/tres dias previos/i)).toBeDefined();

    // Check supports are shown
    expect(screen.getByText(/Horario visual/i)).toBeDefined();

    // Check data provenance details are shown
    expect(screen.getByText(/Registros evaluados:/i)).toBeDefined();
    expect(screen.getByText("25")).toBeDefined();
    expect(screen.getByText(/Ventana base:/i)).toBeDefined();
    expect(screen.getByText(/catorce dias/i)).toBeDefined();
  });

  it("guarantees model_score, algorithms, clinical diagnoses, and causal claims are absent from UI", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subject_id: "PAC-B",
          timezone: "America/New_York",
          sensory_context: {},
          habitual_context: {},
          historical_supports: []
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          contract_version: "2",
          subject_id: "PAC-B",
          prediction_cutoff: "2026-08-26T12:00:00Z",
          horizon_hours: 24,
          risk: "STANDARD",
          model_score: 0.22,
          confidence: "MEDIUM",
          abstained: false,
          factors: [{ factor_name: "Ambient lighting change", description: "Reduced brightness" }],
          missingness: [],
          supports: [],
          provenance: { records_evaluated: 12 },
          versions: { engine: "1.0.0", model: "PAC-B-v1" }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

    render(<App />);

    const pacBButton = screen.getByRole("button", { name: /PAC-B/i });
    fireEvent.click(pacBButton);

    await waitFor(() => {
      expect(screen.getByText("ESTANDAR")).toBeDefined();
    });

    // Check that technical model score is NOT exposed to caregiver
    expect(screen.queryByText(/0.22/)).toBeNull();
    expect(screen.queryByText(/model_score/i)).toBeNull();
    
    // Check that specific algorithms (like logistic regression) are not visible
    expect(screen.queryByText(/logistic regression/i)).toBeNull();
    expect(screen.queryByText(/regression/i)).toBeNull();

    // Check that clinical/causal terms like "diagnose", "diagnoses", "cause", "causal", "triggers" are absent
    const htmlContent = document.body.innerHTML;
    expect(htmlContent).not.toMatch(/cause/i);
    expect(htmlContent).not.toMatch(/causal/i);
    expect(htmlContent).not.toMatch(/diagnos/i);
    expect(htmlContent).not.toMatch(/trigger/i);
  });

  it("handles empty / abstained prediction state with accessible warning and instructions", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subject_id: "PAC-C",
          timezone: "America/New_York",
          sensory_context: {},
          habitual_context: {},
          historical_supports: []
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          contract_version: "2",
          subject_id: "PAC-C",
          prediction_cutoff: "2026-08-26T12:00:00Z",
          horizon_hours: 24,
          risk: null,
          model_score: null,
          confidence: "INSUFFICIENT",
          abstained: true,
          factors: [],
          missingness: [{ field: "sleep_hours", message: "Missing sleep data for prior 3 nights" }],
          supports: [],
          provenance: { records_evaluated: 2 },
          versions: { engine: "1.0.0", model: "PAC-C-v1" }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

    render(<App />);

    const pacCButton = screen.getByRole("button", { name: /PAC-C/i });
    fireEvent.click(pacCButton);

    await waitFor(() => {
      expect(screen.getByText(/Prediccion omitida/i)).toBeDefined();
    });

    // Check for informative, accessible warning about missing data
    expect(screen.getByText(/Prediccion omitida/i)).toBeDefined();
    expect(screen.getByText(/Faltan datos de sueno/i)).toBeDefined();
    
    // Check that it renders an instruction or priority request to provide the missing data
    expect(screen.getByText(/Proporciona registros diarios adicionales/i)).toBeDefined();
  });

  it("satisfies accessibility: has clear landmarks, labels, and role semantics", async () => {
    render(<App />);
    
    // Check that we have a main landmark
    expect(screen.getByRole("main")).toBeDefined();
    
    // Check that inputs have accessible descriptions
    const input = screen.getByLabelText(/Ingresa un ID de sujeto personalizado/i);
    expect(input.id).toBeTruthy();
  });
});

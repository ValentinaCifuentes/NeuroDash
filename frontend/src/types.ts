export type ConfidenceLevel = "INSUFFICIENT" | "LOW" | "MEDIUM" | "HIGH"

export interface PredictionContractV2 {
  contract_version: "2"
  subject_id: string
  prediction_cutoff: string
  horizon_hours: number
  risk: string | null
  model_score: number | null
  confidence: ConfidenceLevel
  abstained: boolean
  factors: Record<string, unknown>[]
  missingness: Record<string, unknown>[]
  supports: Record<string, unknown>[]
  provenance: Record<string, unknown>
  versions: Record<string, string>
}

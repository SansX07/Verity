// Verity — API Client
// ======================
// Thin typed wrapper around the backend. Base URL assumes the backend runs
// on localhost:8000 (see backend/README.md) — change API_BASE if you're
// running it elsewhere.

const API_BASE = "http://localhost:8000/api";

export interface BatchListItem {
  batch_id: string;
  batch_name: string;
  status: string;
  created_at: string | null;
  total_records: number | null;
  match_rate: number | null;
  exceptions_count: number | null;
  resolved_count: number | null;
}

export interface BatchStatus {
  batch_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress_pct: number;
  records_processed: number;
  records_total: number;
}

export interface BatchSummary {
  batch_id: string;
  total_records: number;
  matched: number;
  match_rate: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  pair_precision?: number | null;
  pair_recall?: number | null;
  pair_f1?: number | null;
  settlement_rows: number;
  ledger_rows: number;
  candidate_pairs: number;
  structural_exceptions: number;
  exceptions_by_category: Record<string, number>;
}

export interface FinanceController {
  batch_id: string; total_records: number; auto_reconciled: number; auto_reconciliation_rate: number;
  exceptions_open: number; exceptions_total: number; review_exposure: number;
  highest_risk_category: string | null; high_value_exceptions: number; recommendation: string; priorities: string[];
}

export interface ExceptionDetails {
  settlement_payment_id?: string | null;
  ledger_payment_id?: string | null;
  settlement_order_id?: string | null;
  ledger_order_id?: string | null;
  ledger_amount: number | null;
  settlement_amount: number | null;
  diff: number | null;
  date_diff_days?: number | null;
  id_similarity?: number | null;
  second_best_id_similarity?: number | null;
  id_similarity_margin?: number | null;
  match_type?: string | null;
  competing_candidates_count?: number | null;
  closest_competing_amount_diff_pct?: number | null;
}

export interface ExceptionItem {
  exception_id: string;
  category: string;
  payment_id: string | null;
  order_id: string | null;
  confidence_score: number | null;
  detection_method: "model" | "deterministic";
  details: ExceptionDetails;
  explanation: string;
  status: "open" | "resolved" | "escalated";
}

export interface CalibrationRound {
  round: number;
  calibration_error: number;
  auto_resolution_coverage: number;
  bins_with_enough_evidence?: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* response wasn't JSON, keep statusText */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

export const api = {
  listBatches: () => request<{ batches: BatchListItem[] }>("/batches"),

  uploadBatch: (settlement: File, ledger: File, batchName: string, groundTruth?: File) => {
    const form = new FormData();
    form.append("settlement_file", settlement);
    form.append("ledger_file", ledger);
    form.append("batch_name", batchName);
    if (groundTruth) form.append("ground_truth_file", groundTruth);
    return request<{ batch_id: string; status: string }>("/batch/upload", {
      method: "POST",
      body: form,
    });
  },

  getBatchStatus: (batchId: string) => request<BatchStatus>(`/batch/${batchId}/status`),

  getBatchSummary: (batchId: string) => request<BatchSummary>(`/batch/${batchId}/summary`),

  getBatchExceptions: (batchId: string) =>
    request<{ exceptions: ExceptionItem[] }>(`/batch/${batchId}/exceptions`),

  getFinanceController: (batchId: string) => request<FinanceController>(`/batch/${batchId}/finance-controller`),

  resolveException: (exceptionId: string, resolution: "confirmed_match" | "confirmed_no_match", note?: string) =>
    request<{ exception_id: string; status: string }>(`/exceptions/${exceptionId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution, note }),
    }),

  askVerity: (batchId: string, question: string) =>
    request<{ answer: string; referenced_exception_ids: string[] }>("/qa/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId, question }),
    }),

  getCalibration: (batchId: string) =>
    request<{ rounds: CalibrationRound[] }>(`/batch/${batchId}/calibration`),
};

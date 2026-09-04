"""
Verity — API Schemas
======================
Pydantic models mirroring docs/exception_taxonomy_and_api_contract.md exactly.
Field names here are load-bearing: the frontend was built against these
exact shapes, so changing a field name here breaks the integration silently.
"""

from typing import Dict, List, Optional

from pydantic import BaseModel


class BatchUploadResponse(BaseModel):
    batch_id: str
    status: str  # "processing"


class BatchStatusResponse(BaseModel):
    batch_id: str
    status: str  # "queued" | "processing" | "completed" | "failed"
    progress_pct: int
    records_processed: int
    records_total: int


class BatchSummaryResponse(BaseModel):
    batch_id: str
    total_records: int
    matched: int
    match_rate: float
    precision: Optional[float] = None  # end-to-end metrics; only available with ground truth
    recall: Optional[float] = None
    f1: Optional[float] = None
    pair_precision: Optional[float] = None
    pair_recall: Optional[float] = None
    pair_f1: Optional[float] = None
    settlement_rows: int = 0
    ledger_rows: int = 0
    candidate_pairs: int = 0
    structural_exceptions: int = 0
    exceptions_by_category: Dict[str, int]


class ExceptionDetails(BaseModel):
    # Keep both sides separate. Never mirror one ID into both columns in the UI.
    settlement_payment_id: Optional[str] = None
    ledger_payment_id: Optional[str] = None
    settlement_order_id: Optional[str] = None
    ledger_order_id: Optional[str] = None
    ledger_amount: Optional[float] = None
    settlement_amount: Optional[float] = None
    diff: Optional[float] = None
    date_diff_days: Optional[float] = None
    id_similarity: Optional[float] = None
    second_best_id_similarity: Optional[float] = None
    id_similarity_margin: Optional[float] = None
    match_type: Optional[str] = None
    competing_candidates_count: Optional[int] = None
    closest_competing_amount_diff_pct: Optional[float] = None


class ExceptionItem(BaseModel):
    exception_id: str
    category: str
    payment_id: Optional[str] = None
    order_id: Optional[str] = None
    # ML confidence is meaningful only for model-classified candidate pairs.
    confidence_score: Optional[float] = None
    detection_method: str = "model"  # "model" | "deterministic"
    details: ExceptionDetails
    explanation: str
    status: str  # "open" | "resolved" | "escalated"


class ExceptionsListResponse(BaseModel):
    exceptions: List[ExceptionItem]


class FinanceControllerResponse(BaseModel):
    batch_id: str
    total_records: int
    auto_reconciled: int
    auto_reconciliation_rate: float
    exceptions_open: int
    exceptions_total: int
    review_exposure: float
    highest_risk_category: Optional[str] = None
    high_value_exceptions: int
    recommendation: str
    priorities: List[str]


class ResolveRequest(BaseModel):
    resolution: str  # "confirmed_match" | "confirmed_no_match"
    note: Optional[str] = None


class ResolveResponse(BaseModel):
    exception_id: str
    status: str


class QARequest(BaseModel):
    batch_id: str
    question: str


class QAResponse(BaseModel):
    answer: str
    referenced_exception_ids: List[str]


class BatchListItem(BaseModel):
    batch_id: str
    batch_name: str
    status: str
    created_at: Optional[str] = None
    total_records: Optional[int] = None
    match_rate: Optional[float] = None
    exceptions_count: Optional[int] = None
    resolved_count: Optional[int] = None


class BatchListResponse(BaseModel):
    batches: List[BatchListItem]


class CalibrationRound(BaseModel):
    round: int
    calibration_error: float
    auto_resolution_coverage: float
    bins_with_enough_evidence: int = 0


class CalibrationResponse(BaseModel):
    rounds: List[CalibrationRound]

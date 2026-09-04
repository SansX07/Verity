"""
Verity — API Server
=====================
Implements the API contract in docs/exception_taxonomy_and_api_contract.md.

Day 4 scope: /batch/upload, /batch/{id}/status, /batch/{id}/summary,
/batch/{id}/exceptions. Day 5 adds /exceptions/{id}/resolve, /qa/ask,
/batch/{id}/calibration on top of this same app.

Run with:
    uvicorn main:app --reload --port 8000
"""

import os
import shutil
import pandas as pd
import sys
from datetime import datetime

from dotenv import load_dotenv

load_dotenv()  # reads backend/.env if present — must happen before agent/gemini_agent look up keys

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.dirname(__file__))
import agent
import calibration
import gemini_agent
import local_qa_fallback
import pipeline
import storage
from schemas import (BatchListResponse, BatchStatusResponse,
                      BatchSummaryResponse, BatchUploadResponse,
                      CalibrationResponse, ExceptionsListResponse, FinanceControllerResponse, QARequest,
                      QAResponse, ResolveRequest, ResolveResponse)

app = FastAPI(title="Verity API", version="0.1.0")

# Hackathon-scope CORS: wide open so the Figma/Antigravity frontend (running
# on its own dev port) can call this without per-origin config churn.
# Tighten to explicit origins before anything resembling production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    model_kind = pipeline.load_models()
    print(f"Verity API started — serving model: {model_kind}")
    _log_qa_provider_status()


def _log_qa_provider_status():
    """Live-checks whichever Ask Verity provider will actually be used, so
    you find out at `uvicorn` startup — not mid-demo — if a key is missing,
    malformed, or rejected. Mirrors the same priority order as /api/qa/ask
    (Gemini, then Claude, then local fallback) and makes one real,
    near-free API call to confirm the key is actually live, not just
    present. Never raises — a broken key here should degrade to the local
    fallback at request time, not crash the server."""
    gemini_key = os.environ.get("GEMINI_API_KEY")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")

    if gemini_key:
        try:
            client = gemini_agent._get_client()
            client.models.generate_content(model=gemini_agent.GEMINI_MODEL, contents="ping")
            print(f"Ask Verity: GEMINI_API_KEY present and verified live — using Gemini ({gemini_agent.GEMINI_MODEL}).")
            return
        except Exception as e:
            print(f"Ask Verity: GEMINI_API_KEY is set but the live check failed ({type(e).__name__}: {e}). "
                  f"Falling through to the next provider — Ask Verity will still work, just via a different path.")

    if anthropic_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=anthropic_key)
            client.messages.create(model="claude-3-5-haiku-20241022", max_tokens=5,
                                    messages=[{"role": "user", "content": "ping"}])
            print("Ask Verity: ANTHROPIC_API_KEY present and verified live — using Claude.")
            return
        except Exception as e:
            print(f"Ask Verity: ANTHROPIC_API_KEY is set but the live check failed ({type(e).__name__}: {e}). "
                  f"Falling through to the local rule-based fallback.")

    print("Ask Verity: no verified AI provider — using the local rule-based fallback. "
          "This still answers correctly from real batch data, just with less natural phrasing.")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/batches", response_model=BatchListResponse)
def list_batches():
    """Not in the original API contract doc — added during frontend
    integration because OverviewPage needs real batch history to show,
    and the file-based storage already has everything needed to support
    it honestly (no fabricated data, just what's actually been uploaded)."""
    return BatchListResponse(batches=storage.list_all_batches())


def _run_processing(batch_id: str, dir_path: str):
    """Background task: matching -> scoring -> summary, with real progress
    checkpoints (not faked) written to meta.json as each stage completes."""
    try:
        storage.update_meta(batch_id, status="processing", progress_pct=10,
                             records_processed=0, records_total=0)

        results = pipeline.process_batch(batch_id, dir_path)

        storage.update_meta(batch_id, status="processing", progress_pct=90,
                             records_processed=results["summary"]["total_records"],
                             records_total=results["summary"]["total_records"])

        storage.write_results(batch_id, results)

        storage.update_meta(batch_id, status="completed", progress_pct=100,
                             records_processed=results["summary"]["total_records"],
                             records_total=results["summary"]["total_records"])
    except Exception as e:
        storage.update_meta(batch_id, status="failed", progress_pct=0, error=str(e))
        raise


@app.post("/api/batch/upload", response_model=BatchUploadResponse)
async def upload_batch(
    background_tasks: BackgroundTasks,
    settlement_file: UploadFile = File(...),
    ledger_file: UploadFile = File(...),
    batch_name: str = Form(...),
    ground_truth_file: UploadFile = File(None),
):
    """ground_truth_file is optional and demo-only: our synthetic batches
    ship one, so precision/recall can be computed and shown live. A genuine
    production upload wouldn't have this, and /summary correctly reports
    precision/recall as null in that case rather than fabricating them."""
    # Validate schemas before accepting the batch. The frontend shows these
    # exact minimum columns, and early validation gives the user a useful 400
    # instead of a background-processing failure.
    required_settlement = {"payment_id", "order_id", "amount", "fee", "tax", "created_at", "settled_at"}
    required_ledger = {"order_id", "amount", "created_at"}
    try:
        settlement_file.file.seek(0)
        ledger_file.file.seek(0)
        settlement_columns = set(pd.read_csv(settlement_file.file, nrows=0).columns)
        ledger_columns = set(pd.read_csv(ledger_file.file, nrows=0).columns)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read uploaded CSV files: {exc}")
    finally:
        settlement_file.file.seek(0)
        ledger_file.file.seek(0)

    missing_settlement = sorted(required_settlement - settlement_columns)
    missing_ledger = sorted(required_ledger - ledger_columns)
    if missing_settlement or missing_ledger:
        problems = []
        if missing_settlement:
            problems.append("Settlement missing: " + ", ".join(missing_settlement))
        if missing_ledger:
            problems.append("Ledger missing: " + ", ".join(missing_ledger))
        raise HTTPException(status_code=400, detail="; ".join(problems))

    batch_id = storage.new_batch_id()
    dir_path = storage.batch_dir(batch_id)

    with open(os.path.join(dir_path, "settlement.csv"), "wb") as f:
        shutil.copyfileobj(settlement_file.file, f)
    with open(os.path.join(dir_path, "ledger.csv"), "wb") as f:
        shutil.copyfileobj(ledger_file.file, f)
    if ground_truth_file is not None:
        with open(os.path.join(dir_path, "ground_truth.json"), "wb") as f:
            shutil.copyfileobj(ground_truth_file.file, f)

    storage.write_meta(batch_id, {
        "batch_id": batch_id, "status": "queued", "progress_pct": 0,
        "records_processed": 0, "records_total": 0, "batch_name": batch_name,
        "created_at": datetime.utcnow().isoformat(),
    })

    background_tasks.add_task(_run_processing, batch_id, dir_path)

    return BatchUploadResponse(batch_id=batch_id, status="processing")


@app.get("/api/batch/{batch_id}/status", response_model=BatchStatusResponse)
def get_status(batch_id: str):
    meta = storage.read_meta(batch_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return BatchStatusResponse(**{k: meta[k] for k in BatchStatusResponse.model_fields if k in meta})


@app.get("/api/batch/{batch_id}/summary", response_model=BatchSummaryResponse)
def get_summary(batch_id: str):
    meta = storage.read_meta(batch_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    if meta["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"Batch is {meta['status']}, not ready yet")

    results = storage.read_results(batch_id)
    return BatchSummaryResponse(**results["summary"])



@app.get("/api/batch/{batch_id}/finance-controller", response_model=FinanceControllerResponse)
def finance_controller(batch_id: str):
    """Turn reconciliation results into an actionable finance-ops decision.
    This is deterministic and evidence-based: no fabricated financial advice.
    """
    meta = storage.read_meta(batch_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    if meta["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"Batch is {meta['status']}, not ready yet")
    results = storage.read_results(batch_id)
    summary = results["summary"]
    exceptions = results["exceptions"]
    open_ex = [e for e in exceptions if e.get("status") != "resolved"]
    exposure = 0.0
    high_value = 0
    for e in open_ex:
        d = e.get("details") or {}
        amounts = [d.get("settlement_amount"), d.get("ledger_amount")]
        numeric = [abs(float(x)) for x in amounts if x is not None]
        diff = d.get("diff")
        if diff is not None:
            impact = abs(float(diff))
        elif numeric:
            impact = max(numeric)
        else:
            impact = 0.0
        exposure += impact
        if impact >= 10000:
            high_value += 1
    by_cat = {}
    for e in open_ex:
        by_cat[e.get("category", "UNKNOWN")] = by_cat.get(e.get("category", "UNKNOWN"), 0) + 1
    # Financial discrepancies outrank simple volume when deciding the first action.
    priority_order = ["AMOUNT_MISMATCH", "MISSING_IN_LEDGER", "MISSING_IN_SETTLEMENT", "DUPLICATE", "ID_AMBIGUOUS", "DATE_DRIFT"]
    highest = next((c for c in priority_order if by_cat.get(c)), max(by_cat, key=by_cat.get) if by_cat else None)
    priorities = []
    labels = {
        "AMOUNT_MISMATCH":"Review high-value amount mismatches first",
        "MISSING_IN_LEDGER":"Investigate transactions missing from the internal ledger",
        "MISSING_IN_SETTLEMENT":"Verify settlement-side missing transactions",
        "DUPLICATE":"Confirm duplicate transactions before downstream action",
        "ID_AMBIGUOUS":"Resolve ambiguous pairings with human confirmation",
        "DATE_DRIFT":"Review timing delays after higher financial-risk issues",
    }
    for c in priority_order:
        if by_cat.get(c): priorities.append(labels[c])
    if not priorities:
        recommendation = "No open exceptions remain. The batch is ready for closure."
    else:
        recommendation = priorities[0] + (f". {high_value} high-value exception(s) require attention." if high_value else ".")
    return FinanceControllerResponse(
        batch_id=batch_id, total_records=summary["total_records"], auto_reconciled=summary["matched"],
        auto_reconciliation_rate=summary["match_rate"], exceptions_open=len(open_ex),
        exceptions_total=len(exceptions), review_exposure=round(exposure, 2),
        highest_risk_category=highest, high_value_exceptions=high_value,
        recommendation=recommendation, priorities=priorities[:4],
    )

@app.get("/api/batch/{batch_id}/exceptions", response_model=ExceptionsListResponse)
def get_exceptions(batch_id: str):
    meta = storage.read_meta(batch_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    if meta["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"Batch is {meta['status']}, not ready yet")

    results = storage.read_results(batch_id)
    return ExceptionsListResponse(exceptions=results["exceptions"])


@app.post("/api/exceptions/{exception_id}/resolve", response_model=ResolveResponse)
def resolve_exception(exception_id: str, body: ResolveRequest):
    batch_id = storage.find_batch_for_exception(exception_id)
    if batch_id is None:
        raise HTTPException(status_code=404, detail="Exception not found")

    results = storage.read_results(batch_id)
    target = next((e for e in results["exceptions"] if e["exception_id"] == exception_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Exception not found in batch results")

    target["status"] = "resolved"
    storage.write_results(batch_id, results)

    storage.append_correction(batch_id, {
        "exception_id": exception_id,
        "category": target["category"],
        "confidence": target["confidence_score"],
        "resolution": body.resolution,
        "note": body.note,
        "timestamp": datetime.utcnow().isoformat(),
    })

    # Side effect, not reflected in this response: if enough corrections have
    # now accumulated, this computes the next calibration round. The
    # /calibration endpoint reads whatever this produces.
    calibration.maybe_advance_round(batch_id)

    return ResolveResponse(exception_id=exception_id, status="resolved")


@app.post("/api/qa/ask", response_model=QAResponse)
def ask_verity(body: QARequest):
    meta = storage.read_meta(body.batch_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    if meta["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"Batch is {meta['status']}, not ready yet")

    results = storage.read_results(body.batch_id)

    # Provider priority: Gemini first (genuinely free, no card, no expiry),
    # then Claude if you've set that key instead/also, then the local
    # rule-based fallback if neither is configured or the call fails for
    # any reason (missing key, rate limit, network issue). The feature
    # should never go fully dark just because one provider had a bad moment
    # mid-demo.
    answer = None
    if os.environ.get("GEMINI_API_KEY"):
        try:
            answer = gemini_agent.ask(body.batch_id, body.question, results["summary"], results["exceptions"])
        except Exception:
            answer = None
    if answer is None and os.environ.get("ANTHROPIC_API_KEY"):
        try:
            answer = agent.ask(body.batch_id, body.question, results["summary"], results["exceptions"])
        except Exception:
            answer = None
    if answer is None:
        answer = local_qa_fallback.answer(body.question, results["summary"], results["exceptions"])

    return QAResponse(**answer)


@app.get("/api/batch/{batch_id}/calibration", response_model=CalibrationResponse)
def get_calibration(batch_id: str):
    meta = storage.read_meta(batch_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    rounds = calibration.get_rounds(batch_id)
    return CalibrationResponse(rounds=rounds)

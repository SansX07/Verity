"""
Verity — Batch Storage
========================
File-based storage for batch state and results. A real DB would be
overkill at buildathon scale (a handful of batches, a few hundred rows
each) and file-based storage is trivially inspectable during debugging —
you can just `cat` a batch's meta.json mid-demo if something looks wrong.

Layout:
  runtime_data/{batch_id}/
    settlement.csv, ledger.csv, ground_truth.json (optional, demo mode)
    meta.json          — status, progress, batch_name
    results.json        — summary + exceptions, written once processing completes
    corrections.json    — log of human resolve() calls, feeds the calibration loop
"""

import json
import os
import uuid

RUNTIME_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "runtime_data")


def new_batch_id() -> str:
    return "batch_" + uuid.uuid4().hex[:12]


def batch_dir(batch_id: str) -> str:
    d = os.path.join(RUNTIME_DIR, batch_id)
    os.makedirs(d, exist_ok=True)
    return d


def write_meta(batch_id: str, meta: dict):
    with open(os.path.join(batch_dir(batch_id), "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)


def update_meta(batch_id: str, **fields):
    """Merges fields into existing meta.json rather than replacing it wholesale.
    write_meta() alone was overwriting the whole file on every status update,
    silently dropping batch_name/created_at set at upload time — this is the
    fix, used for every update after the initial write."""
    existing = read_meta(batch_id) or {}
    existing.update(fields)
    write_meta(batch_id, existing)


def read_meta(batch_id: str) -> dict:
    path = os.path.join(batch_dir(batch_id), "meta.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def write_results(batch_id: str, results: dict):
    with open(os.path.join(batch_dir(batch_id), "results.json"), "w") as f:
        json.dump(results, f, indent=2, default=str)


def read_results(batch_id: str) -> dict:
    path = os.path.join(batch_dir(batch_id), "results.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def append_correction(batch_id: str, correction: dict):
    path = os.path.join(batch_dir(batch_id), "corrections.json")
    corrections = []
    if os.path.exists(path):
        with open(path) as f:
            corrections = json.load(f)
    corrections.append(correction)
    with open(path, "w") as f:
        json.dump(corrections, f, indent=2, default=str)


def read_corrections(batch_id: str) -> list:
    path = os.path.join(batch_dir(batch_id), "corrections.json")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


def batch_exists(batch_id: str) -> bool:
    return os.path.exists(os.path.join(RUNTIME_DIR, batch_id))


def list_all_batches() -> list:
    """Scans runtime_data/ for every batch that's been uploaded, newest first.
    Powers GET /api/batches — real accumulated history, not fabricated."""
    if not os.path.exists(RUNTIME_DIR):
        return []
    entries = []
    for name in os.listdir(RUNTIME_DIR):
        d = os.path.join(RUNTIME_DIR, name)
        if not os.path.isdir(d):
            continue  # skips _exception_index.json etc.
        meta = read_meta(name)
        if meta is None:
            continue
        entry = {
            "batch_id": name,
            "batch_name": meta.get("batch_name", name),
            "status": meta.get("status", "unknown"),
            "created_at": meta.get("created_at"),
        }
        if meta.get("status") == "completed":
            results = read_results(name)
            if results:
                entry["total_records"] = results["summary"]["total_records"]
                entry["match_rate"] = results["summary"]["match_rate"]
                entry["exceptions_count"] = sum(results["summary"]["exceptions_by_category"].values())
                entry["resolved_count"] = sum(1 for e in results["exceptions"] if e["status"] == "resolved")
        entries.append(entry)

    entries.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    return entries


# --- Exception index: exception_id -> batch_id, so /resolve doesn't need
# the batch_id in its URL (per the API contract, it only gets exception_id) ---
INDEX_PATH = os.path.join(RUNTIME_DIR, "_exception_index.json")


def index_exceptions(batch_id: str, exceptions: list):
    os.makedirs(RUNTIME_DIR, exist_ok=True)
    index = {}
    if os.path.exists(INDEX_PATH):
        with open(INDEX_PATH) as f:
            index = json.load(f)
    for e in exceptions:
        index[e["exception_id"]] = batch_id
    with open(INDEX_PATH, "w") as f:
        json.dump(index, f, indent=2)


def find_batch_for_exception(exception_id: str):
    if not os.path.exists(INDEX_PATH):
        return None
    with open(INDEX_PATH) as f:
        index = json.load(f)
    return index.get(exception_id)


# --- Calibration state: Platt params + round history, per batch ---
def write_calibration_state(batch_id: str, state: dict):
    with open(os.path.join(batch_dir(batch_id), "calibration_state.json"), "w") as f:
        json.dump(state, f, indent=2)


def read_calibration_state(batch_id: str):
    path = os.path.join(batch_dir(batch_id), "calibration_state.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)

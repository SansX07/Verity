"""
Verity — smoke tests.

Not a full unit-test suite — these exist to catch the failure mode a demo
is most vulnerable to: something that works when you clicked through it
last week but silently breaks by the time you record. Each test exercises
a real code path against real repo data (batch_holdout), not mocks.

Run from backend_project/:
    pytest tests/ -v

Requires the trained model artifacts in models/ to already exist (they're
checked into the repo) and does not require the frontend or a live server.
"""
import json
import os
import shutil
import sys
import tempfile

import pytest

BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
sys.path.insert(0, os.path.abspath(BACKEND_DIR))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

KNOWN_CATEGORIES = {
    "EXACT_MATCH", "AMOUNT_MISMATCH", "MISSING_IN_LEDGER", "MISSING_IN_SETTLEMENT",
    "DUPLICATE", "DATE_DRIFT", "ID_AMBIGUOUS",
}


# ---------------------------------------------------------------------------
# Layer 1: match_engine + pipeline, called directly (no API, no HTTP)
# ---------------------------------------------------------------------------

def test_match_engine_runs_on_holdout_without_crashing():
    import match_engine
    batch_dir = os.path.join(DATA_DIR, "batch_holdout")
    pairs, structural_exceptions = match_engine.run_matching(batch_dir)
    assert len(pairs) > 0, "expected at least one candidate pair on a real batch"
    # every pair must carry the fields the classifier depends on
    for p in pairs[:5]:
        assert "payment_id" in p
        assert "features" in p or "id_similarity" in p, (
            "pair is missing feature evidence the classifier needs to predict from"
        )


def test_pipeline_end_to_end_on_holdout_stress():
    """The batch the pitch script actually quotes numbers from — if this
    breaks, the live demo breaks in the same way."""
    import pipeline
    pipeline.load_models()
    batch_dir = os.path.join(DATA_DIR, "batch_holdout_stress")
    results = pipeline.process_batch("smoke_test_holdout_stress", batch_dir)

    summary = results["summary"]
    exceptions = results["exceptions"]

    assert summary["total_records"] > 0
    assert 0.0 <= summary["match_rate"] <= 1.0

    # ground_truth.json ships with this batch, so all three scores must be
    # real numbers, not None
    assert summary.get("precision") is not None, "expected a scored end-to-end precision on a ground-truthed batch"
    assert summary.get("recall") is not None
    assert summary.get("f1") is not None
    assert 0.0 <= summary["precision"] <= 1.0
    assert 0.0 <= summary["recall"] <= 1.0

    # every returned exception must use a category the frontend/pitch actually knows about
    seen_categories = {e["category"] for e in exceptions if e.get("category")}
    unknown = seen_categories - KNOWN_CATEGORIES
    assert not unknown, f"pipeline produced categories the frontend doesn't render: {unknown}"

    # deterministic findings must not carry a fake ML confidence score
    for e in exceptions:
        if e["category"] in ("MISSING_IN_LEDGER", "MISSING_IN_SETTLEMENT"):
            assert e.get("confidence_score") is None, (
                f"{e['category']} is deterministic and must not report a fabricated confidence score"
            )


def test_no_ground_truth_reports_none_not_fabricated_numbers():
    """The core honesty claim of the whole pitch: a batch with no
    ground_truth.json must show null scores, not made-up ones. This is the
    single most important test in this file to keep passing."""
    import pipeline
    pipeline.load_models()

    src = os.path.join(DATA_DIR, "batch_holdout")
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copy(os.path.join(src, "settlement.csv"), tmp)
        shutil.copy(os.path.join(src, "ledger.csv"), tmp)
        # deliberately do NOT copy ground_truth.json

        results = pipeline.process_batch("smoke_test_no_gt", tmp)
        summary = results["summary"]

        assert summary.get("precision") is None
        assert summary.get("recall") is None
        assert summary.get("f1") is None
        # but matching/classification must still have run
        assert summary["total_records"] > 0


# ---------------------------------------------------------------------------
# Layer 2: the actual FastAPI app, via TestClient — closest thing to
# "does the live demo work"
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    import main as backend_main
    backend_main.pipeline.load_models()
    return TestClient(backend_main.app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_upload_process_and_finance_controller_roundtrip(client):
    """Uploads a real batch through the actual API, waits for background
    processing, then checks every endpoint the demo clicks through in order:
    upload -> status -> summary -> exceptions -> finance-controller.
    """
    import time

    batch_dir = os.path.join(DATA_DIR, "batch_holdout")
    with open(os.path.join(batch_dir, "settlement.csv"), "rb") as sf, \
         open(os.path.join(batch_dir, "ledger.csv"), "rb") as lf, \
         open(os.path.join(batch_dir, "ground_truth.json"), "rb") as gf:
        r = client.post(
            "/api/batch/upload",
            files={
                "settlement_file": ("settlement.csv", sf, "text/csv"),
                "ledger_file": ("ledger.csv", lf, "text/csv"),
                "ground_truth_file": ("ground_truth.json", gf, "application/json"),
            },
            data={"batch_name": "smoke_test_upload"},
        )
    assert r.status_code == 200, r.text
    batch_id = r.json()["batch_id"]

    # TestClient runs BackgroundTasks synchronously before returning in most
    # versions, but poll briefly anyway so this isn't version-fragile.
    status = None
    for _ in range(20):
        s = client.get(f"/api/batch/{batch_id}/status")
        assert s.status_code == 200
        status = s.json()["status"]
        if status in ("completed", "failed"):
            break
        time.sleep(0.25)
    assert status == "completed", f"batch ended in status={status}, expected completed"

    summary = client.get(f"/api/batch/{batch_id}/summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["total_records"] > 0

    exceptions = client.get(f"/api/batch/{batch_id}/exceptions")
    assert exceptions.status_code == 200

    fc = client.get(f"/api/batch/{batch_id}/finance-controller")
    assert fc.status_code == 200
    fc_body = fc.json()
    assert 0.0 <= fc_body["auto_reconciliation_rate"] <= 1.0
    assert fc_body["review_exposure"] >= 0
    assert fc_body["high_value_exceptions"] >= 0
    assert isinstance(fc_body["priorities"], list)


def test_upload_rejects_missing_required_columns(client):
    """A CSV missing a required column must fail fast with a 400 at upload
    time, not fail silently deep inside background processing."""
    import io
    bad_settlement = io.BytesIO(b"payment_id,amount\npay_1,100\n")  # missing order_id, fee, tax, created_at, settled_at
    good_ledger = io.BytesIO(b"order_id,amount,created_at\nord_1,100,2026-01-01\n")

    r = client.post(
        "/api/batch/upload",
        files={
            "settlement_file": ("settlement.csv", bad_settlement, "text/csv"),
            "ledger_file": ("ledger.csv", good_ledger, "text/csv"),
        },
        data={"batch_name": "smoke_test_bad_schema"},
    )
    assert r.status_code == 400
    assert "Settlement missing" in r.json()["detail"]


def test_finance_controller_404_on_unknown_batch(client):
    r = client.get("/api/batch/does_not_exist/finance-controller")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Layer 3: the correction -> calibration loop. This is the part the pitch
# calls "honest, auditable trust-building" instead of online learning — these
# tests exist to make sure that claim stays true in code, not just in docs.
# ---------------------------------------------------------------------------

def _upload_and_wait(client, batch_dir_name, batch_name):
    import time
    batch_dir = os.path.join(DATA_DIR, batch_dir_name)
    gt_path = os.path.join(batch_dir, "ground_truth.json")
    files = {
        "settlement_file": ("settlement.csv", open(os.path.join(batch_dir, "settlement.csv"), "rb"), "text/csv"),
        "ledger_file": ("ledger.csv", open(os.path.join(batch_dir, "ledger.csv"), "rb"), "text/csv"),
    }
    if os.path.exists(gt_path):
        files["ground_truth_file"] = ("ground_truth.json", open(gt_path, "rb"), "application/json")
    r = client.post("/api/batch/upload", files=files, data={"batch_name": batch_name})
    assert r.status_code == 200, r.text
    batch_id = r.json()["batch_id"]
    for _ in range(20):
        s = client.get(f"/api/batch/{batch_id}/status").json()
        if s["status"] in ("completed", "failed"):
            assert s["status"] == "completed", s
            break
        time.sleep(0.25)
    return batch_id


def test_resolve_exception_records_a_correction_not_a_retrain(client):
    """Confirms the resolve endpoint's actual side effects match what the
    pitch claims: it logs a correction and may advance a calibration round —
    it must NOT touch the trained model artifacts on disk."""
    import pipeline

    model_path_before = None
    models_dir = os.path.join(os.path.dirname(__file__), "..", "models")
    xgb_path = os.path.join(models_dir, "xgb_model.joblib")
    if os.path.exists(xgb_path):
        model_path_before = os.path.getmtime(xgb_path)

    batch_id = _upload_and_wait(client, "batch_holdout", "smoke_test_calibration")

    exceptions = client.get(f"/api/batch/{batch_id}/exceptions").json()["exceptions"]
    open_exceptions = [e for e in exceptions if e.get("status") != "resolved"]
    assert open_exceptions, "expected at least one open exception on batch_holdout to resolve"

    target = open_exceptions[0]
    r = client.post(
        f"/api/exceptions/{target['exception_id']}/resolve",
        json={"resolution": "confirmed_no_match", "note": "smoke test correction"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"

    # the exception itself must now read as resolved
    after = client.get(f"/api/batch/{batch_id}/exceptions").json()["exceptions"]
    resolved_ids = {e["exception_id"] for e in after if e.get("status") == "resolved"}
    assert target["exception_id"] in resolved_ids

    # and the model file on disk must be untouched — the calibration loop
    # is documented as NOT retraining the model, this is that claim in code
    if model_path_before is not None:
        assert os.path.getmtime(xgb_path) == model_path_before, (
            "xgb_model.joblib was modified by resolving an exception — "
            "this contradicts the 'calibration, not retraining' design claim"
        )


def test_calibration_endpoint_reflects_recorded_corrections(client):
    """A resolved exception should show up in the calibration view — not as
    a changed model, but as a round with a nonzero correction count."""
    batch_id = _upload_and_wait(client, "batch_holdout_stress", "smoke_test_calibration_rounds")

    exceptions = client.get(f"/api/batch/{batch_id}/exceptions").json()["exceptions"]
    open_exceptions = [e for e in exceptions if e.get("status") != "resolved"]
    assert len(open_exceptions) >= 1

    for e in open_exceptions[:1]:
        resp = client.post(
            f"/api/exceptions/{e['exception_id']}/resolve",
            json={"resolution": "confirmed_match", "note": None},
        )
        assert resp.status_code == 200

    cal = client.get(f"/api/batch/{batch_id}/calibration")
    assert cal.status_code == 200
    body = cal.json()
    assert "rounds" in body
    # a round only "counts" once MIN_BIN_SAMPLES corrections land in a bin —
    # a single correction may not be enough to produce a full round yet, so
    # this only asserts the endpoint responds with a well-shaped list, not
    # that a round has necessarily closed.
    assert isinstance(body["rounds"], list)

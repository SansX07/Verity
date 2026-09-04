"""Verity reconciliation pipeline.

The pipeline deliberately separates three ideas that were previously mixed in
one number:
  * reconciliation units: unique business transactions/problems;
  * auto-reconciliation rate: units classified as EXACT_MATCH;
  * evaluation metrics: end-to-end category metrics when ground truth exists.

Structural exceptions are deterministic and are included in end-to-end scoring.
The ML classifier is evaluated separately on candidate pairs for diagnostics.
"""

import json
import os
import sys
import uuid

import joblib
import pandas as pd
from sklearn.metrics import classification_report

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import match_engine  # noqa: E402
from explanations import explain  # noqa: E402

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")

_model = None
_scaler = None
_label_encoder = None
_feature_columns = None
_model_kind = None


def load_models():
    global _model, _scaler, _label_encoder, _feature_columns, _model_kind
    with open(os.path.join(MODELS_DIR, "eval_report.json")) as f:
        _model_kind = json.load(f)["model_choice"]
    def _load_artifacts():
        global _model, _scaler, _label_encoder, _feature_columns
        if _model_kind == "xgboost":
            _model = joblib.load(os.path.join(MODELS_DIR, "xgb_model.joblib"))
            _scaler = None
        else:
            _model = joblib.load(os.path.join(MODELS_DIR, "logreg_model.joblib"))
            _scaler = joblib.load(os.path.join(MODELS_DIR, "scaler.joblib"))
        _label_encoder = joblib.load(os.path.join(MODELS_DIR, "label_encoder.joblib"))
        _feature_columns = joblib.load(os.path.join(MODELS_DIR, "feature_columns.joblib"))

    try:
        _load_artifacts()
    except Exception as exc:
        # joblib-serialized XGBoost estimators can be environment-sensitive.
        # Rather than killing the API with an opaque "input stream corrupted"
        # startup error, rebuild every artifact from the repository's training
        # data in the current Python/XGBoost environment and retry once.
        print(f"Model artifacts could not be loaded ({type(exc).__name__}: {exc}). Rebuilding models locally...")
        import train_model
        train_model.main()
        with open(os.path.join(MODELS_DIR, "eval_report.json")) as f:
            _model_kind = json.load(f)["model_choice"]
        _load_artifacts()

    return _model_kind


def predict_pairs(pairs: list) -> list:
    if not pairs:
        return []
    df = pd.DataFrame(pairs)
    X = df.reindex(columns=_feature_columns, fill_value=0).fillna(0)
    X_eval = _scaler.transform(X) if _scaler is not None else X
    probs = _model.predict_proba(X_eval)
    pred_idx = probs.argmax(axis=1)
    confidences = probs.max(axis=1)
    categories = _label_encoder.inverse_transform(pred_idx)
    for i, pair in enumerate(pairs):
        pair["predicted_category"] = categories[i]
        pair["confidence"] = round(float(confidences[i]), 4)
    return pairs


def _load_ground_truth(batch_dir: str):
    path = os.path.join(batch_dir, "ground_truth.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def score_pair_classification(pairs: list, ground_truth):
    """ML-only diagnostic on candidate pairs. Structural exceptions are excluded."""
    if not ground_truth:
        return None
    gt_by_payment = {g["payment_id"]: g["category"] for g in ground_truth if g.get("payment_id")}
    y_true, y_pred = [], []
    for p in pairs:
        true_cat = gt_by_payment.get(p["payment_id"])
        if true_cat is not None:
            y_true.append(true_cat)
            y_pred.append(p["predicted_category"])
    if not y_true:
        return None
    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    return {
        "precision": round(report["weighted avg"]["precision"], 4),
        "recall": round(report["weighted avg"]["recall"], 4),
        "f1": round(report["weighted avg"]["f1-score"], 4),
        "units_scored": len(y_true),
    }


def score_end_to_end(pairs: list, structural_exceptions: list, ground_truth):
    """Score every synthetic ground-truth transaction, including structural cases."""
    if not ground_truth:
        return None

    pred_by_payment = {p["payment_id"]: p["predicted_category"] for p in pairs}
    pred_by_order = {}
    for e in structural_exceptions:
        if e["type"] == "MISSING_IN_LEDGER" and e.get("payment_id"):
            pred_by_payment[e["payment_id"]] = e["type"]
        elif e["type"] == "MISSING_IN_SETTLEMENT" and e.get("order_id"):
            pred_by_order[e["order_id"]] = e["type"]

    y_true, y_pred = [], []
    for g in ground_truth:
        true_cat = g["category"]
        pred = pred_by_payment.get(g.get("payment_id"))
        if pred is None:
            pred = pred_by_order.get(g.get("order_id"))
        if pred is None:
            # A ground-truth unit that was neither paired nor structurally
            # detected is an explicit miss, represented as UNDETECTED.
            pred = "UNDETECTED"
        y_true.append(true_cat)
        y_pred.append(pred)

    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    return {
        "precision": round(report["weighted avg"]["precision"], 4),
        "recall": round(report["weighted avg"]["recall"], 4),
        "f1": round(report["weighted avg"]["f1-score"], 4),
        "units_scored": len(y_true),
    }


def build_exception_objects(pairs: list, structural_exceptions: list) -> list:
    """Create UI-ready exceptions without losing settlement-vs-ledger evidence."""
    exceptions = []
    for p in pairs:
        cat = p["predicted_category"]
        if cat == "EXACT_MATCH":
            continue
        details = {
            "settlement_payment_id": p.get("payment_id"),
            "ledger_payment_id": p.get("ledger_payment_id"),
            "settlement_order_id": p.get("order_id"),
            "ledger_order_id": p.get("matched_order_id"),
            "ledger_amount": p.get("ledger_amount"),
            "settlement_amount": p.get("settlement_amount"),
            "diff": p.get("amount_diff"),
            "date_diff_days": p.get("date_diff_days"),
            "id_similarity": p.get("id_similarity"),
            "second_best_id_similarity": p.get("second_best_id_similarity"),
            "id_similarity_margin": p.get("id_similarity_margin"),
            "match_type": p.get("match_type"),
            "competing_candidates_count": p.get("competing_candidates_count"),
            "closest_competing_amount_diff_pct": p.get("closest_competing_amount_diff_pct"),
        }
        explanation = explain(cat, p.get("payment_id"), p.get("order_id"),
                              p.get("matched_order_id"), details, p.get("confidence"))
        exceptions.append({
            "exception_id": "exc_" + uuid.uuid4().hex[:10],
            "category": cat,
            "payment_id": p.get("payment_id"),
            "order_id": p.get("order_id"),
            "confidence_score": p.get("confidence"),
            "detection_method": "model",
            "details": details,
            "explanation": explanation,
            "status": "open",
        })

    for e in structural_exceptions:
        details = {
            "settlement_payment_id": e.get("payment_id"),
            "ledger_payment_id": None,
            "settlement_order_id": e.get("order_id") if e["type"] == "MISSING_IN_LEDGER" else None,
            "ledger_order_id": e.get("order_id") if e["type"] == "MISSING_IN_SETTLEMENT" else None,
            "ledger_amount": e["amount"] if e["type"] == "MISSING_IN_SETTLEMENT" else None,
            "settlement_amount": e["amount"] if e["type"] == "MISSING_IN_LEDGER" else None,
            "diff": None,
            "date_diff_days": None,
            "match_type": "none",
        }
        explanation = explain(e["type"], e.get("payment_id"), details.get("settlement_order_id"),
                              details.get("ledger_order_id"), details, confidence=None)
        exceptions.append({
            "exception_id": "exc_" + uuid.uuid4().hex[:10],
            "category": e["type"],
            "payment_id": e.get("payment_id"),
            "order_id": e.get("order_id"),
            "confidence_score": None,
            "detection_method": "deterministic",
            "details": details,
            "explanation": explanation,
            "status": "open",
        })
    return exceptions


def process_batch(batch_id: str, dir_path: str) -> dict:
    if _model is None:
        load_models()

    settlement, ledger = match_engine.load_batch(dir_path)
    canonical_settlement_rows = settlement["payment_id"].nunique()
    pairs, structural_exceptions = match_engine.run_matching(dir_path)
    pairs = predict_pairs(pairs)

    ground_truth = _load_ground_truth(dir_path)
    end_to_end_scores = score_end_to_end(pairs, structural_exceptions, ground_truth)
    pair_scores = score_pair_classification(pairs, ground_truth)

    # For demo batches the ground truth defines the true number of unique
    # reconciliation units. For real uploads, use canonical settlement units
    # plus ledger-only units; never count duplicate source rows twice.
    if ground_truth is not None:
        total_records = len(ground_truth)
    else:
        total_records = len(pairs) + len(structural_exceptions)

    exact_matches = sum(1 for p in pairs if p["predicted_category"] == "EXACT_MATCH")
    match_rate = round(exact_matches / total_records, 4) if total_records else 0.0

    exceptions = build_exception_objects(pairs, structural_exceptions)
    exceptions_by_category = {}
    for e in exceptions:
        exceptions_by_category[e["category"]] = exceptions_by_category.get(e["category"], 0) + 1

    summary = {
        "batch_id": batch_id,
        "total_records": total_records,
        "matched": exact_matches,
        "match_rate": match_rate,
        "precision": end_to_end_scores["precision"] if end_to_end_scores else None,
        "recall": end_to_end_scores["recall"] if end_to_end_scores else None,
        "f1": end_to_end_scores["f1"] if end_to_end_scores else None,
        "pair_precision": pair_scores["precision"] if pair_scores else None,
        "pair_recall": pair_scores["recall"] if pair_scores else None,
        "pair_f1": pair_scores["f1"] if pair_scores else None,
        "settlement_rows": int(len(settlement)),
        "ledger_rows": int(len(ledger)),
        "candidate_pairs": len(pairs),
        "structural_exceptions": len(structural_exceptions),
        "exceptions_by_category": exceptions_by_category,
    }

    import storage as _storage
    _storage.index_exceptions(batch_id, exceptions)
    return {"summary": summary, "exceptions": exceptions}

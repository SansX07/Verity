"""
Verity — Matching Engine
=========================

Reconciles settlement.csv against ledger.csv in two passes:

  Pass 1 (deterministic): exact match on order_id
  Pass 2 (fuzzy):         for settlement rows with no exact order_id hit in
                           the ledger, find the closest ledger order_id by
                           string similarity (handles ID_AMBIGUOUS / typo cases)

For every candidate pair (matched or fuzzy-candidate), extracts a feature
vector used later by the ML scoring layer:

  - amount_diff, amount_diff_pct
  - date_diff_days (settled_at vs created_at)
  - id_similarity (0-1, exact match on order_id = 1.0)
  - fee_in_expected_range (bool-ish 0/1)
  - is_duplicate_payment_id (0/1)

Also flags structural exceptions that aren't about a *pair* at all:
  - MISSING_IN_LEDGER      settlement row, no ledger row found even fuzzily
  - MISSING_IN_SETTLEMENT  ledger row, no settlement row found even fuzzily
  - DUPLICATE              payment_id appears >1 time in settlement

Usage:
    python match_engine.py --batch batch_clean
    python match_engine.py --batch batch_realistic
    python match_engine.py --batch batch_stress
"""

import argparse
import json
import os
import re

import pandas as pd
from rapidfuzz import fuzz

FUZZY_THRESHOLD = 80  # minimum similarity for a fuzzy candidate
AMBIGUITY_MARGIN_THRESHOLD = 5  # points: small best-vs-second gap means the ID evidence is ambiguous
EXPECTED_FEE_PCT = 0.02  # matches the ~2% fee simulated in the data generator
FEE_TOLERANCE_PCT = 0.008  # allowed slack around expected fee rate
COMPETING_AMOUNT_TOLERANCE_PCT = 0.02  # how close another ledger row's amount must be to count as "competing"


def clean_amount(val):
    """Handle the multi_currency_symbol_noise adversarial case (e.g. '₹1234.50')."""
    if isinstance(val, str):
        val = re.sub(r"[^\d.\-]", "", val)
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def to_rupees(val):
    """Real Razorpay schema represents amounts in paise, not rupees (e.g.
    amount=100000 means ₹1,000.00) — also handles the multi_currency_symbol_noise
    adversarial case where a stray ₹ symbol gets embedded in the field."""
    if isinstance(val, str):
        val = re.sub(r"[^\d.\-]", "", val)
    try:
        return float(val) / 100
    except (ValueError, TypeError):
        return None


def load_batch(batch_dir):
    settlement = pd.read_csv(os.path.join(batch_dir, "settlement.csv"))
    ledger = pd.read_csv(os.path.join(batch_dir, "ledger.csv"))

    # Settlement side follows Razorpay's real schema: amounts in paise, dates
    # as unix timestamps. Ledger side is the merchant's own internal system
    # (no external standard to align to) and stays in rupees / ISO dates.
    settlement["amount"] = settlement["amount"].apply(to_rupees)
    settlement["fee"] = settlement["fee"] / 100
    settlement["tax"] = settlement["tax"] / 100
    ledger["amount"] = ledger["amount"].apply(clean_amount)

    settlement["settled_at"] = pd.to_datetime(settlement["settled_at"], unit="s")
    settlement["created_at"] = pd.to_datetime(settlement["created_at"], unit="s")
    ledger["created_at"] = pd.to_datetime(ledger["created_at"])
    return settlement, ledger


def extract_features(srow, lrow, id_similarity, ledger_amounts, matched_order_id):
    # Real Razorpay schema's "amount" field is the gross transaction amount
    # already (unlike our earlier invented schema, where "amount" meant net-
    # of-fees and had to be grossed back up) — aligning to the real schema
    # actually simplifies this comparison rather than complicating it.
    fee = srow.get("fee", 0) or 0
    tax = srow.get("tax", 0) or 0
    settlement_gross = srow["amount"]

    amount_diff = round(settlement_gross - lrow["amount"], 2)
    amount_diff_pct = abs(amount_diff) / lrow["amount"] if lrow["amount"] else 0
    date_diff_days = (srow["settled_at"] - lrow["created_at"]).total_seconds() / 86400

    expected_fee = lrow["amount"] * EXPECTED_FEE_PCT
    fee_diff_pct = abs(fee - expected_fee) / expected_fee if expected_fee else 0
    fee_in_range = 1 if fee_diff_pct <= FEE_TOLERANCE_PCT * 3 else 0  # loose band, ML will refine

    # Amount-ambiguity check: even if the ID matched perfectly, flag whether
    # some OTHER ledger row also has a suspiciously similar amount. Catches
    # the "near-identical-amount decoy" adversarial pattern that a pure
    # ID-matcher would otherwise wave through with full confidence.
    #
    # competing_candidates_count alone is noisy (documented in eval_report.json:
    # clean EXACT_MATCH rows show this ranging 0-24 purely by chance in a 500+
    # row ledger, since a fixed 2% band catches unrelated rows at scale). Added
    # closest_competing_amount_diff_pct as a continuous companion feature: a
    # genuine decoy is deliberately placed within fractions of a percent
    # (e.g. +0.50 on a few-thousand-rupee amount), while a coincidental
    # same-band match tends to sit close to the tolerance boundary. The two
    # features together separate "one row very close" (real decoy) from
    # "several rows loosely close" (chance) far better than either alone.
    competing = 0
    closest_competing_diff_pct = None
    for oid, amt in ledger_amounts:
        if oid == matched_order_id:
            continue
        if not amt:
            continue
        diff_pct = abs(amt - settlement_gross) / amt
        if diff_pct <= COMPETING_AMOUNT_TOLERANCE_PCT:
            competing += 1
        if closest_competing_diff_pct is None or diff_pct < closest_competing_diff_pct:
            closest_competing_diff_pct = diff_pct

    return {
        "amount_diff": amount_diff,
        "amount_diff_pct": round(amount_diff_pct, 4),
        "date_diff_days": round(date_diff_days, 2),
        "id_similarity": round(id_similarity, 2),
        "fee_in_range": fee_in_range,
        "competing_candidates_count": competing,
        "closest_competing_amount_diff_pct": round(closest_competing_diff_pct, 4)
            if closest_competing_diff_pct is not None else 1.0,
        "settlement_amount": round(settlement_gross, 2),
        "ledger_amount": round(lrow["amount"], 2),
    }


def run_matching(batch_dir):
    """Reconcile one batch using stable reconciliation units.

    Important safeguards:
    * exact IDs are reserved before fuzzy matching, so a fuzzy typo cannot steal
      a ledger row that has an exact settlement counterpart;
    * duplicate settlement rows are represented once as one business exception,
      rather than inflating both the exception count and the denominator;
    * fuzzy matches retain the second-best score and score margin so close
      alternatives can be identified as genuinely ambiguous.
    """
    settlement, ledger = load_batch(batch_dir)

    dup_counts = settlement["payment_id"].value_counts()
    duplicate_payment_ids = set(dup_counts[dup_counts > 1].index)

    ledger_by_order = {row["order_id"]: row for _, row in ledger.iterrows()}
    ledger_order_ids = list(ledger_by_order.keys())
    ledger_amounts = [(oid, row["amount"]) for oid, row in ledger_by_order.items()]

    # One canonical settlement row per payment. A duplicate payment is one
    # reconciliation problem, not two independent transactions.
    canonical_settlement = settlement.drop_duplicates(subset="payment_id", keep="first")
    matched_ledger_ids = set()
    pairs = []
    structural_exceptions = []
    unmatched = []

    # Pass 1: reserve all exact matches first.
    for _, srow in canonical_settlement.iterrows():
        is_dup = 1 if srow["payment_id"] in duplicate_payment_ids else 0
        order_id = srow["order_id"]
        if order_id in ledger_by_order:
            lrow = ledger_by_order[order_id]
            feats = extract_features(srow, lrow, id_similarity=1.0,
                                     ledger_amounts=ledger_amounts, matched_order_id=order_id)
            pairs.append({
                "payment_id": srow["payment_id"],
                "order_id": order_id,
                "matched_order_id": order_id,
                "match_type": "exact",
                "is_duplicate_payment_id": is_dup,
                "second_best_id_similarity": 0.0,
                "id_similarity_margin": 1.0,
                "low_similarity_margin": 0,
                **feats,
            })
            matched_ledger_ids.add(order_id)
        else:
            unmatched.append((srow, is_dup))

    # Pass 2: fuzzy match only against ledger rows not already reserved by an
    # exact match. Track the runner-up and margin instead of blindly trusting
    # the single highest similarity.
    available_ids = [oid for oid in ledger_order_ids if oid not in matched_ledger_ids]
    for srow, is_dup in unmatched:
        order_id = srow["order_id"]
        scored = sorted(((fuzz.ratio(order_id, cand_id), cand_id) for cand_id in available_ids), reverse=True)
        best_score, best_match = scored[0] if scored else (0, None)
        second_score = scored[1][0] if len(scored) > 1 else 0

        if best_match is not None and best_score >= FUZZY_THRESHOLD:
            lrow = ledger_by_order[best_match]
            feats = extract_features(srow, lrow, id_similarity=best_score / 100,
                                     ledger_amounts=ledger_amounts, matched_order_id=best_match)
            margin = (best_score - second_score) / 100
            pairs.append({
                "payment_id": srow["payment_id"],
                "order_id": order_id,
                "matched_order_id": best_match,
                "match_type": "fuzzy",
                "is_duplicate_payment_id": is_dup,
                "second_best_id_similarity": round(second_score / 100, 4),
                "id_similarity_margin": round(margin, 4),
                "low_similarity_margin": 1 if best_score >= FUZZY_THRESHOLD and (best_score - second_score) < AMBIGUITY_MARGIN_THRESHOLD else 0,
                **feats,
            })
            matched_ledger_ids.add(best_match)
            available_ids.remove(best_match)
        else:
            structural_exceptions.append({
                "type": "MISSING_IN_LEDGER",
                "payment_id": srow["payment_id"],
                "order_id": order_id,
                "amount": srow["amount"],
                "reason": "No ledger record found, even under fuzzy ID matching",
            })

    for order_id, lrow in ledger_by_order.items():
        if order_id not in matched_ledger_ids:
            structural_exceptions.append({
                "type": "MISSING_IN_SETTLEMENT",
                "order_id": order_id,
                "amount": lrow["amount"],
                "reason": "No settlement record found for this ledger entry",
            })

    return pairs, structural_exceptions


def score_against_ground_truth(batch_dir, pairs, structural_exceptions):
    """If ground_truth.json exists (synthetic batches), compute precision/recall
    on the binary question: did we correctly find a candidate pair for every
    txn that should have one, and correctly flag missing ones as missing?"""
    gt_path = os.path.join(batch_dir, "ground_truth.json")
    if not os.path.exists(gt_path):
        return None

    with open(gt_path) as f:
        ground_truth = json.load(f)

    gt_by_payment = {g["payment_id"]: g for g in ground_truth if g.get("payment_id")}
    matched_payment_ids = {p["payment_id"] for p in pairs}
    missing_ledger_ids = {e["payment_id"] for e in structural_exceptions if e["type"] == "MISSING_IN_LEDGER"}

    tp = fp = fn = 0
    for pid, gt in gt_by_payment.items():
        should_match = gt.get("is_match", True) and gt["category"] != "MISSING_IN_LEDGER"
        did_match = pid in matched_payment_ids

        if should_match and did_match:
            tp += 1
        elif should_match and not did_match:
            fn += 1
        elif not should_match and did_match:
            fp += 1
        # true negatives (correctly flagged missing) aren't counted in P/R

    precision = tp / (tp + fp) if (tp + fp) else 0
    recall = tp / (tp + fn) if (tp + fn) else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0

    return {
        "true_positives": tp, "false_positives": fp, "false_negatives": fn,
        "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", required=True, help="batch folder name under data/, e.g. batch_clean")
    args = parser.parse_args()

    batch_dir = os.path.join(os.path.dirname(__file__), "data", args.batch)
    pairs, structural_exceptions = run_matching(batch_dir)

    exact = sum(1 for p in pairs if p["match_type"] == "exact")
    fuzzy = sum(1 for p in pairs if p["match_type"] == "fuzzy")
    dup = sum(1 for p in pairs if p["is_duplicate_payment_id"])

    print(f"\nBatch: {args.batch}")
    print(f"  Candidate pairs found: {len(pairs)}  (exact: {exact}, fuzzy: {fuzzy})")
    print(f"  Duplicate-flagged rows: {dup}")
    print(f"  Structural exceptions: {len(structural_exceptions)}")
    missing_ledger = sum(1 for e in structural_exceptions if e["type"] == "MISSING_IN_LEDGER")
    missing_settlement = sum(1 for e in structural_exceptions if e["type"] == "MISSING_IN_SETTLEMENT")
    print(f"    MISSING_IN_LEDGER:     {missing_ledger}")
    print(f"    MISSING_IN_SETTLEMENT: {missing_settlement}")

    scores = score_against_ground_truth(batch_dir, pairs, structural_exceptions)
    if scores:
        print(f"\n  Against ground truth:")
        print(f"    Precision: {scores['precision']:.3f}")
        print(f"    Recall:    {scores['recall']:.3f}")
        print(f"    F1:        {scores['f1']:.3f}")
        print(f"    (TP={scores['true_positives']}, FP={scores['false_positives']}, FN={scores['false_negatives']})")

    out_dir = batch_dir
    with open(os.path.join(out_dir, "matched_pairs.json"), "w") as f:
        json.dump(pairs, f, indent=2, default=str)
    with open(os.path.join(out_dir, "structural_exceptions.json"), "w") as f:
        json.dump(structural_exceptions, f, indent=2, default=str)
    if scores:
        with open(os.path.join(out_dir, "matching_scores.json"), "w") as f:
            json.dump(scores, f, indent=2)

    print(f"\n  Output written to: {out_dir}\n")


if __name__ == "__main__":
    main()

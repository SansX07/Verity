"""
Verity — Training Set Builder
===============================

Joins each batch's matched_pairs.json (features, from match_engine.py) with
ground_truth.json (the true category label, from generate_data.py) on
payment_id, producing one row per candidate pair with its true exception
category attached.

Structural exceptions (MISSING_IN_LEDGER / MISSING_IN_SETTLEMENT) are
excluded on purpose: there's no candidate *pair* for the ML classifier to
score in those cases (one side of the transaction doesn't exist at all) —
the matching engine already resolves those deterministically. The
classifier's job is narrower and harder: given a pair the engine DID find,
decide how much to trust it.

Combines all three batches (clean/realistic/stress) into one training set,
tagging each row with its source batch so you can stratify or hold one
batch out entirely for a cleaner train/test split later.

Usage:
    python build_training_set.py
"""

import json
import os

import pandas as pd

BATCHES = ["batch_clean", "batch_realistic", "batch_stress"]
FEATURE_COLUMNS = [
    "amount_diff", "amount_diff_pct", "date_diff_days",
    "id_similarity", "fee_in_range", "is_duplicate_payment_id",
    "competing_candidates_count", "closest_competing_amount_diff_pct",
    "second_best_id_similarity", "id_similarity_margin", "low_similarity_margin",
]


def build_batch_training_rows(batch_dir, batch_name):
    with open(os.path.join(batch_dir, "matched_pairs.json")) as f:
        pairs = json.load(f)
    with open(os.path.join(batch_dir, "ground_truth.json")) as f:
        ground_truth = json.load(f)

    gt_by_payment = {g["payment_id"]: g for g in ground_truth if g.get("payment_id")}

    rows = []
    unlabeled = 0
    for p in pairs:
        gt = gt_by_payment.get(p["payment_id"])
        if gt is None:
            unlabeled += 1
            continue
        row = {**p, "category": gt["category"], "batch_source": batch_name}
        rows.append(row)

    if unlabeled:
        print(f"  [{batch_name}] warning: {unlabeled} matched pairs had no ground truth entry (skipped)")

    return rows


def main():
    base_dir = os.path.dirname(__file__)
    all_rows = []

    print("Building training set from all batches...\n")
    for batch_name in BATCHES:
        batch_dir = os.path.join(base_dir, "data", batch_name)
        rows = build_batch_training_rows(batch_dir, batch_name)
        print(f"  {batch_name}: {len(rows)} labeled rows")
        all_rows.extend(rows)

    df = pd.DataFrame(all_rows)
    out_dir = os.path.join(base_dir, "data", "training")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "training_data.csv")
    df.to_csv(out_path, index=False)

    print(f"\nTotal labeled rows: {len(df)}")
    print(f"Written to: {out_path}\n")

    # --- Sanity check #1: class balance ---
    print("Class balance (category label):")
    counts = df["category"].value_counts()
    for cat, n in counts.items():
        print(f"  {cat:<20} {n:>5}  ({100*n/len(df):5.1f}%)")

    # --- Sanity check #2: do features actually separate categories? ---
    # If a category's mean feature values don't look distinct from EXACT_MATCH,
    # the classifier will struggle — better to catch that now than after training.
    print("\nMean feature values by category (sanity check before ML training):")
    summary = df.groupby("category")[FEATURE_COLUMNS].mean().round(3)
    print(summary.to_string())

    # Flag anything that looks suspiciously identical to EXACT_MATCH
    if "EXACT_MATCH" in summary.index:
        baseline = summary.loc["EXACT_MATCH"]
        print("\nSeparation check vs EXACT_MATCH baseline:")
        for cat in summary.index:
            if cat == "EXACT_MATCH":
                continue
            diff = (summary.loc[cat] - baseline).abs()
            biggest_signal = diff.idxmax()
            print(f"  {cat:<20} strongest separating feature: {biggest_signal} (Δ={diff[biggest_signal]:.3f})")


if __name__ == "__main__":
    main()

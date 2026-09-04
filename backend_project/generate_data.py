"""
Verity — Synthetic Reconciliation Data Generator
==================================================

Generates two linked datasets that simulate a real reconciliation problem:

  1. settlement.csv  — mimics a Razorpay settlement report
  2. ledger.csv       — mimics an internal order/ledger system

Every record is generated from a single "true" underlying transaction, then
deliberately mutated (or dropped, duplicated, delayed) according to an
EXCEPTION_TAXONOMY so that:

  - You know ground truth for every pair (perfect for precision/recall/F1)
  - The exception mix maps 1:1 to Verity's 6 exception categories
  - You can dial up "messiness" to produce clean / realistic / stress batches

Usage:
    python generate_data.py --n 500 --messiness realistic --seed 42 --out batch_realistic
    python generate_data.py --n 500 --messiness clean      --seed 42 --out batch_clean
    python generate_data.py --n 500 --messiness stress     --seed 42 --out batch_stress
"""

import argparse
import csv
import json
import os
import random
import uuid
from datetime import datetime, timedelta

from faker import Faker

fake = Faker()

# ---------------------------------------------------------------------------
# Exception taxonomy — must match the API contract / Verity backend exactly
# ---------------------------------------------------------------------------
EXCEPTION_CATEGORIES = [
    "EXACT_MATCH",            # not an exception — clean match, included for completeness
    "AMOUNT_MISMATCH",
    "MISSING_IN_LEDGER",
    "MISSING_IN_SETTLEMENT",
    "DUPLICATE",
    "DATE_DRIFT",
    "ID_AMBIGUOUS",
]

# Messiness presets: probability mass over exception categories (excluding EXACT_MATCH,
# which soaks up the remainder). Tune these to taste.
MESSINESS_PRESETS = {
    "clean": {
        "AMOUNT_MISMATCH": 0.03,
        "MISSING_IN_LEDGER": 0.02,
        "MISSING_IN_SETTLEMENT": 0.02,
        "DUPLICATE": 0.01,
        "DATE_DRIFT": 0.02,
        "ID_AMBIGUOUS": 0.02,
    },  # ~88% exact match
    "realistic": {
        "AMOUNT_MISMATCH": 0.06,
        "MISSING_IN_LEDGER": 0.04,
        "MISSING_IN_SETTLEMENT": 0.05,
        "DUPLICATE": 0.02,
        "DATE_DRIFT": 0.05,
        "ID_AMBIGUOUS": 0.03,
    },  # ~75% exact match
    "stress": {
        "AMOUNT_MISMATCH": 0.10,
        "MISSING_IN_LEDGER": 0.08,
        "MISSING_IN_SETTLEMENT": 0.08,
        "DUPLICATE": 0.05,
        "DATE_DRIFT": 0.08,
        "ID_AMBIGUOUS": 0.06,
    },  # ~55% exact match — plus adversarial edge cases layered in separately
}

STATUS_CHOICES_SETTLEMENT = ["settled", "processed"]
STATUS_CHOICES_LEDGER = ["completed", "captured"]

# ---------------------------------------------------------------------------
# Real Razorpay Settlement Recon API schema (razorpay.com/docs/api/settlements/fetch-recon/)
# ---------------------------------------------------------------------------
# ledger.csv keeps its own simple internal schema deliberately — it represents
# YOUR company's proprietary internal system, which has no external standard
# to align to (every merchant's internal ledger looks different). Only
# settlement.csv is aligned to Razorpay's real schema, since that's the side
# Razorpay actually defines and publishes.
METHOD_WEIGHTS = [("card", 0.45), ("upi", 0.35), ("netbanking", 0.12), ("wallet", 0.08)]
CARD_NETWORKS = ["Visa", "MasterCard", "RuPay", "Amex"]
CARD_ISSUERS = ["HDFC", "ICIC", "SBIN", "UTIB", "KKBK"]  # real-style bank codes


def pick_method():
    r = random.random()
    cum = 0.0
    for m, w in METHOD_WEIGHTS:
        cum += w
        if r < cum:
            return m
    return "card"


def to_paise(rupees):
    """Razorpay represents all monetary fields in the smallest currency unit
    (paise for INR), not rupees — e.g. amount=100000 means ₹1,000.00."""
    return int(round(rupees * 100))


def to_unix(iso_string):
    return int(datetime.fromisoformat(iso_string).timestamp())


def to_real_settlement_schema(row, settlement_batch_ids):
    """Converts one internal settlement row into Razorpay's real Settlement
    Recon API field names, types, and units. The exception-injection logic
    upstream never has to know about this — it works entirely in the simple
    internal shape, and this is the only place real-schema alignment happens.
    """
    net_amount = row["amount"]
    fee = row.get("fee", 0) or 0
    tax = row.get("tax", 0) or 0
    gross_amount = round(net_amount + fee + tax, 2)

    method = pick_method()
    is_card = method == "card"

    settle_date_key = row["settled_at"][:10]  # group same-day settlements into one batch, like Razorpay does
    if settle_date_key not in settlement_batch_ids:
        settlement_batch_ids[settle_date_key] = "setl_" + uuid.uuid4().hex[:14].upper()

    amount_field = to_paise(gross_amount)
    if row.get("_inject_currency_noise"):
        # Adversarial case: dirty string noise in the amount field, applied
        # AFTER clean arithmetic so this never breaks the conversion itself —
        # only the final CSV cell looks messy, exactly what the case is testing.
        amount_field = f"₹{amount_field}"

    return {
        "entity_id": row["payment_id"],
        "type": "payment",  # refund/transfer/adjustment types are a natural extension, out of scope here
        "debit": 0,
        "credit": to_paise(net_amount),
        "amount": amount_field,
        "currency": "INR",
        "fee": to_paise(fee),
        "tax": to_paise(tax),
        "on_hold": 0,
        "settled": 1,
        "created_at": to_unix(row["created_at"]),
        "settled_at": to_unix(row["settled_at"]),
        "settlement_id": settlement_batch_ids[settle_date_key],
        "payment_id": row["payment_id"],
        "settlement_utr": row["utr"],
        "order_id": row["order_id"],
        "order_receipt": "rcpt_" + uuid.uuid4().hex[:10],
        "method": method,
        "card_network": random.choice(CARD_NETWORKS) if is_card else "",
        "card_issuer": random.choice(CARD_ISSUERS) if is_card else "",
        "card_type": random.choice(["credit", "debit"]) if is_card else "",
        "dispute_id": "",
    }


REAL_SETTLEMENT_FIELDNAMES = [
    "entity_id", "type", "debit", "credit", "amount", "currency", "fee", "tax",
    "on_hold", "settled", "created_at", "settled_at", "settlement_id",
    "payment_id", "settlement_utr", "order_id", "order_receipt", "method",
    "card_network", "card_issuer", "card_type", "dispute_id",
]


def rand_amount():
    """Amount in rupees, weighted toward small/medium transactions with a long tail."""
    r = random.random()
    if r < 0.7:
        return round(random.uniform(99, 2999), 2)
    elif r < 0.93:
        return round(random.uniform(3000, 25000), 2)
    else:
        return round(random.uniform(25000, 250000), 2)


def rand_fee(amount):
    # Razorpay-style ~2% + GST-ish flat approximation, just for realism
    fee = round(amount * 0.02, 2)
    tax = round(fee * 0.18, 2)
    return fee, tax


def transpose_digits(s):
    """Simulate an ID typo by swapping two adjacent characters.

    BUGFIX: hex-derived IDs often have repeated adjacent characters, so a
    naive swap is a no-op ~4% of the time (confirmed empirically: 87/2000
    on real ID strings) — the "corrupted" ID comes out byte-identical to
    the original, which is not a typo, it's the same ID. Retrying until
    the swap actually changes the string guarantees every ID_AMBIGUOUS
    label is a genuine fuzzy-match case rather than a mislabeled exact
    match hiding in the training/eval data."""
    orig = s
    for _ in range(20):  # 20 tries is enough that failure is effectively impossible
        chars = list(orig)
        if len(chars) < 2:
            return orig
        i = random.randint(0, len(chars) - 2)
        chars[i], chars[i + 1] = chars[i + 1], chars[i]
        candidate = "".join(chars)
        if candidate != orig:
            return candidate
    return orig  # extremely unlikely fallback (string of all-identical chars)


def gen_ids():
    payment_id = "pay_" + uuid.uuid4().hex[:14].upper()
    order_id = "order_" + uuid.uuid4().hex[:14].upper()
    utr = "UTR" + "".join(random.choices("0123456789", k=12))
    return payment_id, order_id, utr


def pick_category(messiness):
    preset = MESSINESS_PRESETS[messiness]
    r = random.random()
    cumulative = 0.0
    for cat, prob in preset.items():
        cumulative += prob
        if r < cumulative:
            return cat
    return "EXACT_MATCH"


def generate_batch(n, messiness, seed, adversarial_extra=0):
    random.seed(seed)
    fake.seed_instance(seed)

    settlement_rows = []
    ledger_rows = []
    ground_truth = []  # one row per "true" transaction, records what happened to it

    base_date = datetime(2026, 7, 1)

    for i in range(n):
        payment_id, order_id, utr = gen_ids()
        true_amount = rand_amount()
        fee, tax = rand_fee(true_amount)
        net_amount = round(true_amount - fee - tax, 2)

        created_at = base_date + timedelta(
            days=random.randint(0, 45), hours=random.randint(0, 23)
        )
        # normal settlement cycle: T+2 typical for Razorpay
        settled_at = created_at + timedelta(days=2, hours=random.randint(0, 12))

        customer_id = "cust_" + uuid.uuid4().hex[:10]

        category = pick_category(messiness)

        # Defaults — the "true" clean pair
        settlement_row = {
            "payment_id": payment_id,
            "order_id": order_id,
            "utr": utr,
            "amount": net_amount,
            "fee": fee,
            "tax": tax,
            "created_at": created_at.isoformat(),
            "settled_at": settled_at.isoformat(),
            "status": random.choice(STATUS_CHOICES_SETTLEMENT),
        }
        ledger_row = {
            "order_id": order_id,
            "amount": true_amount,
            "created_at": created_at.isoformat(),
            "customer_id": customer_id,
            "status": random.choice(STATUS_CHOICES_LEDGER),
        }

        gt = {
            "true_txn_id": i,
            "payment_id": payment_id,
            "order_id": order_id,
            "true_order_id_in_settlement": order_id,  # may get corrupted below
            "category": category,
            "is_match": True,
        }

        # --- Apply mutation based on category ---
        if category == "EXACT_MATCH":
            pass  # both rows already agree

        elif category == "AMOUNT_MISMATCH":
            # simulate a fee/tax miscalculation upstream
            drift = round(random.uniform(10, 150) * random.choice([-1, 1]), 2)
            settlement_row["amount"] = round(net_amount + drift, 2)
            gt["is_match"] = True  # still the *same* transaction, just a value mismatch
            gt["amount_diff"] = drift

        elif category == "MISSING_IN_LEDGER":
            # settlement exists, ledger record dropped entirely
            ledger_row = None
            gt["is_match"] = False
            gt["reason"] = "no corresponding ledger entry (unrecorded order)"

        elif category == "MISSING_IN_SETTLEMENT":
            # ledger exists, settlement not yet paid out (still within/near SLA)
            settlement_row = None
            gt["is_match"] = False
            gt["reason"] = "settlement pending (T+2 cycle not yet elapsed at batch cutoff)"

        elif category == "DUPLICATE":
            # duplicate settlement row for the same payment
            settlement_rows.append(dict(settlement_row))  # first copy
            dup = dict(settlement_row)
            dup["payment_id"] = payment_id  # same id -> duplicate key
            settlement_rows.append(dup)
            gt["is_match"] = True
            gt["reason"] = "duplicate settlement entry (same payment_id twice)"
            ledger_rows.append(ledger_row)
            ground_truth.append(gt)
            continue  # skip default append below, already handled

        elif category == "DATE_DRIFT":
            # settled way outside the normal T+2 window (bank delay)
            settled_at = created_at + timedelta(days=random.randint(6, 14))
            settlement_row["settled_at"] = settled_at.isoformat()
            gt["is_match"] = True
            gt["reason"] = "settlement date drifted outside expected T+2 window"

        elif category == "ID_AMBIGUOUS":
            # typo in order_id on the settlement side -> fuzzy match required
            corrupted = transpose_digits(order_id)
            settlement_row["order_id"] = corrupted
            gt["true_order_id_in_settlement"] = corrupted
            gt["is_match"] = True
            gt["reason"] = "order_id corrupted (typo) on settlement side, needs fuzzy match"

        if settlement_row is not None:
            settlement_rows.append(settlement_row)
        if ledger_row is not None:
            ledger_rows.append(ledger_row)
        ground_truth.append(gt)

    # --- Layer in adversarial edge cases for stress batches ---
    if adversarial_extra > 0:
        for j in range(adversarial_extra):
            payment_id, order_id, utr = gen_ids()
            true_amount = rand_amount()
            fee, tax = rand_fee(true_amount)
            net_amount = round(true_amount - fee - tax, 2)
            created_at = base_date + timedelta(days=random.randint(0, 45))
            settled_at = created_at + timedelta(days=2)
            customer_id = "cust_" + uuid.uuid4().hex[:10]

            # Weighted, not uniform: "near_identical_amount_different_order" is
            # the documented data-starved sub-pattern (eval_report.json:
            # only 12 examples in the original 40-adversarial-record stress
            # batch, model caught 4/12). Doubling its weight relative to the
            # other three case types gives the classifier real signal to
            # learn from instead of noise on a tiny sample.
            case_type = random.choices(
                ["near_identical_amount_different_order", "multi_currency_symbol_noise",
                 "partial_refund_amount", "split_settlement"],
                weights=[0.4, 0.2, 0.2, 0.2],
            )[0]

            if case_type == "near_identical_amount_different_order":
                order_id_2 = "order_" + uuid.uuid4().hex[:14].upper()
                ledger_rows.append({
                    "order_id": order_id, "amount": true_amount,
                    "created_at": created_at.isoformat(), "customer_id": customer_id,
                    "status": "completed",
                })
                ledger_rows.append({
                    "order_id": order_id_2, "amount": true_amount + 0.50,
                    "created_at": created_at.isoformat(), "customer_id": customer_id,
                    "status": "completed",
                })
                settlement_rows.append({
                    "payment_id": payment_id, "order_id": order_id, "utr": utr,
                    "created_at": created_at.isoformat(),
                    "amount": net_amount, "fee": fee, "tax": tax,
                    "settled_at": settled_at.isoformat(), "status": "settled",
                })
                ground_truth.append({
                    "true_txn_id": f"adv_{j}", "payment_id": payment_id,
                    "order_id": order_id, "true_order_id_in_settlement": order_id,
                    "category": "ID_AMBIGUOUS", "is_match": True,
                    "reason": "adversarial: near-duplicate amount on a different order, false-match risk",
                })

            elif case_type == "partial_refund_amount":
                refund_amount = round(net_amount * random.uniform(0.2, 0.6), 2)
                settlement_rows.append({
                    "payment_id": payment_id, "order_id": order_id, "utr": utr,
                    "created_at": created_at.isoformat(),
                    "amount": refund_amount, "fee": 0, "tax": 0,
                    "settled_at": settled_at.isoformat(), "status": "settled",
                })
                ledger_rows.append({
                    "order_id": order_id, "amount": true_amount,
                    "created_at": created_at.isoformat(), "customer_id": customer_id,
                    "status": "completed",
                })
                ground_truth.append({
                    "true_txn_id": f"adv_{j}", "payment_id": payment_id,
                    "order_id": order_id, "true_order_id_in_settlement": order_id,
                    "category": "AMOUNT_MISMATCH", "is_match": True,
                    "reason": "adversarial: partial refund settled, amount legitimately smaller",
                })

            elif case_type == "split_settlement":
                pid2, _, utr2 = gen_ids()
                half1 = round(net_amount * 0.5, 2)
                half2 = round(net_amount - half1, 2)
                settlement_rows.append({
                    "payment_id": payment_id, "order_id": order_id, "utr": utr,
                    "created_at": created_at.isoformat(),
                    "amount": half1, "fee": fee / 2, "tax": tax / 2,
                    "settled_at": settled_at.isoformat(), "status": "settled",
                })
                settlement_rows.append({
                    "payment_id": pid2, "order_id": order_id, "utr": utr2,
                    "created_at": created_at.isoformat(),
                    "amount": half2, "fee": fee / 2, "tax": tax / 2,
                    "settled_at": (settled_at + timedelta(days=1)).isoformat(), "status": "settled",
                })
                ledger_rows.append({
                    "order_id": order_id, "amount": true_amount,
                    "created_at": created_at.isoformat(), "customer_id": customer_id,
                    "status": "completed",
                })
                # Both settlement payment_ids resolve to the same order — each
                # needs its own ground truth row, or the second one is an
                # orphan with no label when joined for training later.
                ground_truth.append({
                    "true_txn_id": f"adv_{j}a", "payment_id": payment_id,
                    "order_id": order_id, "true_order_id_in_settlement": order_id,
                    "category": "AMOUNT_MISMATCH", "is_match": True,
                    "reason": "adversarial: one order split across two settlement payments (part 1 of 2)",
                })
                ground_truth.append({
                    "true_txn_id": f"adv_{j}b", "payment_id": pid2,
                    "order_id": order_id, "true_order_id_in_settlement": order_id,
                    "category": "AMOUNT_MISMATCH", "is_match": True,
                    "reason": "adversarial: one order split across two settlement payments (part 2 of 2)",
                })

            else:  # multi_currency_symbol_noise
                settlement_rows.append({
                    "payment_id": payment_id, "order_id": order_id, "utr": utr,
                    "created_at": created_at.isoformat(),
                    "amount": net_amount, "fee": fee, "tax": tax,
                    "settled_at": settled_at.isoformat(), "status": "settled",
                    "_inject_currency_noise": True,
                })
                ledger_rows.append({
                    "order_id": order_id, "amount": true_amount,
                    "created_at": created_at.isoformat(), "customer_id": customer_id,
                    "status": "completed",
                })
                ground_truth.append({
                    # BUGFIX: gross_amount = net_amount + fee + tax, and
                    # net_amount was itself defined as true_amount - fee - tax,
                    # so gross_amount == true_amount exactly (verified: 0.0
                    # diff every time, not just typically). Once the ₹ noise
                    # is stripped, this is a genuine exact match — the case is
                    # testing parser robustness to formatting, not a real
                    # amount discrepancy. Labeling it AMOUNT_MISMATCH taught
                    # the model to distrust correctly-cleaned exact matches.
                    "true_txn_id": f"adv_{j}", "payment_id": payment_id,
                    "order_id": order_id, "true_order_id_in_settlement": order_id,
                    "category": "EXACT_MATCH", "is_match": True,
                    "reason": "adversarial: currency symbol noise in amount field; correctly parses to an exact match",
                })

    random.shuffle(settlement_rows)
    random.shuffle(ledger_rows)

    return settlement_rows, ledger_rows, ground_truth


def write_csv(rows, path, fieldnames):
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=500, help="number of base transactions")
    parser.add_argument("--messiness", choices=["clean", "realistic", "stress"], default="realistic")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=str, default="batch_realistic")
    parser.add_argument("--adversarial", type=int, default=0,
                         help="extra adversarial edge-case records (stress batches only)")
    args = parser.parse_args()

    out_dir = os.path.join(os.path.dirname(__file__), "data", args.out)
    os.makedirs(out_dir, exist_ok=True)

    settlement_rows, ledger_rows, ground_truth = generate_batch(
        args.n, args.messiness, args.seed, adversarial_extra=args.adversarial
    )

    # Convert internal settlement rows to Razorpay's real Settlement Recon API
    # schema right before writing — the exception-injection logic above never
    # has to know about real field names, units, or the extra realism fields.
    settlement_batch_ids = {}
    real_schema_settlement_rows = [
        to_real_settlement_schema(row, settlement_batch_ids) for row in settlement_rows
    ]

    write_csv(
        real_schema_settlement_rows,
        os.path.join(out_dir, "settlement.csv"),
        REAL_SETTLEMENT_FIELDNAMES,
    )
    write_csv(
        ledger_rows,
        os.path.join(out_dir, "ledger.csv"),
        ["order_id", "amount", "created_at", "customer_id", "status"],
    )
    with open(os.path.join(out_dir, "ground_truth.json"), "w") as f:
        json.dump(ground_truth, f, indent=2)

    # quick summary
    from collections import Counter
    cat_counts = Counter(g["category"] for g in ground_truth)
    print(f"\nBatch: {args.out}")
    print(f"  Base transactions: {args.n}  |  Adversarial extras: {args.adversarial}")
    print(f"  Settlement rows written: {len(settlement_rows)}")
    print(f"  Ledger rows written:     {len(ledger_rows)}")
    print(f"  Ground truth records:    {len(ground_truth)}")
    print("  Category breakdown:")
    for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        pct = 100 * count / len(ground_truth)
        print(f"    {cat:<24} {count:>4}  ({pct:5.1f}%)")
    print(f"\n  Files written to: {out_dir}\n")


if __name__ == "__main__":
    main()

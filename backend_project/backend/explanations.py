"""
Verity — Exception Explanations
==================================
Template-based plain-English explanations, generated at scoring time so
every exception has one immediately without an LLM call per row (would be
slow and costly at batch scale). Day 5's Ask Verity agent handles the
open-ended, conversational layer on top of this — these templates are the
deterministic baseline every exception always has.
"""


def _fmt(val, prefix="₹"):
    """Formats a currency value, or returns a safe placeholder if missing —
    a None slipping through should degrade the message, not crash the request."""
    return f"{prefix}{val:,.2f}" if isinstance(val, (int, float)) else "an unknown amount"


def explain(category: str, payment_id: str, settlement_order_id: str, ledger_order_id: str, details: dict, confidence) -> str:
    if category == "EXACT_MATCH":
        return f"Payment {payment_id} matches ledger order {ledger_order_id} exactly — no action needed."

    if category == "AMOUNT_MISMATCH":
        diff = details.get("diff")
        settlement_amt = details.get("settlement_amount")
        ledger_amt = details.get("ledger_amount")
        direction = "higher than" if (diff or 0) > 0 else "lower than"
        diff_str = _fmt(abs(diff)) if isinstance(diff, (int, float)) else "an unknown amount"
        return (
            f"Settlement amount {_fmt(settlement_amt)} is {direction} ledger amount "
            f"{_fmt(ledger_amt)} for order {ledger_order_id} (difference: {diff_str}). "
            f"Likely a fee/tax calculation mismatch or a partial refund — worth a manual check."
        )

    if category == "MISSING_IN_LEDGER":
        return (
            f"Payment {payment_id} (order {settlement_order_id}) has a settlement record but no "
            f"matching entry in the internal ledger. This usually means the order was "
            f"never recorded, or was recorded under a different ID — escalate to finance."
        )

    if category == "MISSING_IN_SETTLEMENT":
        return (
            f"Ledger order {ledger_order_id} has no matching settlement yet. If this is within "
            f"the normal T+2 settlement window it's likely just pending; if it's older, "
            f"it may indicate a failed or stuck payout."
        )

    if category == "DUPLICATE":
        return (
            f"Payment {payment_id} appears more than once in the settlement report for "
            f"the same order {settlement_order_id}. Likely a duplicate entry from the source system — "
            f"de-duplicate before reconciling further."
        )

    if category == "DATE_DRIFT":
        days = details.get("date_diff_days")
        days_str = f"{days:.1f}" if isinstance(days, (int, float)) else "an unusual number of"
        return (
            f"Payment {payment_id} settled {days_str} days after the order was created for "
            f"{ledger_order_id or settlement_order_id}, outside the normal T+2 settlement window. Could be a bank delay — "
            f"worth confirming it isn't stuck."
        )

    if category == "ID_AMBIGUOUS":
        match_type = details.get("match_type")
        similarity = details.get("id_similarity")
        margin = details.get("id_similarity_margin")
        competing = details.get("competing_candidates_count") or 0
        closest = details.get("closest_competing_amount_diff_pct")
        if match_type == "exact" and settlement_order_id == ledger_order_id:
            if closest is not None and closest < 0.02:
                return (
                    f"Payment {payment_id} has an exact order-ID match ({ledger_order_id}), but another ledger "
                    f"entry has a very similar amount ({closest:.2%} away). Verity flagged a false-match risk "
                    f"rather than an ID typo; please confirm the exact ledger pairing."
                )
            return (
                f"Payment {payment_id} has an exact order-ID match ({ledger_order_id}), but competing "
                f"candidate evidence makes the pairing unsafe to auto-classify. Please confirm the ledger pairing."
            )
        sim_text = f"{similarity:.0%}" if isinstance(similarity, (int, float)) else "high"
        margin_text = f"; runner-up gap {margin:.0%}" if isinstance(margin, (int, float)) else ""
        return (
            f"Payment {payment_id}'s settlement order ID ({settlement_order_id}) did not exactly match a ledger "
            f"order. {ledger_order_id} was the closest candidate (ID similarity {sim_text}{margin_text}). "
            f"Please confirm the pairing before resolving it."
        )

    return f"Payment {payment_id} flagged as {category} — needs manual review."

"""
Verity — Shared Q&A Retrieval Logic
======================================

Retrieval and prompt-building logic used by BOTH agent.py (Claude) and
gemini_agent.py (Gemini). Deliberately provider-agnostic — building a
prompt string is the same problem regardless of which model answers it,
and duplicating this across two files would risk them drifting apart as
one gets improved and the other doesn't.

See agent.py's docstring for the architecture rationale (single-call,
context-stuffed design vs. multi-turn tool use).
"""

import json
import re

MAX_EXCEPTIONS_IN_CONTEXT = 40  # bounded regardless of batch size


def extract_id_mentions(question: str):
    """Looks for payment_/order_ id-shaped tokens in the question so we can
    do precise retrieval instead of always falling back to sampling."""
    return re.findall(r"(?:pay|order)_[A-Za-z0-9]+", question, flags=re.IGNORECASE)


def select_relevant_exceptions(exceptions: list, question: str):
    mentioned_ids = extract_id_mentions(question)
    if mentioned_ids:
        matches = [
            e for e in exceptions
            if any(mid.lower() in (str(e.get("payment_id", "")) + str(e.get("order_id", ""))).lower()
                   for mid in mentioned_ids)
        ]
        if matches:
            return matches[:MAX_EXCEPTIONS_IN_CONTEXT]

    # No specific ID mentioned (or none matched) — sample representatively
    # across categories rather than just taking the first N, so a general
    # question like "what's going wrong?" sees every category at least once.
    by_category = {}
    for e in exceptions:
        by_category.setdefault(e["category"], []).append(e)

    sample = []
    per_category_cap = max(1, MAX_EXCEPTIONS_IN_CONTEXT // max(1, len(by_category)))
    for cat, items in by_category.items():
        sample.extend(items[:per_category_cap])
    return sample[:MAX_EXCEPTIONS_IN_CONTEXT]


def build_prompt(summary: dict, relevant_exceptions: list, question: str) -> str:
    context = {
        "batch_summary": summary,
        "exceptions_shown": relevant_exceptions,
        "note": (
            f"exceptions_shown may be a filtered/sampled subset of the batch's "
            f"full exception list (total exceptions in batch: "
            f"{sum(summary.get('exceptions_by_category', {}).values())}), "
            f"not necessarily all of them."
        ),
    }
    return (
        "You are Verity, a reconciliation assistant for Razorpay settlement data. "
        "Answer the user's question using ONLY the batch data below. If the data "
        "doesn't contain what's needed to answer, say so plainly rather than guessing.\n\n"
        f"BATCH DATA:\n{json.dumps(context, indent=2, default=str)}\n\n"
        f"QUESTION: {question}\n\n"
        "Respond with ONLY a JSON object, no other text, no markdown fences:\n"
        '{"answer": "<your answer, concise, plain English>", '
        '"referenced_exception_ids": ["<exception_id>", ...]}\n'
        "referenced_exception_ids should list exception_ids from exceptions_shown that "
        "your answer actually relies on — empty list if none are relevant."
    )


def parse_json_response(raw_text: str) -> dict:
    """Shared defensive parsing — models sometimes wrap JSON in code fences
    despite being asked not to, or occasionally return prose instead."""
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(cleaned)
        return {
            "answer": parsed.get("answer", "I couldn't generate a clear answer from the batch data."),
            "referenced_exception_ids": parsed.get("referenced_exception_ids", []),
        }
    except json.JSONDecodeError:
        return {"answer": raw_text.strip() or "I couldn't process that question.", "referenced_exception_ids": []}

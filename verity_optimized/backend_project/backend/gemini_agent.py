"""
Verity — Ask Verity Agent (Gemini)
=====================================

Same architecture and retrieval logic as agent.py (Claude) — see that
file's docstring for the design rationale — but calls Google's Gemini API
instead. This exists as a genuinely free path: Google AI Studio issues
API keys with no credit card and no expiration on the Flash-tier models,
unlike Anthropic's and xAI's one-time trial-credit model.

Model name note, worth flagging rather than burying: Google's Flash
lineup is moving fast as of mid-2026 (multiple new Flash versions shipped
in the months before this was written), and different sources disagree
on exactly which are free-tier right now. GEMINI_MODEL below is pinned to
"gemini-2.5-flash" — a well-established, consistently free-tier model at
time of writing — specifically to avoid hardcoding something newer that
might get deprecated or shift tiers under you. If it's unavailable when
you set this up, check Google AI Studio's model picker for whatever is
currently free and update the constant below; nothing else in this file
needs to change.

Requires GEMINI_API_KEY (get one free at aistudio.google.com — see the
project README for the exact steps). Fails with a clear, catchable error
if it isn't set. Like agent.py, this was written without a live key
available in the build environment to test against — the retrieval logic
is shared and already verified (see qa_shared.py), but the live Gemini
call itself needs your own key to exercise.
"""

import os

from google import genai

import qa_shared

GEMINI_MODEL = "gemini-2.5-flash"  # see model name note above before changing

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Get a free key (no credit card) at "
                "aistudio.google.com, then set it as an environment variable "
                "before starting the server."
            )
        _client = genai.Client(api_key=api_key)
    return _client


def ask(batch_id: str, question: str, summary: dict, exceptions: list) -> dict:
    relevant = qa_shared.select_relevant_exceptions(exceptions, question)
    prompt = qa_shared.build_prompt(summary, relevant, question)

    client = _get_client()
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )

    raw_text = response.text or ""
    return qa_shared.parse_json_response(raw_text)

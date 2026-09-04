"""
Verity — Ask Verity Agent (Claude)
=====================================

Answers free-text questions about a batch's reconciliation results using
Claude. Design note on architecture, worth being upfront about: this is a
single-call, context-stuffed design (retrieve relevant exceptions, embed
them in one prompt, ask for structured JSON back) rather than a multi-turn
tool-use loop with separate get_exception_detail/explain_exception tools.
At this data scale (a batch's exceptions comfortably fit in a few thousand
tokens once filtered), a tool-use loop would add latency and complexity
without changing what the agent can actually answer. A natural v2 — if
batches grew to thousands of exceptions or needed cross-batch queries —
would move to real tool use so the agent can page through data instead of
needing it all pre-loaded.

Retrieval/prompt-building logic lives in qa_shared.py, shared with
gemini_agent.py — see that file for the retrieval design.

Requires ANTHROPIC_API_KEY to be set in the environment. Fails with a
clear, catchable error if it isn't — this file was written without a live
key available to test against (see backend README note), so the retrieval
and prompt-construction logic was verified directly, but the actual live
Claude call needs your own key to exercise.
"""

import os

from anthropic import Anthropic

import qa_shared

MODEL = "claude-sonnet-5"

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Ask Verity needs your own Anthropic API key — "
                "set it as an environment variable before starting the server."
            )
        _client = Anthropic(api_key=api_key)
    return _client


def ask(batch_id: str, question: str, summary: dict, exceptions: list) -> dict:
    relevant = qa_shared.select_relevant_exceptions(exceptions, question)
    prompt = qa_shared.build_prompt(summary, relevant, question)

    client = _get_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw_text = "".join(block.text for block in response.content if block.type == "text")
    return qa_shared.parse_json_response(raw_text)

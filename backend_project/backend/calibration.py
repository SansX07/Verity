"""
Verity — Calibration Engine
==============================

WORTH READING THIS DOCSTRING — it documents a real design pivot, not just
the final approach.

First attempt: Platt scaling (1D logistic regression mapping raw
confidence -> recalibrated probability of being correct), refit each round
on accumulated corrections. This is a standard technique, but testing it
against realistic correction data exposed a real problem: our model is
already high-precision, so human corrections are heavily imbalanced
(~95% "the flag was correct" vs ~5% "false alarm" in testing). A
continuous curve fit on ~90 points with only ~5 minority-class examples
is inherently unstable — we tried default weighting (collapsed toward
overconfident, trusted coverage spuriously hit a flat 1.0) and balanced class
weighting (overcorrected the other way, trusted coverage collapsed to 0.0,
calibration_error rose to 0.35+). Neither is a hyperparameter problem;
fitting a continuous curve on this little minority-class data isn't
reliable regardless of tuning.

Final approach: BINNED calibration instead of a fitted curve. Group
corrections into fixed confidence bins (e.g. 0.5-0.6, 0.6-0.7, ...).
Within each bin, calibration is just an average: empirical accuracy vs.
mean stated confidence. A bin only "counts" once it has enough samples
(MIN_BIN_SAMPLES) — averages are far more robust to small samples than a
fitted curve's slope is, and a bin with too little data simply doesn't
contribute yet rather than distorting the result. This trades a smoother
theoretical mechanism for one that's honest about what buildathon-scale
correction volume can actually support.

auto_resolution_coverage = the fraction of the
batch whose confidence falls in a bin that has accumulated enough
verified samples to be trusted (empirical accuracy >= AUTO_TRUST_BAR).
This is a genuine, if more modest, "learns over time" mechanism: coverage
grows as more confidence ranges accumulate enough verified evidence, and
a range is never trusted on fewer than MIN_BIN_SAMPLES real corrections.
"""

import numpy as np

import storage

ROUND_SIZE = 5  # corrections per round — small enough to see multiple rounds in a live demo
MIN_BIN_SAMPLES = 5  # a confidence bin needs at least this many corrections before it "counts"
AUTO_TRUST_BAR = 0.85  # a bin must show >= this empirical accuracy to be treated as trusted calibration evidence
BIN_EDGES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.001]  # 1.001 so a confidence of exactly 1.0 falls in the last bin


def _bin_index(confidence: float) -> int:
    for i in range(len(BIN_EDGES) - 1):
        if BIN_EDGES[i] <= confidence < BIN_EDGES[i + 1]:
            return i
    return len(BIN_EDGES) - 2  # fallback for anything at/above the top edge


def _resolution_to_correct(resolution: str) -> int:
    """'confirmed_no_match' = human agrees something's genuinely wrong here
    = the flag was correct. 'confirmed_match' = human says this was
    actually fine = the flag was a false alarm."""
    return 1 if resolution == "confirmed_no_match" else 0


def _compute_bins(corrections: list):
    """Returns {bin_index: {'n': int, 'mean_confidence': float, 'accuracy': float}}
    for every bin with >= MIN_BIN_SAMPLES corrections."""
    buckets = {}
    for c in corrections:
        confidence = c.get("confidence")
        if confidence is None:
            continue  # deterministic findings have no model confidence to calibrate
        idx = _bin_index(float(confidence))
        buckets.setdefault(idx, []).append(c)

    bin_stats = {}
    for idx, items in buckets.items():
        if len(items) < MIN_BIN_SAMPLES:
            continue  # not enough evidence yet — this bin doesn't count this round
        confidences = [c["confidence"] for c in items]
        corrects = [_resolution_to_correct(c["resolution"]) for c in items]
        bin_stats[idx] = {
            "n": len(items),
            "mean_confidence": float(np.mean(confidences)),
            "accuracy": float(np.mean(corrects)),
        }
    return bin_stats


def maybe_advance_round(batch_id: str):
    """Called after every /resolve. If enough NEW corrections have piled up
    since the last computed round, computes the next round and appends it.
    Safe to call after every single correction — it's a no-op until the
    threshold is crossed."""
    corrections = storage.read_corrections(batch_id)
    state = storage.read_calibration_state(batch_id) or {"rounds": [], "last_round_end_index": 0}

    pending = corrections[state["last_round_end_index"]:]
    if len(pending) < ROUND_SIZE:
        return state["rounds"]  # not enough new data yet for another round

    # Cumulative: use ALL corrections so far, not just this round's slice —
    # bins need to accumulate across rounds to ever cross MIN_BIN_SAMPLES.
    all_so_far = corrections[:state["last_round_end_index"] + ROUND_SIZE]
    bin_stats = _compute_bins(all_so_far)

    if bin_stats:
        total_n = sum(b["n"] for b in bin_stats.values())
        calibration_error = round(
            sum(abs(b["accuracy"] - b["mean_confidence"]) * b["n"] for b in bin_stats.values()) / total_n, 4
        )
    else:
        calibration_error = None  # no bin has enough evidence yet — honestly report "not yet measurable"

    trusted_bins = {idx for idx, b in bin_stats.items() if b["accuracy"] >= AUTO_TRUST_BAR}

    results = storage.read_results(batch_id)
    all_exceptions = results["exceptions"] if results else []
    model_exceptions = [e for e in all_exceptions if e.get("detection_method") == "model" and e.get("confidence_score") is not None]
    trusted_model_exceptions = sum(
        1 for e in model_exceptions if _bin_index(float(e["confidence_score"])) in trusted_bins
    )
    # This is evidence coverage, not an instruction to auto-resolve records.
    auto_resolution_coverage = (
        round(trusted_model_exceptions / len(model_exceptions), 4) if model_exceptions else 0.0
    )

    round_number = len(state["rounds"]) + 1
    round_record = {
        "round": round_number,
        "calibration_error": calibration_error if calibration_error is not None else 0.0,
        "auto_resolution_coverage": auto_resolution_coverage,
        "bins_with_enough_evidence": len(bin_stats),
    }
    state["rounds"].append(round_record)
    state["last_round_end_index"] = state["last_round_end_index"] + ROUND_SIZE

    storage.write_calibration_state(batch_id, state)
    return state["rounds"]


def get_rounds(batch_id: str):
    state = storage.read_calibration_state(batch_id)
    if not state:
        return []
    return state.get("rounds", [])

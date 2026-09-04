"""
Verity — Correction Simulation
=================================

Seeds realistic calibration history by simulating a human reviewer working
through a batch's exception queue. This is a methodology tool, not a
shortcut around the real mechanism: every correction goes through the
actual POST /exceptions/{id}/resolve endpoint, exactly as a click in the
frontend would. The only thing "simulated" is WHO makes the decision —
here, ground truth stands in as an oracle reviewer, since our synthetic
batches know the true answer for every row. A live demo where a person
clicks through resolutions in the UI exercises the identical code path.

This is why it's honest to disclose plainly (and worth doing so in your
submission): the calibration MECHANISM is real (Platt scaling fit on
accumulated corrections, evaluated out-of-sample each round — see
calibration.py); this script just supplies corrections fast enough to see
multiple rounds without manually clicking ~20 times.

Usage:
    python simulate_corrections.py --batch-id batch_d2da0223d211 \
        --ground-truth ../data/batch_holdout/ground_truth.json \
        --api http://localhost:8000
"""

import argparse
import json
import random
import time

import requests


def simulate(batch_id: str, ground_truth_path: str, api_base: str, seed: int = 42):
    with open(ground_truth_path) as f:
        ground_truth = json.load(f)
    gt_by_payment = {g["payment_id"]: g["category"] for g in ground_truth if g.get("payment_id")}

    resp = requests.get(f"{api_base}/api/batch/{batch_id}/exceptions")
    resp.raise_for_status()
    exceptions = resp.json()["exceptions"]

    # Only pair-based exceptions carry a meaningful model confidence to
    # calibrate — structural exceptions (MISSING_IN_*) are deterministic
    # (confidence always 1.0) and would just dilute the signal.
    resolvable = [e for e in exceptions if e.get("payment_id") in gt_by_payment and e["status"] == "open"]
    random.Random(seed).shuffle(resolvable)

    print(f"Simulating review of {len(resolvable)} exceptions for batch {batch_id}...\n")

    for i, exc in enumerate(resolvable, 1):
        true_category = gt_by_payment[exc["payment_id"]]
        # Oracle logic: if ground truth says this was actually a clean match,
        # the model's flag was a false alarm -> "confirmed_match" (it's fine).
        # Otherwise the model correctly caught a real issue -> "confirmed_no_match".
        resolution = "confirmed_match" if true_category == "EXACT_MATCH" else "confirmed_no_match"

        r = requests.post(
            f"{api_base}/api/exceptions/{exc['exception_id']}/resolve",
            json={"resolution": resolution, "note": "simulated oracle review"},
        )
        r.raise_for_status()

        if i % 5 == 0:
            cal = requests.get(f"{api_base}/api/batch/{batch_id}/calibration").json()
            rounds = cal["rounds"]
            if rounds:
                latest = rounds[-1]
                print(f"  [{i} resolved] Round {latest['round']}: "
                      f"calibration_error={latest['calibration_error']}, "
                      f"match_rate={latest['match_rate']}")

    print("\nFinal calibration history:")
    cal = requests.get(f"{api_base}/api/batch/{batch_id}/calibration").json()
    for r in cal["rounds"]:
        print(f"  Round {r['round']}: calibration_error={r['calibration_error']}, match_rate={r['match_rate']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--ground-truth", required=True)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    simulate(args.batch_id, args.ground_truth, args.api, args.seed)

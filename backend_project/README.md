# Verity — Setup & Run

## Data schema note: aligned to Razorpay's real Settlement Recon API

`settlement.csv`'s columns match Razorpay's actual Settlement Recon API schema
(razorpay.com/docs/api/settlements/fetch-recon/) exactly — `entity_id`, `type`,
`debit`, `credit`, `amount` (gross, in **paise** not rupees), `fee`, `tax`,
`settlement_utr`, `card_network`, `card_issuer`, `dispute_id`, etc. — rather
than an invented schema. `ledger.csv` deliberately keeps a simple internal
schema, since it represents your own company's proprietary system, which has
no external standard to align to (every merchant's ledger looks different).

This alignment only touches the data-generation and ingestion layer
(`generate_data.py`'s `to_real_settlement_schema()`, `match_engine.py`'s
`load_batch()`) — the exception-injection logic, ML features, API contract,
and frontend are all completely unchanged. Verified after the change: same
class balance, same feature-separation pattern, identical model metrics
(macro F1 0.9708), and a live end-to-end test through the full stack.

Real settlement data can't be pulled from Razorpay's test-mode API for this
project — settlement is fundamentally the process of moving real captured
money to your bank account, and test mode never has real money, so Razorpay's
settlement engine never runs against test transactions. Confirmed from
Razorpay's own docs, not assumed. Schema alignment is the honest way to get
the realism benefit without a live integration that isn't actually possible.

## Known gotcha: "corrupted" model files on a new machine

If `models/*.joblib` fails to load with an unpickling error (or you see a
scikit-learn `InconsistentVersionWarning`) after moving this project to a new
machine, it's very likely NOT actual file corruption — it's a scikit-learn/
xgboost version mismatch between the machine that trained the model and the
one loading it now. Pickled sklearn/xgboost models aren't guaranteed
compatible across library versions, and different machines' `pip install`
can resolve to different versions.

**Fix:** regenerate the model files locally instead of troubleshooting the
transferred `.joblib` files:
```bash
python build_training_set.py
python train_model.py
```
This retrains on the same data using your own environment's library versions,
so there's no cross-version mismatch. This is exactly what resolved it the
one time this came up during setup — metrics came out identical, just
repackaged with different (but compatible) library versions.

## Install

```bash
pip install -r requirements.txt
```

## 1. Generate synthetic data (already done — data/ is included)

```bash
python generate_data.py --n 500 --messiness clean      --seed 42  --out batch_clean
python generate_data.py --n 500 --messiness realistic  --seed 43  --out batch_realistic
python generate_data.py --n 500 --messiness stress     --seed 44  --out batch_stress --adversarial 40
python generate_data.py --n 400 --messiness realistic  --seed 777 --out batch_holdout   # NOT used in training — for fair live demo numbers
```

## 2. Run matching engine on each batch (already done — outputs are included)

```bash
python match_engine.py --batch batch_clean
python match_engine.py --batch batch_realistic
python match_engine.py --batch batch_stress
```

## 3. Build training set + train models (already done — models/ is included)

```bash
python build_training_set.py
python train_model.py
```

## 4. Run the API server

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Server starts at `http://localhost:8000`. Check `/health` first.

### Test it manually

```bash
curl -X POST http://localhost:8000/api/batch/upload \
  -F "settlement_file=@../data/batch_holdout/settlement.csv" \
  -F "ledger_file=@../data/batch_holdout/ledger.csv" \
  -F "ground_truth_file=@../data/batch_holdout/ground_truth.json" \
  -F "batch_name=Demo Batch"

# use the returned batch_id:
curl http://localhost:8000/api/batch/{batch_id}/status
curl http://localhost:8000/api/batch/{batch_id}/summary
curl http://localhost:8000/api/batch/{batch_id}/exceptions
```

**Important for the live demo:** upload `batch_holdout` or `batch_holdout_stress`, not
`batch_realistic`/`batch_clean`/`batch_stress`. Those three were used to train the model, so
their precision/recall numbers are partly inflated by the model having seen those exact rows
during training.

`batch_holdout` (realistic messiness, never trained on) — the honest "live accuracy" number
for a typical, lightly-messy batch: **precision 0.9924 / recall 0.9893 / F1 0.9902**, match
rate 74.6%.

`batch_holdout_stress` (stress messiness, never trained on, includes 40 adversarial edge
cases) — the honest number for a genuinely hard batch: **precision 0.9838 / recall 0.9831 /
F1 0.9834**, match rate 42.7%. Match rate is intentionally low here — see "Post-release fixes"
below for why that's a data-generation setting, not a model quality signal.

Both numbers above were verified two ways: directly through `pipeline.process_batch()` and
through the live FastAPI server end-to-end (`/api/batch/upload` → `/summary`), confirming they
agree. The Day 3 test-set metrics in `models/eval_report.json` are the other honest number
(held-out split of the training data itself, currently macro F1 0.9821 on XGBoost).

## 5. Connect the frontend

Point the Verity frontend's API base URL at `http://localhost:8000/api`. All endpoints
match `docs/exception_taxonomy_and_api_contract.md` exactly.

**Not yet implemented:** none — all endpoints from the API contract are live as of Day 5.

## Ask Verity: three tiers, automatic

`/api/qa/ask` tries providers in this order, falling back automatically if one
isn't configured or fails mid-call:

1. **Gemini** (if `GEMINI_API_KEY` is set) — genuinely free, no card, no expiry
2. **Claude** (if `ANTHROPIC_API_KEY` is set) — higher quality, small trial credit only
3. **Local rule-based fallback** (always available) — zero setup, zero cost, handles
   specific ID lookups, match-rate questions, category breakdowns, and general summaries;
   says plainly when a question is outside its scope rather than guessing

You don't need to set up anything to get a working Ask Verity — the local fallback
always works. Setting a key just upgrades it to open-ended natural-language Q&A.

### Getting a free Gemini key (recommended if you want full Q&A without paying)

1. Go to **aistudio.google.com**, sign in with any Google account
2. Click "Get API key" → "Create API key" — no credit card, no billing setup
3. Copy `backend/.env.example` to `backend/.env` and paste your key into the
   `GEMINI_API_KEY=` line (never commit the real `.env` — `.gitignore` already
   excludes it)
4. Note: Google's free tier may use your inputs to improve their models — low-stakes
   here since batches are synthetic data, but worth knowing generally

Model name (`GEMINI_MODEL` in `gemini_agent.py`) is pinned to `gemini-2.5-flash`, a
well-established free-tier model. Google's Flash lineup moves fast — if that model
name is ever unavailable, check Google AI Studio's model picker and update the
constant; nothing else needs to change.

### Getting an Anthropic key instead (if you want Sonnet-quality answers)

See the step-by-step guide covered earlier in this project's chat history, or
platform.claude.com directly. Involves a small trial credit or billing setup.

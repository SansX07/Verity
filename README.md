# Verity — Final Schema-Aligned Project

This is the consolidated Verity project: the **Razorpay-schema-aligned backend/data/model package from the latest `verity_razorpay_schema.zip`** plus the **complete Day 6 frontend integration**.

## Project layout

- `backend_project/` — ingestion, Razorpay-shaped settlement data, matching engine, ML model, API, calibration, explanations, demo datasets.
- `frontend_project/` — React/Vite frontend wired to the real backend API.
- `RAZORPAY_SCHEMA_NOTES.md` — notes describing the external settlement schema alignment.

## Run the backend

```bash
cd backend_project
python -m pip install -r requirements.txt
cd backend
uvicorn main:app --reload --port 8000
```

Health check:

```text
http://localhost:8000/health
```

The backend reads the trained models from `backend_project/models/`. If a new machine has incompatible scikit-learn/XGBoost versions, rebuild them with:

```bash
cd backend_project
python build_training_set.py
python train_model.py
```

Copy `backend_project/backend/.env.example` to `backend_project/backend/.env` only when you need optional provider keys. Do not commit real API keys.

## Run the frontend

In a second terminal:

```bash
cd frontend_project
npm install
npm run dev
```

The frontend API client is configured for:

```text
http://localhost:8000/api
```

So start the backend first.

## Demo data

Schema-aligned sample batches are included under:

```text
backend_project/data/
```

In particular:

- `batch_clean`
- `batch_realistic`
- `batch_stress`
- `batch_holdout`
- `batch_holdout_stress`

The settlement CSVs use the Razorpay-shaped fields while retaining the internal fields required by the reconciliation engine.

## Important validation note

The package is consolidated and statically checked, but a successful live browser/API run should be treated as a separate runtime verification for the exact machine/environment where you demo it.

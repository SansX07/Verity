# Verity — Exception Taxonomy & API Contract

## Exception Taxonomy

| Code | Category | Definition | Typical Resolution |
|---|---|---|---|
| `EXACT_MATCH` | Clean match | Not an exception — settlement and ledger agree | Auto-closed |
| `AMOUNT_MISMATCH` | Amount mismatch | Ledger and settlement amounts differ beyond tolerance | Check fee/tax calc, flag for finance review |
| `MISSING_IN_LEDGER` | Missing in ledger | Settlement exists, no matching internal order | Possible unrecorded order — escalate |
| `MISSING_IN_SETTLEMENT` | Missing in settlement | Order exists, no payout yet | Often just pending — check against settlement cycle SLA before flagging |
| `DUPLICATE` | Duplicate entry | Same payment_id/UTR appears twice | De-dupe, flag source system |
| `DATE_DRIFT` | Date/timing anomaly | Settlement date outside expected T+N window | Check settlement cycle, could be bank delay |
| `ID_AMBIGUOUS` | Low-confidence match | Fuzzy match below auto-accept threshold, multiple candidates | Route to human review queue |

## API Contract

```
POST /api/batch/upload
  Request:  { source_a_file, source_b_file, batch_name }
  Response: { batch_id, status: "processing" }

GET /api/batch/{batch_id}/status
  Response: { batch_id, status, progress_pct, records_processed, records_total }

GET /api/batch/{batch_id}/summary
  Response: {
    batch_id,
    total_records: 62,
    matched: 54,
    match_rate: 0.871,
    precision: 0.94,
    recall: 0.91,
    f1: 0.925,
    exceptions_by_category: {
      "AMOUNT_MISMATCH": 3,
      "MISSING_IN_LEDGER": 2,
      "MISSING_IN_SETTLEMENT": 1,
      "DUPLICATE": 1,
      "DATE_DRIFT": 1,
      "ID_AMBIGUOUS": 0
    }
  }

GET /api/batch/{batch_id}/exceptions
  Response: {
    exceptions: [
      {
        exception_id,
        category: "AMOUNT_MISMATCH",
        payment_id, order_id,
        confidence_score: 0.62,
        details: { ledger_amount, settlement_amount, diff },
        explanation: "Settlement amount ₹1,240 differs from ledger ₹1,200 by ₹40 — likely unrecorded processing fee.",
        status: "open" | "resolved" | "escalated"
      }
    ]
  }

POST /api/exceptions/{exception_id}/resolve
  Request:  { resolution: "confirmed_match" | "confirmed_no_match", note }
  Response: { exception_id, status: "resolved" }
  # Feeds the calibration loop — every call here logs a labeled correction

POST /api/qa/ask
  Request:  { batch_id, question: "Why didn't payment pay_9F2X settle?" }
  Response: { answer, referenced_exception_ids: [...] }

GET /api/batch/{batch_id}/calibration
  Response: {
    rounds: [
      { round: 1, calibration_error: 0.14, match_rate: 0.83 },
      { round: 2, calibration_error: 0.09, match_rate: 0.87 },
      { round: 3, calibration_error: 0.06, match_rate: 0.91 }
    ]
  }
  # Powers the improvement-over-time chart — signature demo moment
```

## Notes

- `confidence_score` and `explanation` live on every exception object, not just the summary — lets the frontend show *why* without extra round-trips.
- `/resolve` doubles as the feedback-loop data source — no separate logging system needed.
- `/calibration` exists as its own endpoint specifically for the self-improving differentiator; should be charted prominently in the UI, not buried.

# Verity Finance Controller

The Finance Controller layer turns completed reconciliation output into deterministic, evidence-based actions:

- reports auto-reconciliation rate and open exceptions
- estimates review exposure from actual exception amounts/differences
- highlights high-value exceptions (>= ₹10,000)
- prioritizes categories in finance-risk order
- recommends the next action without claiming autonomous financial decisions

API: `GET /api/batch/{batch_id}/finance-controller`

This layer does not alter matching, ML models, or evaluation metrics.

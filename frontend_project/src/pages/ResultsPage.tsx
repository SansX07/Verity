import { useEffect, useState } from "react";
import { Page } from "../App";
import { useAppState } from "../lib/AppContext";
import { api, BatchSummary, ExceptionItem } from "../lib/api";
import { formatRupees, formatDiff, CATEGORY_LABELS } from "../lib/format";

interface Props { navigate: (p: Page) => void; }

const CAT_COLORS: Record<string, string> = {
  AMOUNT_MISMATCH:       "var(--amber-text)",
  MISSING_IN_LEDGER:     "var(--red-text)",
  MISSING_IN_SETTLEMENT: "var(--purple-text)",
  DUPLICATE:             "var(--blue-text)",
  DATE_DRIFT:            "var(--text-2)",
  ID_AMBIGUOUS:          "var(--text-3)",
};

const BREAKDOWN_ORDER = ["AMOUNT_MISMATCH", "MISSING_IN_LEDGER", "MISSING_IN_SETTLEMENT", "DUPLICATE", "DATE_DRIFT", "ID_AMBIGUOUS"];

function StatusBadge({ s }: { s: "open"|"resolved"|"escalated" }) {
  const cls = { open:"badge-open", resolved:"badge-resolved", escalated:"badge-escalated" }[s];
  const lbl = { open:"Open", resolved:"Resolved", escalated:"Escalated" }[s];
  return <span className={`badge ${cls}`}>{lbl}</span>;
}

function CatBadge({ cat }: { cat: string }) {
  const color = CAT_COLORS[cat] ?? "var(--text-2)";
  const label = CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ");
  return (
    <span className="cat-badge" style={{ color, background: `${color}14`, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

function ConfBar({ v, method }: { v: number | null; method?: string }) {
  if (v === null || v === undefined || method === "deterministic") return <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>Deterministic</span>;
  const pct = Math.round(v * 100);
  if (pct === 0) return <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>—</span>;
  const color = pct >= 75 ? "var(--green-text)" : pct >= 55 ? "var(--amber-text)" : "var(--red-text)";
  return (
    <div className="conf-bar">
      <div className="conf-track">
        <div className="conf-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="mono" style={{ fontSize: 12, color, fontWeight: 500 }}>{pct}%</span>
    </div>
  );
}

function Metric({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div className="tooltip-wrap" style={{ flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>{label}</div>
      <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{value}</span>
      {tip && <span className="tooltip">{tip}</span>}
    </div>
  );
}

export default function ResultsPage({ navigate }: Props) {
  const { batchId, batchName, setSelectedExceptionId } = useAppState();
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId) { setError("No batch selected — start a new reconciliation."); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const [s, e] = await Promise.all([api.getBatchSummary(batchId), api.getBatchExceptions(batchId)]);
        if (cancelled) return;
        setSummary(s);
        setExceptions(e.exceptions);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load results.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [batchId]);

  const openExceptionDetail = (exceptionId: string) => {
    setSelectedExceptionId(exceptionId);
    navigate("exception-detail");
  };

  if (loading) {
    return <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "var(--text-3)" }}>Loading results…</div>;
  }
  if (error || !summary) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 14 }}>
        <div style={{ color: "var(--red-text)", fontSize: 13.5 }}>{error ?? "No data available."}</div>
        <button className="btn btn-gold" onClick={() => navigate("new-reconciliation")}>Start a reconciliation</button>
      </div>
    );
  }

  const openExceptions = exceptions.filter(e => e.status !== "resolved");
  const matchRatePct = Math.round(summary.match_rate * 1000) / 10;
  const nonExact = exceptions.length; // exceptions endpoint already excludes EXACT_MATCH pairs
  const maxBreakdown = Math.max(1, ...BREAKDOWN_ORDER.map(c => summary.exceptions_by_category[c] ?? 0));

  return (
    <div className="page">
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 7 }}>{batchName ?? "Reconciliation batch"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>
            Reconciliation complete
          </h1>
          <span className="badge badge-complete">Complete</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1px 1fr 1px auto" }}>
          <div style={{ padding: "32px 44px 32px 28px" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
              Auto-reconciliation rate
            </div>
            <div className="mono metric-xl" style={{ color: "var(--text)" }}>{matchRatePct}%</div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 8 }}>
              {summary.matched} of {summary.total_records} reconciliation units matched automatically
            </div>
            <div style={{ marginTop: 14, width: 180, height: 3, background: "var(--card-hi)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${matchRatePct}%`, height: "100%", background: "linear-gradient(90deg, var(--green), var(--green-text))", borderRadius: 2 }} />
            </div>
          </div>

          <div className="divider-v" />

          <div style={{ padding: "32px 36px" }}>
            <div style={{ display: "flex", gap: 40, marginBottom: 24 }}>
              {[
                { label: "Matched",  val: String(summary.matched),  color: "var(--green-text)" },
                { label: "Exceptions", val: String(nonExact), color: "var(--amber-text)" },
                { label: "Units",  val: String(summary.total_records),  color: "var(--text-2)" },
              ].map(m => (
                <div key={m.label}>
                  <div className="mono metric-md" style={{ color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 5 }}>{m.label}</div>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: "var(--border-faint)", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 18, fontSize: 10.5, color: "var(--text-3)", marginBottom: 14 }}>
              <span>{summary.settlement_rows} settlement rows</span>
              <span>{summary.ledger_rows} ledger rows</span>
              <span>{summary.candidate_pairs} candidate pairs</span>
              <span>{summary.structural_exceptions} structural exceptions</span>
            </div>

            <div style={{ display: "flex", gap: 32 }}>
              <Metric label="End-to-end precision" value={summary.precision !== null ? `${Math.round(summary.precision * 1000) / 10}%` : "—"} tip="Weighted precision across paired and structural reconciliation outcomes" />
              <Metric label="End-to-end recall"    value={summary.recall !== null ? `${Math.round(summary.recall * 1000) / 10}%` : "—"} tip="Weighted recall across the full reconciliation pipeline" />
              <Metric label="End-to-end F1"  value={summary.f1 !== null ? `${Math.round(summary.f1 * 1000) / 10}%` : "—"} tip="Weighted F1 across all reconciliation units, including structural exceptions" />
            </div>
            {summary.precision === null && (
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 10 }}>
                No ground truth supplied with this batch — end-to-end evaluation metrics are unavailable.
              </div>
            )}
            {summary.precision !== null && (
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 10 }}>
                End-to-end metrics include deterministic missing-record detection. Candidate-pair ML F1: {summary.pair_f1 !== null && summary.pair_f1 !== undefined ? `${Math.round(summary.pair_f1 * 1000) / 10}%` : "—"}.
              </div>
            )}
          </div>

          <div className="divider-v" />

          <div style={{ padding: "32px 28px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
            <button className="btn btn-warn-soft" onClick={() => navigate("exception-detail")} style={{ padding: "9px 18px" }}>
              Review {nonExact} exceptions →
            </button>
            <button className="btn btn-ghost" onClick={() => navigate("ask-verity")}>
              Ask Verity
            </button>
            <button className="btn btn-ghost" onClick={() => navigate("new-reconciliation")}>
              New batch
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>Exception types</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 18 }}>
            {nonExact} total · {openExceptions.length} open
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {BREAKDOWN_ORDER.map(cat => {
              const n = summary.exceptions_by_category[cat] ?? 0;
              const color = CAT_COLORS[cat];
              return (
                <div key={cat}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: n > 0 ? "var(--text-2)" : "var(--text-3)" }}>{CATEGORY_LABELS[cat]}</span>
                    <span className="mono" style={{ fontSize: 12, color: n > 0 ? color : "var(--text-3)" }}>{n}</span>
                  </div>
                  <div style={{ height: 2.5, background: "var(--card-hi)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${(n / maxBreakdown) * 100}%`, height: "100%", background: color, borderRadius: 2, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "11px 20px", borderBottom: "1px solid var(--border-faint)", background: "var(--surface)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>Exceptions</span>
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>Click to investigate</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "100px 155px 90px 90px 90px 82px", columnGap: 12, padding: "0 20px", background: "var(--surface)", borderBottom: "1px solid var(--border-faint)" }}>
            {["Transaction", "Category", "Settlement", "Ledger", "Confidence", "Status"].map(h => (
              <div key={h} className="th">{h}</div>
            ))}
          </div>

          {exceptions.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              No exceptions — every record matched cleanly.
            </div>
          ) : exceptions.map(e => (
            <div
              key={e.exception_id}
              className="trow"
              onClick={() => openExceptionDetail(e.exception_id)}
              style={{ display: "grid", gridTemplateColumns: "100px 155px 90px 90px 90px 82px", columnGap: 12, padding: "0 20px", alignItems: "center" }}
            >
              <div className="td" style={{ overflow: "hidden" }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--gold)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.payment_id ?? e.order_id ?? "—"}>
                  {e.payment_id ?? e.order_id ?? "—"}
                </span>
              </div>
              <div className="td"><CatBadge cat={e.category} /></div>
              <div className="td">
                <span className="mono" style={{ fontSize: 12.5, color: e.details.settlement_amount === null ? "var(--text-3)" : "var(--text)" }}>
                  {formatRupees(e.details.settlement_amount)}
                </span>
              </div>
              <div className="td">
                <span className="mono" style={{ fontSize: 12.5, color: e.details.ledger_amount === null ? "var(--text-3)" : (e.details.diff && e.details.diff !== 0 ? "var(--amber-text)" : "var(--text)") }}>
                  {formatRupees(e.details.ledger_amount)}
                </span>
              </div>
              <div className="td"><ConfBar v={e.confidence_score} method={e.detection_method} /></div>
              <div className="td"><StatusBadge s={e.status} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
        <div style={{ padding: "11px 20px", borderBottom: "1px solid var(--border-faint)", background: "var(--surface)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>Why these records weren't reconciled</span>
          <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>Verity's plain-English explanation for each exception</span>
        </div>
        {openExceptions.slice(0, 5).map((e, i, arr) => (
          <div
            key={e.exception_id}
            className="trow"
            onClick={() => openExceptionDetail(e.exception_id)}
            style={{ display: "flex", alignItems: "baseline", gap: 16, padding: "12px 20px", borderBottom: i < arr.length - 1 ? "1px solid var(--border-faint)" : "none" }}
          >
            <span className="mono" style={{ fontSize: 12, color: "var(--gold)", flexShrink: 0, width: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.payment_id ?? e.order_id ?? "—"}>{e.payment_id ?? e.order_id ?? "—"}</span>
            <CatBadge cat={e.category} />
            {formatDiff(e.details, e.category) !== "—" && (
              <span className="mono" style={{ fontSize: 11.5, color: "var(--amber-text)", background: "var(--amber-bg)", padding: "1px 6px", borderRadius: 2, flexShrink: 0 }}>
                {formatDiff(e.details, e.category)}
              </span>
            )}
            <span style={{ fontSize: 12.5, color: "var(--text-2)", flex: 1, lineHeight: 1.55 }}>{e.explanation}</span>
            <span style={{ fontSize: 11.5, color: "var(--text-3)", flexShrink: 0 }}>Investigate →</span>
          </div>
        ))}
      </div>
    </div>
  );
}

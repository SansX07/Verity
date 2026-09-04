import { useEffect, useState } from "react";
import { Page } from "../App";
import { useAppState } from "../lib/AppContext";
import { api, BatchListItem, CalibrationRound, FinanceController } from "../lib/api";

interface Props { navigate: (p: Page) => void; }

function StatusPill({ status }: { status: string }) {
  if (status === "completed") return <span className="badge badge-complete">Complete</span>;
  if (status === "processing" || status === "queued") return <span className="badge badge-processing">Processing</span>;
  if (status === "failed") return <span className="badge badge-escalated">Failed</span>;
  return <span className="badge badge-review">Needs review</span>;
}

function MiniBar({ value }: { value: number }) {
  const color = value >= 92 ? "var(--green-text)" : value >= 85 ? "var(--amber-text)" : "var(--red-text)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 48, height: 2.5, background: "var(--card-hi)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span className="mono" style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500 }}>{value.toFixed(1)}%</span>
    </div>
  );
}

function KpiTile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div className="mono metric-sm" style={{ color: accent ?? "var(--text)", marginBottom: 8 }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{sub}</div>
    </div>
  );
}

export default function OverviewPage({ navigate }: Props) {
  const { setBatchId, setBatchName } = useAppState();
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [latestRounds, setLatestRounds] = useState<CalibrationRound[]>([]);
  const [controller, setController] = useState<FinanceController | null>(null);
  const [loading, setLoading] = useState(true);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    let cancelled = false;
    api.listBatches().then(async r => {
      if (cancelled) return;
      setBatches(r.batches);
      const latest = r.batches.find(b => b.status === "completed");
      if (latest) {
        try {
          const cal = await api.getCalibration(latest.batch_id);
          if (!cancelled) setLatestRounds(cal.rounds);
          const fc = await api.getFinanceController(latest.batch_id);
          if (!cancelled) setController(fc);
        } catch { /* non-critical, KPI tile just shows 0 */ }
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const openBatch = (b: BatchListItem) => {
    setBatchId(b.batch_id);
    setBatchName(b.batch_name);
    navigate(b.status === "completed" ? "results" : "processing");
  };

  if (loading) {
    return <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "var(--text-3)" }}>Loading…</div>;
  }

  const completed = batches.filter(b => b.status === "completed");
  const latest = completed[0];
  const avgMatchRate = completed.length ? completed.reduce((s, b) => s + (b.match_rate ?? 0), 0) / completed.length * 100 : 0;
  const totalResolved = completed.reduce((s, b) => s + (b.resolved_count ?? 0), 0);

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 36 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.022em", color: "var(--text)", marginBottom: 5 }}>{greeting}.</h1>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>Here's the current state of your reconciliation workspace.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate("new-reconciliation")}>+ New reconciliation</button>
      </div>

      {!latest ? (
        <div className="card" style={{ padding: "48px 32px", textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>No reconciliations yet</div>
          <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>Upload a settlement report and ledger to run your first batch.</p>
          <button className="btn btn-gold" onClick={() => navigate("new-reconciliation")}>Start a reconciliation →</button>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "11px 20px", borderBottom: "1px solid var(--border-faint)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 450 }}>{latest.batch_name}</span>
              <StatusPill status={latest.status} />
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              {latest.created_at ? new Date(latest.created_at).toLocaleDateString() : ""} · {latest.total_records} records
            </span>
          </div>

          <div style={{ padding: "28px 24px", display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
            <div style={{ paddingRight: 44 }}>
              <div className="mono metric-xl" style={{ color: "var(--text)" }}>{((latest.match_rate ?? 0) * 100).toFixed(1)}%</div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 8 }}>auto-reconciled</div>
              <div style={{ marginTop: 14, width: 200, height: 3, background: "var(--card-hi)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${(latest.match_rate ?? 0) * 100}%`, height: "100%", background: "linear-gradient(90deg, var(--green) 0%, var(--green-text) 100%)", borderRadius: 2 }} />
              </div>
            </div>

            <div className="divider-v" style={{ height: 64, margin: "0 36px" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 44 }}>
              {[
                { label: "Exceptions", val: `${latest.exceptions_count ?? 0}`, color: "var(--amber-text)" },
                { label: "Resolved",   val: `${latest.resolved_count ?? 0}`,  color: "var(--green-text)" },
              ].map(m => (
                <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="mono metric-sm" style={{ color: m.color, width: 36 }}>{m.val}</span>
                  <span style={{ fontSize: 12, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</span>
                </div>
              ))}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => openBatch(latest)}>Open reconciliation →</button>
              {(latest.exceptions_count ?? 0) > 0 && (
                <button className="btn btn-warn-soft" onClick={() => { openBatch(latest); }} style={{ width: "100%" }}>
                  {latest.exceptions_count} exceptions need review
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {controller && (
        <div className="card" style={{ padding: "22px 24px", marginBottom: 24, border: "1px solid var(--border)", background: "linear-gradient(135deg, var(--surface) 0%, var(--card) 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 700, marginBottom: 6 }}>Verity Finance Controller</div>
              <div style={{ fontSize: 16, fontWeight: 650, color: "var(--text)", marginBottom: 5 }}>Actionable reconciliation intelligence</div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", maxWidth: 720 }}>{controller.recommendation}</div>
            </div>
            <div style={{ textAlign: "right" }}><div className="mono metric-sm" style={{ color: "var(--amber-text)" }}>{controller.exceptions_open}</div><div style={{ fontSize: 11.5, color: "var(--text-3)" }}>open exceptions</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: controller.priorities.length ? 18 : 0 }}>
            <KpiTile label="Auto-reconciled" value={`${controller.auto_reconciled}`} sub={`${(controller.auto_reconciliation_rate * 100).toFixed(1)}% of reconciliation units`} accent="var(--green-text)" />
            <KpiTile label="Review exposure" value={`₹${controller.review_exposure.toLocaleString("en-IN", {maximumFractionDigits:0})}`} sub="Potential discrepancy value" accent="var(--amber-text)" />
            <KpiTile label="Highest-risk issue" value={controller.highest_risk_category ? controller.highest_risk_category.replace(/_/g, " ") : "Clear"} sub="Prioritized by finance-ops risk" />
            <KpiTile label="High-value reviews" value={String(controller.high_value_exceptions)} sub="Exceptions with ≥ ₹10,000 impact" accent="var(--red-text)" />
          </div>
          {controller.priorities.length > 0 && <div style={{ borderTop: "1px solid var(--border-faint)", paddingTop: 14 }}><div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>Recommended next actions</div>{controller.priorities.map((p, i) => <div key={p} style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 5 }}><span className="mono" style={{ color: "var(--gold)", marginRight: 8 }}>P{i+1}</span>{p}</div>)}</div>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <KpiTile label="Total batches" value={String(batches.length)} sub="All time" />
        <KpiTile label="Avg match rate" value={completed.length ? `${avgMatchRate.toFixed(1)}%` : "—"} sub="Across completed batches" accent="var(--green-text)" />
        <KpiTile label="Exceptions resolved" value={String(totalResolved)} sub="All time" />
        <KpiTile label="Learning rounds" value={String(latestRounds.length)} sub="Latest batch" accent="var(--gold)" />
      </div>

      {batches.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 10 }}>
            Recent batches
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 130px 80px 120px", columnGap: 12, padding: "0 20px", background: "var(--surface)", borderBottom: "1px solid var(--border-faint)" }}>
              {["Batch", "Records", "Match rate", "Exceptions", "Status"].map(h => <div key={h} className="th">{h}</div>)}
            </div>
            {batches.map(b => (
              <div key={b.batch_id} className="trow" onClick={() => openBatch(b)} style={{ display: "grid", gridTemplateColumns: "1fr 60px 130px 80px 120px", columnGap: 12, padding: "0 20px", alignItems: "center" }}>
                <div className="td">
                  <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 450 }}>{b.batch_name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 1 }}>{b.created_at ? new Date(b.created_at).toLocaleDateString() : "—"}</div>
                </div>
                <div className="td"><span className="mono" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{b.total_records ?? "—"}</span></div>
                <div className="td">{b.match_rate !== null ? <MiniBar value={b.match_rate * 100} /> : <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>}</div>
                <div className="td"><span className="mono" style={{ fontSize: 12.5, color: (b.exceptions_count ?? 0) > 5 ? "var(--amber-text)" : "var(--text-2)" }}>{b.exceptions_count ?? "—"}</span></div>
                <div className="td"><StatusPill status={b.status} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

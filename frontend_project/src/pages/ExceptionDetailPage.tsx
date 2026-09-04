import { useEffect, useState } from "react";
import { Page } from "../App";
import { useAppState } from "../lib/AppContext";
import { api, ExceptionItem } from "../lib/api";
import { formatRupees, formatDiff, CATEGORY_LABELS } from "../lib/format";

interface Props { navigate: (p: Page) => void; }

function StatusBadge({ s }: { s: "open"|"resolved"|"escalated" }) {
  const cls = { open:"badge-open", resolved:"badge-resolved", escalated:"badge-escalated" }[s];
  return <span className={`badge ${cls}`}>{s === "open" ? "Open" : s === "resolved" ? "Resolved" : "Escalated"}</span>;
}

function actionsFor(category: string) {
  switch (category) {
    case "ID_AMBIGUOUS": return { yes: "✓ Confirm pairing", no: "✗ Reject pairing", resolutionYes: "confirmed_match" as const, resolutionNo: "confirmed_no_match" as const };
    case "DUPLICATE": return { yes: "✓ Confirm duplicate", no: "✗ False duplicate", resolutionYes: "confirmed_no_match" as const, resolutionNo: "confirmed_match" as const };
    case "AMOUNT_MISMATCH": return { yes: "✓ Confirm discrepancy", no: "✓ Mark explained", resolutionYes: "confirmed_no_match" as const, resolutionNo: "confirmed_match" as const };
    case "DATE_DRIFT": return { yes: "✓ Confirm delay", no: "✓ Mark normal", resolutionYes: "confirmed_no_match" as const, resolutionNo: "confirmed_match" as const };
    case "MISSING_IN_LEDGER": return { yes: "✓ Confirm missing", no: "✓ Found in ledger", resolutionYes: "confirmed_no_match" as const, resolutionNo: "confirmed_match" as const };
    case "MISSING_IN_SETTLEMENT": return { yes: "✓ Confirm missing", no: "✓ Settlement found/pending", resolutionYes: "confirmed_no_match" as const, resolutionNo: "confirmed_match" as const };
    default: return { yes: "✓ Confirm", no: "✗ Reject", resolutionYes: "confirmed_match" as const, resolutionNo: "confirmed_no_match" as const };
  }
}

export default function ExceptionDetailPage({ navigate }: Props) {
  const { batchId, batchName, selectedExceptionId, setSelectedExceptionId } = useAppState();
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [sel, setSel] = useState<string | null>(selectedExceptionId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [decision, setDecision] = useState<"confirmed"|"rejected"|null>(null);

  useEffect(() => {
    if (!batchId) { setError("No batch selected."); setLoading(false); return; }
    let cancelled = false;
    api.getBatchExceptions(batchId).then(({ exceptions: list }) => {
      if (cancelled) return;
      setExceptions(list); if (!sel && list.length) setSel(list[0].exception_id);
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load exceptions."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [batchId]);

  const exc = exceptions.find(e => e.exception_id === sel) ?? exceptions[0];
  const selectExc = (id: string) => { setSel(id); setSelectedExceptionId(id); setDecision(null); setError(null); };
  const resolve = async (resolution: "confirmed_match" | "confirmed_no_match") => {
    if (!exc) return; setResolving(true);
    try {
      await api.resolveException(exc.exception_id, resolution);
      setExceptions(prev => prev.map(e => e.exception_id === exc.exception_id ? { ...e, status: "resolved" } : e));
      setDecision(resolution === "confirmed_match" ? "confirmed" : "rejected");
    } catch (err) { setError(err instanceof Error ? `Couldn't record decision: ${err.message}` : "Couldn't record decision."); }
    finally { setResolving(false); }
  };

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"var(--text-3)" }}>Loading exceptions…</div>;
  if (!exc) return <div className="page">No exceptions in this batch.</div>;

  const d = exc.details;
  const rows = [
    ["Payment ID", d.settlement_payment_id ?? exc.payment_id ?? "—", d.ledger_payment_id ?? "—"],
    ["Order ID", d.settlement_order_id ?? exc.order_id ?? "—", d.ledger_order_id ?? "—"],
    ["Amount", formatRupees(d.settlement_amount), formatRupees(d.ledger_amount)],
  ];
  const actions = actionsFor(exc.category);
  const confPct = exc.confidence_score == null ? null : Math.round(exc.confidence_score * 100);
  const evidence: string[] = [];
  if (d.match_type === "exact") evidence.push("Exact order-ID candidate selected");
  if (d.match_type === "fuzzy" && d.id_similarity != null) evidence.push(`Fuzzy order-ID similarity: ${Math.round(d.id_similarity * 100)}%`);
  if (d.second_best_id_similarity != null && d.second_best_id_similarity > 0) evidence.push(`Second-best ID similarity: ${Math.round(d.second_best_id_similarity * 100)}%`);
  if (d.id_similarity_margin != null && d.match_type === "fuzzy") evidence.push(`Best-vs-runner-up margin: ${Math.round(d.id_similarity_margin * 100)} percentage points`);
  if (d.competing_candidates_count != null && d.competing_candidates_count > 0) evidence.push(`${d.competing_candidates_count} competing ledger amount candidate${d.competing_candidates_count === 1 ? "" : "s"} within the comparison band`);
  if (d.closest_competing_amount_diff_pct != null && d.closest_competing_amount_diff_pct < 1) evidence.push(`Closest competing amount: ${(d.closest_competing_amount_diff_pct * 100).toFixed(2)}% away`);
  if (d.date_diff_days != null && exc.category === "DATE_DRIFT") evidence.push(`Settlement timing difference: ${d.date_diff_days.toFixed(1)} days`);

  return <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
    <aside style={{ width:228, flexShrink:0, borderRight:"1px solid var(--border-faint)", background:"var(--surface)", overflowY:"auto" }}>
      <div style={{ padding:"14px 16px 10px", borderBottom:"1px solid var(--border-faint)", fontSize:12, color:"var(--text-2)" }}>Exceptions · {exceptions.filter(e=>e.status==="open").length} open</div>
      {exceptions.map(e => <div key={e.exception_id} onClick={()=>selectExc(e.exception_id)} style={{ padding:"11px 16px", cursor:"pointer", borderBottom:"1px solid var(--border-faint)", background:e.exception_id===sel?"var(--card-hi)":"transparent" }}>
        <div className="mono" style={{ fontSize:11, color:"var(--gold)", marginBottom:4 }}>{e.payment_id ?? e.order_id ?? "—"}</div>
        <div style={{ fontSize:10.5, color:"var(--text-3)" }}>{CATEGORY_LABELS[e.category] ?? e.category}</div>
      </div>)}
    </aside>
    <div style={{ flex:1, overflowY:"auto", padding:"32px 40px" }}>
      <div style={{ marginBottom:24 }}><div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}><span className="mono" style={{ fontSize:11, color:"var(--text-3)" }}>{exc.exception_id}</span><StatusBadge s={exc.status}/></div><h2 style={{ margin:0, fontSize:22 }}>{CATEGORY_LABELS[exc.category] ?? exc.category}</h2><p style={{ color:"var(--text-2)", fontSize:13 }}>{batchName ?? "Reconciliation batch"}</p></div>
      <div className="card" style={{ marginBottom:16, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"120px 1fr 1fr", padding:"10px 20px", borderBottom:"1px solid var(--border-faint)" }}><div/><div style={{ fontSize:10, color:"var(--amber-text)", letterSpacing:".1em" }}>RAZORPAY SETTLEMENT</div><div style={{ fontSize:10, color:"var(--text-3)", letterSpacing:".1em" }}>INTERNAL LEDGER</div></div>
        <div style={{ padding:"0 20px" }}>{rows.map(([label,left,right])=>{ const diff=left!==right && left!=="—" && right!=="—"; return <div key={label} style={{ display:"grid", gridTemplateColumns:"120px 1fr 1fr", padding:"10px 0", borderBottom:"1px solid var(--border-faint)" }}><span style={{ fontSize:12, color:"var(--text-3)" }}>{label}</span><span className="mono" style={{ fontSize:13 }}>{left}</span><span className="mono" style={{ fontSize:13, color:diff?"var(--amber-text)":"var(--text)" }}>{right}</span></div>; })}</div>
      </div>
      <div className="card" style={{ padding:"18px 20px", marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:600, marginBottom:12 }}>Verity's assessment</div>
        <div style={{ padding:"11px 14px", borderLeft:"2px solid var(--gold-border)", background:"var(--gold-bg)", marginBottom:14 }}><div style={{ fontSize:10.5, color:"var(--text-3)", marginBottom:5 }}>WHY THIS WAS FLAGGED</div><p style={{ margin:0, color:"var(--text-2)", lineHeight:1.6 }}>{exc.explanation}</p></div>
        {evidence.length > 0 && <div style={{ marginBottom:14 }}><div style={{ fontSize:11, color:"var(--text-3)", marginBottom:7 }}>MATCH EVIDENCE</div>{evidence.map(x=><div key={x} style={{ fontSize:12.5, color:"var(--text-2)", margin:"4px 0" }}>• {x}</div>)}</div>}
        {exc.detection_method === "model" && confPct != null ? <div><div style={{ fontSize:12, color:"var(--text-3)", marginBottom:5 }}>Model confidence</div><div className="mono" style={{ fontSize:18, color:"var(--amber-text)", fontWeight:700 }}>{confPct}%</div><div style={{ fontSize:11.5, color:"var(--text-3)", marginTop:5 }}>This is the classifier's probability for the predicted category. It does not automatically resolve this exception.</div></div> : <div><div style={{ fontSize:12, color:"var(--text-3)", marginBottom:5 }}>Detection method</div><div style={{ fontSize:15, color:"var(--green-text)", fontWeight:600 }}>Deterministic record check</div><div style={{ fontSize:11.5, color:"var(--text-3)", marginTop:5 }}>This exception was found by matching logic, not by an ML probability score.</div></div>}
      </div>
      {formatDiff(d, exc.category) !== "—" && <div className="card" style={{ padding:"12px 18px", marginBottom:16, color:"var(--amber-text)" }}>Difference: {formatDiff(d, exc.category)}</div>}
      {error && <div style={{ color:"var(--red-text)", marginBottom:12 }}>{error}</div>}
      {decision || exc.status === "resolved" ? <div className="card" style={{ padding:"18px 20px", border:"1px solid var(--green-border)" }}><b>✓ Decision recorded</b><p style={{ color:"var(--text-2)", marginBottom:0 }}>The review outcome is stored as feedback for confidence calibration.</p></div> : <div className="card" style={{ padding:"18px 20px" }}><div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Human review</div><p style={{ fontSize:12.5, color:"var(--text-2)", marginBottom:16 }}>Choose the outcome that best describes this exception. No ledger adjustment is posted automatically.</p><div style={{ display:"flex", gap:8, flexWrap:"wrap" }}><button className="btn btn-success-soft" disabled={resolving} onClick={()=>resolve(actions.resolutionYes)}>{resolving?"Recording…":actions.yes}</button><button className="btn btn-danger-soft" disabled={resolving} onClick={()=>resolve(actions.resolutionNo)}>{resolving?"Recording…":actions.no}</button><button className="btn btn-ghost" onClick={()=>navigate("ask-verity")}>Ask Verity →</button></div></div>}
    </div>
  </div>;
}

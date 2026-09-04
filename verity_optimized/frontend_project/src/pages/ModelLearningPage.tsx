import { useEffect, useState } from "react";
import { Page } from "../App";
import { useAppState } from "../lib/AppContext";
import { api, CalibrationRound } from "../lib/api";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

interface Props { navigate: (p: Page) => void; }

const CORRECTIONS_PER_ROUND = 5; // matches backend's calibration.ROUND_SIZE

interface ChartRow { round: string; autoResolutionCoverage: number; calibrationError: number; corrections: number; }

function ChartTooltip({ active, payload, label, data }: any) {
  if (!active || !payload?.length) return null;
  const d = (data as ChartRow[]).find(d => d.round === label);
  return (
    <div style={{ background: "var(--card-hi)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", minWidth: 180 }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10, letterSpacing: "0.04em" }}>{label}</div>
      {payload.map((p: any) => (
        p.dataKey !== "autoResolutionCoverageArea" && p.dataKey !== "calibrationErrorArea" ? (
          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 5, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color }} />
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>{p.dataKey === "autoResolutionCoverage" ? "Trusted model-confidence coverage" : "Calibration error"}</span>
            </div>
            <span className="mono" style={{ fontSize: 13, color: p.color, fontWeight: 600 }}>{p.value}%</span>
          </div>
        ) : null
      ))}
      {d && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-faint)", fontSize: 11, color: "var(--text-3)" }}>{d.corrections} corrections applied</div>}
    </div>
  );
}

export default function ModelLearningPage({ navigate }: Props) {
  const { batchId } = useAppState();
  const [rounds, setRounds] = useState<CalibrationRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId) { setError("No batch selected."); setLoading(false); return; }
    let cancelled = false;
    api.getCalibration(batchId)
      .then(r => { if (!cancelled) setRounds(r.rounds); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load calibration data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [batchId]);

  if (loading) return <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "var(--text-3)" }}>Loading…</div>;

  if (error) {
    return (
      <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 14 }}>
        <div style={{ color: "var(--red-text)", fontSize: 13.5 }}>{error}</div>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="page">
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.022em", color: "var(--text)", marginBottom: 6 }}>Confidence calibration</h1>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>How verified human feedback measures whether model confidence is trustworthy over time.</p>
        </div>
        <div className="card" style={{ padding: "40px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>No calibration data yet</div>
          <p style={{ fontSize: 13, color: "var(--text-2)", maxWidth: 440, margin: "0 auto 20px", lineHeight: 1.6 }}>
            Verity computes a calibration round after every {CORRECTIONS_PER_ROUND} exception reviews. Resolve some
            exceptions in this batch to start building calibration history.
          </p>
          <button className="btn btn-gold" onClick={() => navigate("exception-detail")}>Review exceptions →</button>
        </div>
      </div>
    );
  }

  const DATA: ChartRow[] = rounds.map(r => ({
    round: `Round ${r.round}`,
    autoResolutionCoverage: Math.round(r.auto_resolution_coverage * 1000) / 10,
    calibrationError: Math.round(r.calibration_error * 1000) / 10,
    corrections: CORRECTIONS_PER_ROUND,
  }));

  const first = DATA[0], last = DATA[DATA.length - 1];
  const totalCorrections = DATA.length * CORRECTIONS_PER_ROUND;
  const errorChangePct = first.calibrationError > 0 ? Math.round(((first.calibrationError - last.calibrationError) / first.calibrationError) * 100) : 0;

  return (
    <div className="page">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.022em", color: "var(--text)", marginBottom: 6 }}>Confidence calibration</h1>
        <p style={{ fontSize: 13, color: "var(--text-2)" }}>How verified human feedback measures whether model confidence is trustworthy over time.</p>
      </div>

      <div className="card" style={{ padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 5 }}>
              Calibration history for this batch
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
              Human corrections feed each round · {totalCorrections} total corrections across {DATA.length} round{DATA.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 22, height: 2, background: "var(--green-text)", borderRadius: 1 }} />
              <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>Trusted model-confidence coverage</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="22" height="2" viewBox="0 0 22 2"><line x1="0" y1="1" x2="22" y2="1" stroke="var(--amber-text)" strokeWidth="2" strokeDasharray="5 3"/></svg>
              <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>Calibration error</span>
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={DATA} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="gMatch" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#48C08A" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#48C08A" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="gError" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F0A848" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#F0A848" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border-faint)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="round" tick={{ fill: "var(--text-3)", fontSize: 11.5, fontFamily: "Inter" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <YAxis tick={{ fill: "var(--text-3)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} width={38} />
            <Tooltip content={<ChartTooltip data={DATA} />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="autoResolutionCoverage" fill="url(#gMatch)" stroke="none" name="autoResolutionCoverageArea" />
            <Area type="monotone" dataKey="calibrationError" fill="url(#gError)" stroke="none" name="calibrationErrorArea" />
            <Line type="monotone" dataKey="autoResolutionCoverage" stroke="var(--green-text)" strokeWidth={2.5} dot={{ fill: "var(--green-text)", strokeWidth: 0, r: 5 }} activeDot={{ r: 7, fill: "var(--green-text)", stroke: "var(--bg)", strokeWidth: 2.5 }} />
            <Line type="monotone" dataKey="calibrationError" stroke="var(--amber-text)" strokeWidth={2.5} strokeDasharray="6 3" dot={{ fill: "var(--amber-text)", strokeWidth: 0, r: 5 }} activeDot={{ r: 7, fill: "var(--amber-text)", stroke: "var(--bg)", strokeWidth: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${DATA.length}, 1fr)`, borderTop: "1px solid var(--border-faint)", marginTop: 20 }}>
          {DATA.map((d, i) => (
            <div key={d.round} style={{ padding: "18px 24px", borderLeft: i > 0 ? "1px solid var(--border-faint)" : "none", textAlign: "center" }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 14 }}>{d.round}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 28 }}>
                <div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--green-text)" }}>{d.autoResolutionCoverage}%</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>trusted model-confidence coverage</div>
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--amber-text)" }}>{d.calibrationError}%</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>cal. error</div>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)" }}>{d.corrections} corrections</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Feedback rounds",   value: String(DATA.length),  sub: "Completed",         color: "var(--text)" },
          { label: "Human corrections", value: String(totalCorrections), sub: "Total applied",   color: "var(--text)" },
          { label: "Trusted model-confidence coverage",        value: `${first.autoResolutionCoverage}%→${last.autoResolutionCoverage}%`, sub: `${last.autoResolutionCoverage >= first.autoResolutionCoverage ? "+" : ""}${(last.autoResolutionCoverage - first.autoResolutionCoverage).toFixed(1)} pts`, color: "var(--green-text)" },
          { label: "Calibration error", value: `${first.calibrationError}%→${last.calibrationError}%`, sub: `${errorChangePct >= 0 ? "−" : "+"}${Math.abs(errorChangePct)}% change`, color: "var(--amber-text)" },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: "15px 18px" }}>
            <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: s.color, marginBottom: 7 }}>{s.value}</div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-faint)", background: "var(--surface)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>Correction history</div>
          </div>
          {DATA.map((d, i) => (
            <div key={d.round} style={{ padding: "16px 18px", borderBottom: i < DATA.length - 1 ? "1px solid var(--border-faint)" : "none", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--gold-bg)", border: "1px solid var(--gold-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--gold)", fontWeight: 600 }}>0{i + 1}</span>
                </div>
                {i < DATA.length - 1 && <div style={{ width: 1, height: 18, background: "var(--border-faint)" }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 3 }}>{d.round}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 4 }}>
                  Calibration evidence recomputed after {d.corrections} exception reviews.
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {d.autoResolutionCoverage}% trusted model-confidence coverage · {d.calibrationError}% calibration error
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>What is calibration?</div>
            <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.65, margin: 0 }}>
              When Verity says it is 90% confident, roughly 90% of those decisions should be correct. A well-calibrated model's stated confidence reflects its actual accuracy.
            </p>
            <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--surface)", borderRadius: "var(--radius-sm)", borderLeft: "2px solid var(--gold-border)" }}>
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text)", fontWeight: 500 }}>Round {first.round.split(" ")[1]}</strong> — {first.calibrationError}% calibration error.<br />
                <strong style={{ color: "var(--text)", fontWeight: 500 }}>Round {last.round.split(" ")[1]}</strong> — {last.calibrationError}% calibration error.
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>Human corrections → calibration</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { step: "Finance reviews exceptions",   sub: "Open, escalated, and uncertain records" },
                { step: "Decisions are recorded",        sub: "Confirm match or reject" },
                { step: "Corrections feed calibration",  sub: "Confidence bins measured against verified outcomes" },
                { step: "Trusted confidence coverage reflects the evidence", sub: "Higher trust where evidence supports it" },
              ].map((s, i, arr) => (
                <div key={s.step} style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gold)", marginTop: 5 }} />
                    {i < arr.length - 1 && <div style={{ width: 1, flex: 1, background: "var(--border-faint)", minHeight: 18, margin: "3px 0" }} />}
                  </div>
                  <div style={{ paddingBottom: i < arr.length - 1 ? 14 : 0 }}>
                    <div style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 450 }}>{s.step}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => navigate("exception-detail")} style={{ marginTop: 16, fontSize: 12 }}>
              Review exceptions to add feedback →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

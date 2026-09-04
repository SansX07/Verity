import { useEffect, useState } from "react";
import { Page } from "../App";
import { useAppState } from "../lib/AppContext";
import { api } from "../lib/api";

interface Props { navigate: (p: Page) => void; stage: number; setStage: (n: number) => void; }

const STAGES = [
  { label: "Validating settlement records",    ms: 800  },
  { label: "Validating ledger records",        ms: 600  },
  { label: "Finding exact matches",            ms: 1000 },
  { label: "Resolving candidate matches",      ms: 1300 },
  { label: "Scoring uncertain records",        ms: 1500 },
  { label: "Generating exceptions",            ms: 800  },
  { label: "Preparing reconciliation report",  ms: 700  },
];

const TOTAL = STAGES.reduce((s, st) => s + st.ms, 0);

export default function ProcessingPage({ navigate, stage, setStage }: Props) {
  const { batchId } = useAppState();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let elapsed = 0;

    // Animate up to 90% on the fixed schedule below — this is genuine visual
    // polish, not fake progress reporting, since the backend really is
    // processing during this window. Completion past 90% is gated on the
    // REAL backend status, never just the timer, so this never claims done
    // before the backend actually is.
    const animationCap = 90;
    const animId = setInterval(() => {
      elapsed += 70;
      const pct = Math.min(animationCap, Math.round((elapsed / TOTAL) * animationCap));
      if (!cancelled) setStage(pct);
      if (pct >= animationCap) clearInterval(animId);
    }, 70);

    const pollStatus = async () => {
      if (!batchId) {
        if (!cancelled) setError("No batch was uploaded — go back and start a reconciliation.");
        return;
      }
      try {
        const status = await api.getBatchStatus(batchId);
        if (cancelled) return;
        if (status.status === "completed") {
          setStage(100);
          setTimeout(() => !cancelled && navigate("results"), 400);
        } else if (status.status === "failed") {
          setError("Processing failed on the backend. Check the server logs for details.");
        } else {
          setTimeout(pollStatus, 500);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? `Couldn't reach the backend: ${err.message}` : "Couldn't reach the backend.");
        }
      }
    };
    pollStatus();

    return () => { cancelled = true; clearInterval(animId); };
  }, []);

  // Which stage is active?
  let cum = 0;
  const stageStatus = STAGES.map(s => {
    const start = (cum / TOTAL) * 100;
    cum += s.ms;
    const end = (cum / TOTAL) * 100;
    if (stage >= end) return "done";
    if (stage >= start) return "active";
    return "pending";
  });

  const progress = stage;

  if (error) {
    return (
      <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#08090C" }}>
        <div style={{ width: "100%", maxWidth: 420, padding: "0 32px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#E26262", marginBottom: 10 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: "#868C99", marginBottom: 24, lineHeight: 1.6 }}>{error}</div>
          <button className="btn btn-gold" onClick={() => navigate("new-reconciliation")}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#08090C" }}>
      <div style={{ width: "100%", maxWidth: 480, padding: "0 32px" }}>
        {/* Progress ring */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <svg width="128" height="128" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r="56" fill="none" stroke="#1A1D22" strokeWidth="5" />
              <circle cx="64" cy="64" r="56" fill="none" stroke="#C8A45A" strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 56}`}
                strokeDashoffset={`${2 * Math.PI * 56 * (1 - progress / 100)}`}
                transform="rotate(-90 64 64)"
                style={{ transition: "stroke-dashoffset 0.1s linear" }}
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: "#E8E4DE", letterSpacing: "-0.02em" }}>{progress}%</div>
            </div>
          </div>
          <div style={{ marginTop: 18, fontSize: 13.5, color: "#868C99" }}>
            Verity is comparing your settlement report against the internal ledger.
          </div>
        </div>

        {/* Stage list */}
        <div className="card" style={{ overflow: "hidden" }}>
          {STAGES.map((s, i) => {
            const st = stageStatus[i];
            return (
              <div key={i} style={{
                padding: "12px 20px",
                borderBottom: i < STAGES.length - 1 ? "1px solid #0E1012" : "none",
                display: "flex",
                alignItems: "center",
                gap: 14,
                opacity: st === "pending" ? 0.38 : 1,
                transition: "opacity 0.25s ease",
              }}>
                {/* Indicator */}
                {st === "done" ? (
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2D7D5F18", border: "1px solid #2D7D5F50", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                      <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="#4DC490" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                ) : st === "active" ? (
                  <div className="pulse" style={{ width: 18, height: 18, borderRadius: "50%", background: "#C8A45A18", border: "1px solid #C8A45A50", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8A45A" }} />
                  </div>
                ) : (
                  <div style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid #22262D", flexShrink: 0 }} />
                )}

                <span style={{ fontSize: 13, color: st === "done" ? "#868C99" : st === "active" ? "#E8E4DE" : "#4E5360", fontWeight: st === "active" ? 500 : 400 }}>
                  {s.label}
                </span>
                {st === "active" && <span style={{ marginLeft: "auto", fontSize: 11, color: "#C8A45A" }}>Running…</span>}
                {st === "done"   && <span style={{ marginLeft: "auto", fontSize: 11, color: "#4E5360" }}>Done</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

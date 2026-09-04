import { useState, useEffect, useRef } from "react";
import { Page } from "../App";
import { Mark } from "../components/Mark";

interface Props { navigate: (p: Page) => void; }

/* ─── Animated reconciliation table ─── */
const DEMO_ROWS = [
  { id: "pay_9F2X",  settlement: "₹1,240",  ledger: "₹1,240",  match: true  },
  { id: "pay_7K31",  settlement: "₹8,750",  ledger: "₹8,750",  match: true  },
  { id: "pay_3M89",  settlement: "₹22,100", ledger: "₹21,800", match: false },
  { id: "pay_5R44",  settlement: "₹42,500", ledger: "—",        match: false },
  { id: "pay_2D17",  settlement: "₹3,600",  ledger: "₹3,600",  match: true  },
  { id: "pay_6K09",  settlement: "₹15,800", ledger: "₹15,800", match: true  },
];

function HeroReconTable() {
  const [visible, setVisible] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    DEMO_ROWS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisible(i + 1), 400 + i * 280));
    });
    timers.push(setTimeout(() => setShowSummary(true), 400 + DEMO_ROWS.length * 280 + 200));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{
      background: "#0E1012",
      border: "1px solid #22262D",
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px #181B20",
    }}>
      {/* Source labels */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr 1fr 80px",
        padding: "10px 16px",
        borderBottom: "1px solid #181B20",
        background: "#08090C",
      }}>
        <span style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4E5360", fontWeight: 600 }}>Transaction</span>
        <span style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#C8A45A80", fontWeight: 600 }}>Razorpay Settlement</span>
        <span style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4E5360", fontWeight: 600 }}>Internal Ledger</span>
        <span style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4E5360", fontWeight: 600 }}>Status</span>
      </div>

      {DEMO_ROWS.map((row, i) => (
        <div key={row.id} style={{
          display: "grid",
          gridTemplateColumns: "140px 1fr 1fr 80px",
          padding: "10px 16px",
          borderBottom: "1px solid #0E1012",
          alignItems: "center",
          opacity: i < visible ? 1 : 0,
          transform: i < visible ? "translateY(0)" : "translateY(5px)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}>
          <span className="mono" style={{ fontSize: 12, color: "#C8A45A" }}>{row.id}</span>
          <span className="mono" style={{ fontSize: 12.5, color: "#E8E4DE" }}>{row.settlement}</span>
          <span className="mono" style={{ fontSize: 12.5, color: row.ledger === "—" ? "#4E5360" : row.match ? "#E8E4DE" : "#F2AB4C" }}>{row.ledger}</span>
          <div>
            {row.match
              ? <span style={{ fontSize: 11, color: "#4DC490", fontWeight: 500 }}>✓ Match</span>
              : <span style={{ fontSize: 11, color: "#F2AB4C", fontWeight: 500 }}>! Review</span>
            }
          </div>
        </div>
      ))}

      {/* Summary row */}
      <div style={{
        padding: "14px 16px",
        background: "#08090C",
        borderTop: "1px solid #22262D",
        display: "flex",
        gap: 28,
        alignItems: "center",
        opacity: showSummary ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}>
        {[
          { label: "Reconciled", value: "87.1%", color: "#E8E4DE" },
          { label: "Matched",    value: "54",     color: "#4DC490" },
          { label: "Exceptions", value: "8",      color: "#F2AB4C" },
        ].map((s, i) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {i > 0 && <div style={{ width: 1, height: 24, background: "#22262D", marginRight: 20 }} />}
            <div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#4E5360", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <div style={{ width: 120, height: 4, background: "#22262D", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: showSummary ? "87.1%" : "0%",
              background: "linear-gradient(90deg, #2D7D5F, #4DC490)",
              borderRadius: 2,
              transition: "width 1.2s ease 0.2s",
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Section wrapper ─── */
function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px", ...style }}>
      {children}
    </section>
  );
}

function Divider() {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px" }}>
      <div style={{ height: 1, background: "linear-gradient(90deg, transparent 0%, #22262D 20%, #22262D 80%, transparent 100%)" }} />
    </div>
  );
}

export default function LandingPage({ navigate }: Props) {
  const [activeNav, setActiveNav] = useState<string | null>(null);

  return (
    <div style={{ background: "#08090C", color: "#E8E4DE", minHeight: "100vh" }}>

      {/* ── NAV ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#08090Ccc",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid #181B20",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => navigate("landing")}>
            <Mark size={20} />
            <span className="wordmark">Verity</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {["Product", "How it works", "Accuracy"].map(item => (
              <span key={item}
                style={{ fontSize: 13, color: activeNav === item ? "#E8E4DE" : "#868C99", cursor: "pointer", transition: "color 120ms" }}
                onMouseEnter={() => setActiveNav(item)}
                onMouseLeave={() => setActiveNav(null)}>
                {item}
              </span>
            ))}
            <span style={{ width: 1, height: 16, background: "#22262D", display: "block" }} />
            <span style={{ fontSize: 13, color: "#868C99", cursor: "pointer", transition: "color 120ms" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#E8E4DE")}
              onMouseLeave={e => (e.currentTarget.style.color = "#868C99")}
              onClick={() => navigate("login")}>
              Sign in
            </span>
            <button className="btn btn-gold" onClick={() => navigate("login")}
              style={{ padding: "8px 16px", fontSize: 12.5 }}>
              Open Verity →
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        {/* Subtle grid */}
        <div className="grid-pattern" style={{ position: "absolute", inset: 0, opacity: 0.18, pointerEvents: "none" }} />
        {/* Radial glow — very subtle, gold-tinted */}
        <div style={{
          position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)",
          width: 800, height: 500,
          background: "radial-gradient(ellipse at center, #C8A45A08 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <Section style={{ paddingTop: 96, paddingBottom: 80 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
            {/* Left */}
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 11px", borderRadius: 100, border: "1px solid #C8A45A38", background: "#C8A45A10", marginBottom: 28 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#C8A45A" }} />
                <span style={{ fontSize: 11, color: "#C8A45A", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>Reconciliation Intelligence</span>
              </div>

              <h1 style={{
                fontSize: "clamp(38px, 3.8vw, 56px)",
                fontWeight: 700,
                lineHeight: 1.06,
                letterSpacing: "-0.03em",
                margin: "0 0 24px",
                color: "#E8E4DE",
              }}>
                Find the truth in<br />your settlement data.
              </h1>

              <p style={{ fontSize: 16, lineHeight: 1.7, color: "#868C99", margin: "0 0 36px", maxWidth: 400 }}>
                Verity reconciles payment settlements against your internal ledger, surfaces exceptions that need human attention, and learns from every correction.
              </p>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn btn-gold" onClick={() => navigate("login")}
                  style={{ padding: "11px 22px", fontSize: 13.5 }}>
                  Start reconciliation →
                </button>
                <button className="btn btn-ghost" style={{ padding: "11px 20px", fontSize: 13.5 }}>
                  See how it works
                </button>
              </div>

              {/* Match / Explain / Learn trio */}
              <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "#21252C", borderRadius: 5, overflow: "hidden", border: "1px solid #21252C" }}>
                {[
                  { label: "Match",   icon: "≡", desc: "Automatically identify corresponding transactions." },
                  { label: "Explain", icon: "?", desc: "Understand why an exception occurred." },
                  { label: "Learn",   icon: "↑", desc: "Improve from human corrections." },
                ].map(s => (
                  <div key={s.label} style={{ background: "#0E1012", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                      <span style={{ fontSize: 11, color: "#C8A45A", fontWeight: 700 }}>{s.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#E8E4DE" }}>{s.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#4E5360", lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: live demo table */}
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: -20, left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "0 2px" }}>
                <span style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "#4E5360", textTransform: "uppercase" }}>Razorpay Settlement</span>
                <span style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "#4E5360", textTransform: "uppercase" }}>Internal Ledger</span>
              </div>
              <HeroReconTable />
            </div>
          </div>
        </Section>
      </div>

      <Divider />

      {/* ── TWO RECORDS ── */}
      <Section style={{ paddingTop: 96, paddingBottom: 88 }}>
        <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 80, alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 10.5, letterSpacing: "0.1em", color: "#C8A45A", textTransform: "uppercase", fontWeight: 600 }}>How it works</span>
            <h2 style={{ fontSize: "clamp(28px, 2.8vw, 44px)", fontWeight: 700, letterSpacing: "-0.025em", margin: "14px 0 18px", color: "#E8E4DE", lineHeight: 1.12 }}>
              Two records.<br />One source of truth.
            </h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "#868C99", marginBottom: 24 }}>
              Verity compares transaction IDs, amounts, dates, fees, currency, and other signals to determine whether records represent the same transaction.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Transaction ID matching", icon: "≡" },
                { label: "Amount & fee comparison", icon: "₹" },
                { label: "Date proximity analysis", icon: "◷" },
                { label: "Confidence scoring", icon: "%" },
              ].map(f => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 5, background: "#C8A45A14", border: "1px solid #C8A45A30", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "#C8A45A" }}>{f.icon}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#868C99" }}>{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual flow */}
          <div>
            <div style={{ display: "flex", gap: 16 }}>
              {/* Settlement source */}
              <div style={{ flex: 1, background: "#0E1012", border: "1px solid #22262D", borderRadius: 6, padding: "16px 18px" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "#4E5360", textTransform: "uppercase", marginBottom: 14 }}>Settlement</div>
                {[["Payment ID", "pay_9F2X"], ["Order", "order_72AB"], ["Amount", "₹1,240"], ["Date", "24 Aug"], ["Fee", "₹40"]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #141619" }}>
                    <span style={{ fontSize: 11.5, color: "#4E5360" }}>{k}</span>
                    <span className="mono" style={{ fontSize: 11.5, color: "#E8E4DE" }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Center: Verity engine */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 0, width: 72 }}>
                <div style={{ width: 1, flex: 1, background: "linear-gradient(to bottom, transparent, #22262D)" }} />
                <div style={{ padding: "10px 12px", background: "#141619", border: "1px solid #C8A45A38", borderRadius: 5, textAlign: "center" }}>
                  <Mark size={18} />
                  <div style={{ fontSize: 8, letterSpacing: "0.14em", color: "#C8A45A", textTransform: "uppercase", marginTop: 5, fontWeight: 600 }}>Verity</div>
                </div>
                <div style={{ width: 1, flex: 1, background: "linear-gradient(to top, transparent, #22262D)" }} />
              </div>

              {/* Ledger source */}
              <div style={{ flex: 1, background: "#0E1012", border: "1px solid #22262D", borderRadius: 6, padding: "16px 18px" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "#4E5360", textTransform: "uppercase", marginBottom: 14 }}>Ledger</div>
                {([["Payment ID", "pay_9F2X", false], ["Order", "order_72AB", false], ["Amount", "₹1,200", true], ["Date", "24 Aug", false], ["Fee", "₹0", true]] as [string, string, boolean][]).map(([k, v, diff]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #141619" }}>
                    <span style={{ fontSize: 11.5, color: "#4E5360" }}>{k}</span>
                    <span className="mono" style={{ fontSize: 11.5, color: diff ? "#F2AB4C" : "#E8E4DE" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Outcome branches */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 16 }}>
              {[
                { label: "Matched",      color: "#4DC490", bg: "#2D7D5F16", border: "#2D7D5F40", desc: "All fields agree." },
                { label: "Needs review", color: "#F2AB4C", bg: "#BD7C2E16", border: "#BD7C2E40", desc: "Low-confidence match." },
                { label: "Exception",    color: "#E26262", bg: "#9E3A3A16", border: "#9E3A3A40", desc: "Cannot reconcile." },
              ].map(o => (
                <div key={o.label} style={{ padding: "12px 14px", borderRadius: 5, background: o.bg, border: `1px solid ${o.border}` }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: o.color, marginBottom: 4 }}>{o.label}</div>
                  <div style={{ fontSize: 12, color: "#868C99" }}>{o.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Divider />

      {/* ── EXCEPTIONS ── */}
      <Section style={{ paddingTop: 96, paddingBottom: 88 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          {/* Exception card */}
          <div style={{ background: "#0E1012", border: "1px solid #22262D", borderRadius: 8, overflow: "hidden", order: -1 }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid #181B20", background: "#08090C", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10.5, letterSpacing: "0.06em", color: "#F2AB4C", textTransform: "uppercase", fontWeight: 600 }}>Amount Mismatch</span>
              <span className="badge badge-open">Open</span>
              <div style={{ marginLeft: "auto", fontSize: 10, color: "#4E5360", fontFamily: "'JetBrains Mono', monospace" }}>EXC-001</div>
            </div>

            <div style={{ padding: "22px 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#4E5360", textTransform: "uppercase", marginBottom: 10 }}>Settlement</div>
                  <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: "#E8E4DE" }}>₹1,240</div>
                  <div className="mono" style={{ fontSize: 11, color: "#C8A45A", marginTop: 4 }}>pay_9F2X</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#4E5360", textTransform: "uppercase", marginBottom: 10 }}>Ledger</div>
                  <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: "#F2AB4C" }}>₹1,200</div>
                  <div className="mono" style={{ fontSize: 11, color: "#C8A45A", marginTop: 4 }}>pay_9F2X</div>
                </div>
              </div>

              <div style={{ padding: "12px 14px", background: "#141619", borderRadius: 4, borderLeft: "2px solid #BD7C2E60", marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: "#F2AB4C", marginBottom: 4 }}>Difference  ₹40</div>
                <div style={{ fontSize: 12.5, color: "#868C99", lineHeight: 1.55 }}>
                  Settlement amount differs from the internal ledger by ₹40. Possible fee or ledger adjustment.
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11.5, color: "#4E5360" }}>Confidence</span>
                  <div style={{ width: 60, height: 3, background: "#22262D", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: "62%", height: "100%", background: "#F2AB4C", borderRadius: 2 }} />
                  </div>
                  <span className="mono" style={{ fontSize: 12.5, color: "#F2AB4C", fontWeight: 600 }}>62%</span>
                </div>
                <span style={{ fontSize: 11.5, color: "#F2AB4C", fontWeight: 500 }}>Needs human review</span>
              </div>
            </div>
          </div>

          <div>
            <span style={{ fontSize: 10.5, letterSpacing: "0.1em", color: "#C8A45A", textTransform: "uppercase", fontWeight: 600 }}>Exceptions</span>
            <h2 style={{ fontSize: "clamp(28px, 2.8vw, 44px)", fontWeight: 700, letterSpacing: "-0.025em", margin: "14px 0 18px", color: "#E8E4DE", lineHeight: 1.12 }}>
              Don't hide<br />the exceptions.
            </h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "#868C99", marginBottom: 20 }}>
              A trustworthy reconciliation system should show where it is uncertain — not just celebrate the matches.
            </p>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "#4E5360" }}>
              Every unresolved exception surfaces with a plain-English explanation, a confidence score, and a path to human resolution. Nothing is hidden.
            </p>
          </div>
        </div>
      </Section>

      <Divider />

      {/* ── SELF-IMPROVEMENT ── */}
      <Section style={{ paddingTop: 96, paddingBottom: 88 }}>
        <div style={{ textAlign: "center", maxWidth: 520, margin: "0 auto 60px" }}>
          <span style={{ fontSize: 10.5, letterSpacing: "0.1em", color: "#C8A45A", textTransform: "uppercase", fontWeight: 600 }}>Confidence calibration</span>
          <h2 style={{ fontSize: "clamp(28px, 2.8vw, 44px)", fontWeight: 700, letterSpacing: "-0.025em", margin: "14px 0 18px", color: "#E8E4DE", lineHeight: 1.12 }}>
            Every correction makes<br />the system more useful.
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "#868C99" }}>
            Verity records human corrections and uses them to improve future matching and confidence calibration.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, position: "relative" }}>
          {[
            { round: "01", rate: "83%", error: "14%", note: "Baseline" },
            { round: "02", rate: "87%", error: "9%",  note: "After round 1 feedback" },
            { round: "03", rate: "91%", error: "6%",  note: "After round 2 feedback" },
          ].map((r, i) => (
            <div key={r.round} style={{ position: "relative" }}>
              {i < 2 && (
                <div style={{
                  position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                  zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                }}>
                  <div style={{ width: 1, height: 36, background: "#22262D" }} />
                  <span style={{ fontSize: 9, color: "#4E5360", letterSpacing: "0.08em", textTransform: "uppercase", writingMode: "vertical-lr", transform: "rotate(180deg)" }}>
                    Human corrections
                  </span>
                  <div style={{ width: 1, height: 36, background: "#22262D" }} />
                </div>
              )}
              <div style={{ padding: "36px 40px", textAlign: "center" }}>
                <div className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4E5360", textTransform: "uppercase", marginBottom: 20 }}>Round {r.round}</div>
                <div>
                  <div className="mono" style={{ fontSize: 44, fontWeight: 700, color: "#4DC490", letterSpacing: "-0.03em", lineHeight: 1 }}>{r.rate}</div>
                  <div style={{ fontSize: 10.5, color: "#4E5360", marginTop: 6 }}>Match rate ↑</div>
                </div>
                <div style={{ height: 1, background: "#22262D", margin: "20px auto", width: 48 }} />
                <div>
                  <div className="mono" style={{ fontSize: 32, fontWeight: 600, color: "#F2AB4C", letterSpacing: "-0.02em" }}>{r.error}</div>
                  <div style={{ fontSize: 10.5, color: "#4E5360", marginTop: 6 }}>Calibration error ↓</div>
                </div>
                <div style={{ fontSize: 11, color: "#4E5360", marginTop: 16 }}>{r.note}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, padding: "14px 20px", background: "#0E1012", border: "1px solid #22262D", borderRadius: 5, maxWidth: 680, margin: "36px auto 0", textAlign: "center" }}>
          <p style={{ fontSize: 12.5, color: "#868C99", margin: 0 }}>
            This is an iterative feedback process. One correction does not instantly retrain the model — improvements accumulate across rounds.
          </p>
        </div>
      </Section>

      <Divider />

      {/* ── HOW IT WORKS ── */}
      <section style={{ background: "#0E1012", borderTop: "1px solid #181B20", borderBottom: "1px solid #181B20" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <h2 style={{ fontSize: "clamp(22px, 2.4vw, 34px)", fontWeight: 700, letterSpacing: "-0.025em", color: "#E8E4DE", margin: 0 }}>
              How Verity works
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0 }}>
            {[
              { n: "01", title: "Connect",    desc: "Upload settlement and ledger records. Verity validates both files before processing." },
              { n: "02", title: "Reconcile",  desc: "Verity matches transactions and scores confidence across multiple signals." },
              { n: "03", title: "Review",     desc: "Finance teams investigate unresolved exceptions with full context and explanations." },
              { n: "04", title: "Improve",    desc: "Human corrections feed the next calibration cycle. The system becomes more useful over time." },
            ].map((s, i) => (
              <div key={s.n} style={{ padding: "0 32px", borderLeft: i > 0 ? "1px solid #22262D" : "none" }}>
                <div className="mono" style={{ fontSize: 11, color: "#C8A45A", fontWeight: 600, marginBottom: 14 }}>{s.n}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#E8E4DE", marginBottom: 10 }}>{s.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.65, color: "#868C99" }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER CTA ── */}
      <Section style={{ paddingTop: 100, paddingBottom: 80, textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(28px, 3vw, 44px)", fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 18px", color: "#E8E4DE" }}>
          Ready to reconcile?
        </h2>
        <p style={{ fontSize: 15, color: "#868C99", marginBottom: 36 }}>
          Start your first reconciliation in minutes.
        </p>
        <button className="btn btn-gold" onClick={() => navigate("login")} style={{ padding: "13px 28px", fontSize: 14 }}>
          Open Verity →
        </button>
      </Section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid #181B20", padding: "22px 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Mark size={17} />
            <span className="wordmark">Verity</span>
          </div>
          <span style={{ fontSize: 12, color: "#4E5360" }}>Find the truth in your settlement data.</span>
        </div>
      </footer>
    </div>
  );
}

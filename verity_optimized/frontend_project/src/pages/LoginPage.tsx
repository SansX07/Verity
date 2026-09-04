import { useState } from "react";
import { Page } from "../App";
import { Mark } from "../components/Mark";

interface Props { navigate: (p: Page) => void; }

export default function LoginPage({ navigate }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div style={{ minHeight: "100vh", background: "#08090C", display: "grid", gridTemplateColumns: "1fr 1fr" }}>

      {/* ── LEFT ── */}
      <div style={{ background: "#0E1012", borderRight: "1px solid #181B20", padding: "48px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
        {/* Grid */}
        <div className="grid-pattern" style={{ position: "absolute", inset: 0, opacity: 0.2, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -100, left: -100, width: 500, height: 500, background: "radial-gradient(ellipse, #C8A45A06 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Top */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 72, cursor: "pointer" }} onClick={() => navigate("landing")}>
            <Mark size={20} />
            <span className="wordmark">Verity</span>
          </div>
          <h1 style={{ fontSize: "clamp(30px, 3vw, 44px)", fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.1, margin: "0 0 18px", color: "#E8E4DE" }}>
            Find the truth<br />in your settlement<br />data.
          </h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "#868C99", maxWidth: 320 }}>
            Intelligent reconciliation and settlement operations for finance teams who need to trust their numbers.
          </p>
        </div>

        {/* Mini metrics card */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ background: "#141619", border: "1px solid #22262D", borderRadius: 6, padding: "18px 22px", maxWidth: 340, marginBottom: 24 }}>
            <div style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "#4E5360", textTransform: "uppercase", marginBottom: 12 }}>August Settlement — Batch 03</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
              <span className="mono" style={{ fontSize: 32, fontWeight: 700, color: "#E8E4DE", letterSpacing: "-0.03em" }}>87.1%</span>
              <span style={{ fontSize: 13, color: "#868C99" }}>reconciled</span>
            </div>
            {/* Progress bar */}
            <div style={{ height: 4, background: "#22262D", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ width: "87.1%", height: "100%", background: "linear-gradient(90deg, #2D7D5F, #4DC490)", borderRadius: 2 }} />
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: "#4DC490" }}>54</div>
                <div style={{ fontSize: 10, color: "#4E5360", textTransform: "uppercase", letterSpacing: "0.06em" }}>Matched</div>
              </div>
              <div style={{ width: 1, background: "#22262D" }} />
              <div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: "#F2AB4C" }}>8</div>
                <div style={{ fontSize: 10, color: "#4E5360", textTransform: "uppercase", letterSpacing: "0.06em" }}>Exceptions</div>
              </div>
              <div style={{ width: 1, background: "#22262D" }} />
              <div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: "#868C99" }}>62</div>
                <div style={{ fontSize: 10, color: "#4E5360", textTransform: "uppercase", letterSpacing: "0.06em" }}>Records</div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "#4E5360" }}>
            Verity · Reconciliation Intelligence Platform
          </div>
        </div>
      </div>

      {/* ── RIGHT ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 56px" }}>
        <div style={{ width: "100%", maxWidth: 340 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px", color: "#E8E4DE" }}>
            Sign in to Verity
          </h2>
          <p style={{ fontSize: 13.5, color: "#868C99", marginBottom: 32 }}>
            Enter your credentials to access your workspace.
          </p>

          <form onSubmit={e => { e.preventDefault(); navigate("overview"); }} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#868C99", marginBottom: 7, letterSpacing: "0.02em" }}>
                Email address
              </label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="finance@company.com" />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#868C99", letterSpacing: "0.02em" }}>Password</label>
                <span style={{ fontSize: 12, color: "#C8A45A", cursor: "pointer" }}>Forgot password?</span>
              </div>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••" />
            </div>

            <button type="submit" className="btn btn-gold" style={{ width: "100%", justifyContent: "center", padding: "12px", marginTop: 4, fontSize: 13.5 }}>
              Sign in →
            </button>
          </form>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #181B20", textAlign: "center" }}>
            <span style={{ fontSize: 13, color: "#4E5360" }}>
              Don't have access?{" "}
              <span style={{ color: "#C8A45A", cursor: "pointer" }}>Request access</span>
            </span>
          </div>

          <div style={{ marginTop: 28 }}>
            <button
              onClick={() => navigate("overview")}
              style={{ width: "100%", background: "#141619", border: "1px solid #22262D", color: "#868C99", padding: "9px", borderRadius: 4, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
              Continue as demo user →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { Page } from "../App";
import { Mark } from "../components/Mark";
import { useAppState } from "../lib/AppContext";
import { api, ExceptionItem, BatchSummary } from "../lib/api";
import { CATEGORY_LABELS } from "../lib/format";

interface Props { navigate: (p: Page) => void; }

interface Msg {
  role: "user" | "verity";
  text: string;
  refs?: { id: string; txn?: string; label: string }[];
}

const SUGGESTIONS: { q: string; hint: string }[] = [
  { q: "What are the most common issues in this batch?",   hint: "Pattern summary" },
  { q: "How accurate is this batch?",                       hint: "Match rate & precision" },
  { q: "Show me the amount mismatch exceptions.",           hint: "By exception type" },
  { q: "Which exceptions need immediate review?",           hint: "Open items" },
  { q: "If you had to prioritize fixing one category first, which and why?", hint: "Needs a connected AI model" },
];

export default function AskVerityPage({ navigate }: Props) {
  const { batchId, batchName, setSelectedExceptionId } = useAppState();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, thinking]);

  useEffect(() => {
    if (!batchId) return;
    api.getBatchExceptions(batchId).then(r => setExceptions(r.exceptions)).catch(() => {});
    api.getBatchSummary(batchId).then(setSummary).catch(() => {});
  }, [batchId]);

  const send = async (text: string) => {
    if (!text.trim() || thinking || !batchId) return;
    setMsgs(prev => [...prev, { role: "user", text: text.trim() }]);
    setInput("");
    setThinking(true);
    try {
      const res = await api.askVerity(batchId, text.trim());
      const refs = res.referenced_exception_ids
        .map(id => exceptions.find(e => e.exception_id === id))
        .filter((e): e is ExceptionItem => !!e)
        .map(e => ({ id: e.exception_id, txn: e.payment_id ?? e.order_id ?? undefined, label: CATEGORY_LABELS[e.category] ?? e.category }));
      setMsgs(prev => [...prev, { role: "verity", text: res.answer, refs: refs.length ? refs : undefined }]);
    } catch (err) {
      setMsgs(prev => [...prev, { role: "verity", text: err instanceof Error ? `Something went wrong: ${err.message}` : "Something went wrong reaching Verity." }]);
    } finally {
      setThinking(false);
    }
  };

  const openRef = (exceptionId: string) => {
    setSelectedExceptionId(exceptionId);
    navigate("exception-detail");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", maxWidth: 740, margin: "0 auto", padding: "0 40px" }}>
      <div style={{ padding: "30px 0 20px", borderBottom: "1px solid var(--border-faint)", flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: 5 }}>
          Ask Verity
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--text-2)" }}>
          Query your reconciliation data in plain English. Answers reference actual records only.
        </p>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>Active batch:</div>
          <span className="mono" style={{ fontSize: 11, color: "var(--gold)", background: "var(--gold-bg)", padding: "2px 8px", borderRadius: 2 }}>
            {batchName ?? "No batch selected"}{summary ? ` · ${summary.total_records} records` : ""}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 0" }}>
        {msgs.length === 0 ? (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
              Suggested queries
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s.q}
                  onClick={() => send(s.q)}
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "11px 14px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, transition: "background 90ms, border-color 90ms" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--card-hi)"; e.currentTarget.style.borderColor = "#2E333C"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--card)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "var(--gold)", fontSize: 12, flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: 13, color: "var(--text-2)" }}>{s.q}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0, fontStyle: "italic" }}>{s.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {msgs.map((m, i) => (
              <div key={i} className="enter-up" style={{ animationDelay: `${Math.min(i * 0.03, 0.15)}s` }}>
                {m.role === "user" ? (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ maxWidth: "78%", background: "var(--card-hi)", border: "1px solid var(--border)", borderRadius: "6px 6px 2px 6px", padding: "10px 14px" }}>
                      <p style={{ margin: 0, fontSize: 13.5, color: "var(--text)", lineHeight: 1.55 }}>{m.text}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, background: "var(--gold-bg)", border: "1px solid var(--gold-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Mark size={12} />
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--gold)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Verity</span>
                    </div>
                    <div style={{ maxWidth: "88%", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "2px 6px 6px 6px", padding: "12px 16px" }}>
                      <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{m.text}</p>
                      {m.refs && m.refs.length > 0 && (
                        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                          {m.refs.map(ref => (
                            <button
                              key={ref.id}
                              onClick={() => openRef(ref.id)}
                              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "border-color 90ms" }}
                              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--gold-border)")}
                              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                            >
                              {ref.txn && <span className="mono" style={{ fontSize: 11, color: "var(--gold)" }}>{ref.txn}</span>}
                              <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{ref.label}</span>
                              <span style={{ fontSize: 11, color: "var(--text-3)" }}>View →</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {thinking && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: "var(--gold-bg)", border: "1px solid var(--gold-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Mark size={12} />
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--gold)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Verity</span>
                </div>
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "2px 6px 6px 6px", padding: "11px 14px", display: "inline-flex", gap: 5, alignItems: "center" }}>
                  {[0, 1, 2].map(j => (
                    <div key={j} className="pulse" style={{ width: 4.5, height: 4.5, borderRadius: "50%", background: "var(--text-3)", animationDelay: `${j * 0.16}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, paddingBottom: 28, paddingTop: 12, borderTop: "1px solid var(--border-faint)" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
            placeholder="Ask about this reconciliation batch…"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={() => send(input)} disabled={!input.trim() || thinking} style={{ padding: "9px 18px" }}>
            Ask
          </button>
        </div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Verity only references data from the active reconciliation batch.
          </div>
          {msgs.length > 0 && (
            <button onClick={() => setMsgs([])} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

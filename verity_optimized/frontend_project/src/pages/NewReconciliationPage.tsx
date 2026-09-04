import { useState, useRef } from "react";
import { Page } from "../App";
import { useAppState } from "../lib/AppContext";
import { api } from "../lib/api";

interface Props { navigate: (p: Page) => void; }

const SETTLEMENT_EXAMPLE = `entity_id,type,debit,credit,amount,currency,fee,tax,on_hold,settled,created_at,settled_at,settlement_id,payment_id,settlement_utr,order_id,order_receipt,method,card_network,card_issuer,card_type,dispute_id\n\npay_ABC123,payment,0,98000,100000,INR,2000,360,0,1,1785510000,1785690000,setl_ABC123,pay_ABC123,UTR123456789,order_ABC123,rcpt_ABC123,card,Visa,HDFC,debit,`;

const LEDGER_EXAMPLE = `order_id,amount,created_at,customer_id,status\norder_ABC123,1000.00,2026-08-01T10:00:00,cust_ABC123,completed`;

function downloadExample(filename: string, content: string) {
  const blob = new Blob([content + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function UploadZone({ title, subtitle, file, onFile, accept: acceptExt = /\.csv$/i, acceptLabel = "CSV", errorLabel = "Only CSV files are accepted.", inputAccept = ".csv" }: {
  title: string; subtitle: string; file: File | null; onFile: (f: File) => void;
  accept?: RegExp; acceptLabel?: string; errorLabel?: string; inputAccept?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const accept = (f: File) => {
    setError(null);
    if (!f.name.match(acceptExt)) {
      setError(errorLabel);
      return;
    }
    onFile(f);
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#E8E4DE", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#4E5360", marginBottom: 14 }}>{subtitle}</div>

      <div
        className={`drop-zone${dragging ? " drag-over" : ""}`}
        style={{
          padding: "36px 28px",
          cursor: "pointer",
          textAlign: "center",
          background: file ? "#2D7D5F10" : "transparent",
          borderColor: file ? "#2D7D5F50" : dragging ? "#C8A45A50" : undefined,
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) accept(f); }}
        onClick={() => ref.current?.click()}
      >
        <input ref={ref} type="file" accept={inputAccept} style={{ display: "none" }}
          onChange={e => { if (e.target.files?.[0]) accept(e.target.files[0]); }} />

        {file ? (
          <div>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#2D7D5F18", border: "1px solid #2D7D5F40", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8.5L6.5 12L13 5" stroke="#4DC490" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#4DC490", marginBottom: 4 }}>{file.name}</div>
            <div style={{ fontSize: 11.5, color: "#4E5360" }}>{(file.size / 1024).toFixed(1)} KB · Click to replace</div>
          </div>
        ) : (
          <div>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#1A1D22", border: "1px solid #22262D", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#4E5360" strokeWidth="1.4">
                <path d="M8 11V4M5.5 6.5L8 4L10.5 6.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#E8E4DE", marginBottom: 5 }}>Drop file here</div>
            <div style={{ fontSize: 12.5, color: "#4E5360" }}>
              or <span style={{ color: "#C8A45A" }}>browse files</span>
            </div>
            <div style={{ fontSize: 11, color: "#4E5360", marginTop: 10 }}>{acceptLabel}</div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 10, padding: "10px 14px", background: "#9E3A3A16", border: "1px solid #9E3A3A40", borderRadius: 4 }}>
          <div style={{ fontSize: 12.5, color: "#E26262" }}>{error}</div>
          <div style={{ fontSize: 11.5, color: "#868C99", marginTop: 4 }}>Settlement and ledger files use different schemas. Use the examples below.</div>
        </div>
      )}
    </div>
  );
}

export default function NewReconciliationPage({ navigate }: Props) {
  const [settlement, setSettlement] = useState<File | null>(null);
  const [ledger, setLedger] = useState<File | null>(null);
  const [groundTruth, setGroundTruth] = useState<File | null>(null);
  const [name, setName] = useState("August Settlement — Batch 04");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { setBatchId, setBatchName } = useAppState();
  const canRun = settlement && ledger && name.trim() && !uploading;

  const runReconciliation = async () => {
    if (!settlement || !ledger || !name.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { batch_id } = await api.uploadBatch(settlement, ledger, name.trim(), groundTruth ?? undefined);
      setBatchId(batch_id);
      setBatchName(name.trim());
      navigate("processing");
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? `Upload failed: ${err.message}. Is the backend running at localhost:8000?`
          : "Upload failed. Is the backend running at localhost:8000?"
      );
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: "40px 48px", maxWidth: 760 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => navigate("overview")} style={{ background: "none", border: "none", color: "#4E5360", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 2L4 6L8 10" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Overview
        </button>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px", color: "#E8E4DE" }}>
        Start a reconciliation
      </h1>
      <p style={{ fontSize: 13.5, color: "#868C99", margin: "0 0 36px" }}>
        Compare a settlement report against your internal ledger.
      </p>

      {/* Batch name */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#868C99", marginBottom: 7, letterSpacing: "0.02em" }}>Batch name</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 380 }} />
      </div>

      {/* Two sources */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
        <div className="card" style={{ padding: "20px 22px" }}>
          <div style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "#C8A45A", textTransform: "uppercase", fontWeight: 600, marginBottom: 16 }}>Source A</div>
          <UploadZone title="Settlement Report" subtitle="Razorpay settlement CSV" file={settlement} onFile={setSettlement} />
        </div>
        <div className="card" style={{ padding: "20px 22px" }}>
          <div style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "#4E5360", textTransform: "uppercase", fontWeight: 600, marginBottom: 16 }}>Source B</div>
          <UploadZone title="Internal Ledger" subtitle="Your internal transaction ledger" file={ledger} onFile={setLedger} />
        </div>
      </div>

      {/* Required columns + working examples */}
      <div style={{ padding: "14px 16px", background: "#0E1012", border: "1px solid #22262D", borderRadius: 4, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#868C99", marginBottom: 10 }}>Required columns</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 11.5, color: "#E8E4DE", marginBottom: 5 }}>Settlement report (Razorpay-style)</div>
            <div className="mono" style={{ fontSize: 11, color: "#4E5360", lineHeight: 1.55 }}>payment_id, order_id, amount, fee, tax, created_at, settled_at</div>
            <button onClick={() => downloadExample("settlement_example.csv", SETTLEMENT_EXAMPLE)} className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 11, marginTop: 9 }}>Download settlement example</button>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: "#E8E4DE", marginBottom: 5 }}>Internal ledger</div>
            <div className="mono" style={{ fontSize: 11, color: "#4E5360", lineHeight: 1.55 }}>order_id, amount, created_at</div>
            <button onClick={() => downloadExample("ledger_example.csv", LEDGER_EXAMPLE)} className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 11, marginTop: 9 }}>Download ledger example</button>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "#4E5360", marginTop: 10 }}>CSV only. Settlement amounts are interpreted as paise; ledger amounts are interpreted as rupees.</div>
      </div>

      {/* Optional ground truth for live accuracy scoring */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 32 }}>
        <div style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "#4E5360", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
          Optional
        </div>
        <UploadZone
          title="Ground Truth"
          subtitle="Adds live Precision / Recall / F1 to the results page — skip this for a normal run."
          file={groundTruth}
          onFile={setGroundTruth}
          accept={/\.json$/i}
          inputAccept=".json"
          acceptLabel="JSON"
          errorLabel="Ground truth must be a .json file."
        />
      </div>

      {/* CTA */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          className="btn btn-gold"
          disabled={!canRun}
          onClick={runReconciliation}
          style={{ padding: "11px 22px", fontSize: 14 }}
        >
          {uploading ? "Uploading…" : "Run reconciliation →"}
        </button>
        <button className="btn btn-ghost" onClick={() => navigate("overview")} style={{ padding: "11px 18px" }}>
          Cancel
        </button>
      </div>

      {uploadError && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "#9E3A3A16", border: "1px solid #9E3A3A40", borderRadius: 4 }}>
          <div style={{ fontSize: 12.5, color: "#E26262" }}>{uploadError}</div>
        </div>
      )}

      {!canRun && !uploading && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#4E5360" }}>
          {!settlement && !ledger ? "Upload both source files to continue." :
           !settlement ? "Upload the settlement file." : "Upload the ledger file."}
        </div>
      )}
    </div>
  );
}

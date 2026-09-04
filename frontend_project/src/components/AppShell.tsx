import { Page } from "../App";
import OverviewPage from "../pages/OverviewPage";
import NewReconciliationPage from "../pages/NewReconciliationPage";
import ProcessingPage from "../pages/ProcessingPage";
import ResultsPage from "../pages/ResultsPage";
import ExceptionDetailPage from "../pages/ExceptionDetailPage";
import AskVerityPage from "../pages/AskVerityPage";
import ModelLearningPage from "../pages/ModelLearningPage";
import { Mark } from "./Mark";

interface Props {
  page: Page;
  navigate: (p: Page) => void;
  processingStage: number;
  setProcessingStage: (n: number) => void;
}

/* ─── Nav Icons ─── */
const IconOverview = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
    <rect x=".5" y=".5" width="5.5" height="5.5" rx="1.2" />
    <rect x="8" y=".5" width="5.5" height="5.5" rx="1.2" />
    <rect x=".5" y="8" width="5.5" height="5.5" rx="1.2" />
    <rect x="8" y="8" width="5.5" height="5.5" rx="1.2" />
  </svg>
);
const IconList = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="3.5" x2="12" y2="3.5" />
    <line x1="2" y1="7" x2="12" y2="7" />
    <line x1="2" y1="10.5" x2="12" y2="10.5" />
  </svg>
);
const IconFlag = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2.5h8L9 5.5l2 3H3V2.5z" />
    <line x1="3" y1="11.5" x2="3" y2="2.5" />
  </svg>
);
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="5.8" cy="5.8" r="3.6" />
    <line x1="8.8" y1="8.8" x2="12" y2="12" />
  </svg>
);
const IconTrend = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1,11 4,7.5 7,8.8 12,3.5" />
    <polyline points="10,3.5 12,3.5 12,5.5" />
  </svg>
);
const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <line x1="6" y1="1" x2="6" y2="11" />
    <line x1="1" y1="6" x2="11" y2="6" />
  </svg>
);

const OPS_NAV: { label: string; page: Page; Icon: React.FC }[] = [
  { label: "Overview",        page: "overview",         Icon: IconOverview },
  { label: "Reconciliations", page: "results",          Icon: IconList     },
  { label: "Exceptions",      page: "exception-detail", Icon: IconFlag     },
];
const INTEL_NAV: { label: string; page: Page; Icon: React.FC }[] = [
  { label: "Ask Verity",    page: "ask-verity",    Icon: IconSearch },
  { label: "Confidence Calibration",page: "model-learning", Icon: IconTrend  },
];

function NavItem({ label, page, Icon, currentPage, navigate }: {
  label: string; page: Page; Icon: React.FC; currentPage: Page; navigate: (p: Page) => void;
}) {
  const active = currentPage === page;
  return (
    <div className={`nav-item${active ? " active" : ""}`} onClick={() => navigate(page)}>
      <span className="nav-icon"><Icon /></span>
      <span>{label}</span>
    </div>
  );
}

export default function AppShell({ page, navigate, processingStage, setProcessingStage }: Props) {
  const renderPage = () => {
    switch (page) {
      case "overview":           return <OverviewPage navigate={navigate} />;
      case "new-reconciliation": return <NewReconciliationPage navigate={navigate} />;
      case "processing":         return <ProcessingPage navigate={navigate} stage={processingStage} setStage={setProcessingStage} />;
      case "results":            return <ResultsPage navigate={navigate} />;
      case "exception-detail":   return <ExceptionDetailPage navigate={navigate} />;
      case "ask-verity":         return <AskVerityPage navigate={navigate} />;
      case "model-learning":     return <ModelLearningPage navigate={navigate} />;
      default:                   return <OverviewPage navigate={navigate} />;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)", overflow: "hidden" }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 212,
        flexShrink: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--border-faint)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}>
        {/* Logo */}
        <div
          style={{ padding: "17px 14px 15px", borderBottom: "1px solid var(--border-faint)", display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}
          onClick={() => navigate("overview")}
        >
          <Mark size={17} />
          <span className="wordmark">Verity</span>
        </div>

        {/* Nav groups */}
        <div style={{ flex: 1, padding: "8px 6px", overflowY: "auto" }}>
          {/* Operations */}
          <div className="nav-section-label">Operations</div>
          {OPS_NAV.map(item => (
            <NavItem key={item.page} {...item} currentPage={page} navigate={navigate} />
          ))}

          {/* Intelligence */}
          <div className="nav-section-label" style={{ marginTop: 4 }}>Intelligence</div>
          {INTEL_NAV.map(item => (
            <NavItem key={item.page} {...item} currentPage={page} navigate={navigate} />
          ))}
        </div>

        {/* New reconciliation CTA */}
        <div style={{ padding: "8px 6px", borderTop: "1px solid var(--border-faint)" }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate("new-reconciliation")}
            style={{ width: "100%", padding: "8px 12px", fontSize: 12, gap: 7, justifyContent: "flex-start" }}
          >
            <IconPlus />
            New reconciliation
          </button>
        </div>

        {/* User */}
        <div style={{
          padding: "11px 14px",
          borderTop: "1px solid var(--border-faint)",
          display: "flex",
          alignItems: "center",
          gap: 9,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "var(--card-hi)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "var(--text-3)", flexShrink: 0,
          }}>
            AP
          </div>
          <div style={{ overflow: "hidden", flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Arjun Patel
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>Finance Operations</div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
        {renderPage()}
      </main>
    </div>
  );
}

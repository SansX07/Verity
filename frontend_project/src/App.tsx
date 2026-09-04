import { useState } from "react";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import AppShell from "./components/AppShell";
import { AppStateProvider } from "./lib/AppContext";

export type Page =
  | "landing"
  | "login"
  | "overview"
  | "new-reconciliation"
  | "processing"
  | "results"
  | "exception-detail"
  | "ask-verity"
  | "model-learning";

function AppInner() {
  const [page, setPage] = useState<Page>("landing");
  const [processingStage, setProcessingStage] = useState(0);

  const navigate = (p: Page) => {
    if (p === "processing") setProcessingStage(0);
    setPage(p);
    window.scrollTo(0, 0);
  };

  if (page === "landing") return <LandingPage navigate={navigate} />;
  if (page === "login") return <LoginPage navigate={navigate} />;

  return (
    <AppShell
      page={page}
      navigate={navigate}
      processingStage={processingStage}
      setProcessingStage={setProcessingStage}
    />
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppInner />
    </AppStateProvider>
  );
}

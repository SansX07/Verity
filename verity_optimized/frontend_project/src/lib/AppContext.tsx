import { createContext, useContext, useState, ReactNode } from "react";

interface AppState {
  batchId: string | null;
  setBatchId: (id: string | null) => void;
  batchName: string | null;
  setBatchName: (name: string | null) => void;
  selectedExceptionId: string | null;
  setSelectedExceptionId: (id: string | null) => void;
}

const AppStateContext = createContext<AppState | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchName, setBatchName] = useState<string | null>(null);
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);

  return (
    <AppStateContext.Provider
      value={{ batchId, setBatchId, batchName, setBatchName, selectedExceptionId, setSelectedExceptionId }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}

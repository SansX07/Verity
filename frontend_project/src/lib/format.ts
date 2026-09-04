export function formatRupees(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDiff(details: { diff?: number | null; date_diff_days?: number | null }, category: string): string {
  if (category === "DATE_DRIFT" && details.date_diff_days !== null && details.date_diff_days !== undefined) {
    return `${Math.round(details.date_diff_days)}d`;
  }
  if (details.diff === null || details.diff === undefined || details.diff === 0) return "—";
  return formatRupees(Math.abs(details.diff));
}

export const CATEGORY_LABELS: Record<string, string> = {
  AMOUNT_MISMATCH: "Amount Mismatch",
  MISSING_IN_LEDGER: "Missing in Ledger",
  MISSING_IN_SETTLEMENT: "Missing in Settlement",
  DUPLICATE: "Duplicate",
  DATE_DRIFT: "Date Drift",
  ID_AMBIGUOUS: "ID Ambiguous",
  EXACT_MATCH: "Exact Match",
};

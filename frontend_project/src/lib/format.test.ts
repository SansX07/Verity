import { describe, it, expect } from "vitest";
import { formatRupees, formatDiff, CATEGORY_LABELS } from "./format";

// These are the functions rendered directly on-screen during the live pitch
// (exception amounts, diffs, category names) — a formatting bug here is the
// kind of thing that's invisible in code review but obvious the moment a
// judge is looking at the demo.

describe("formatRupees", () => {
  it("formats a positive number with the rupee symbol and Indian grouping", () => {
    expect(formatRupees(1240)).toBe("₹1,240");
  });

  it("formats large amounts with Indian-style digit grouping (lakhs)", () => {
    expect(formatRupees(123456)).toBe("₹1,23,456");
  });

  it("returns an em dash for null", () => {
    expect(formatRupees(null)).toBe("—");
  });

  it("returns an em dash for undefined", () => {
    expect(formatRupees(undefined)).toBe("—");
  });

  it("formats zero as ₹0, not a dash", () => {
    expect(formatRupees(0)).toBe("₹0");
  });
});

describe("formatDiff", () => {
  it("formats a DATE_DRIFT diff as whole days, not rupees", () => {
    expect(formatDiff({ date_diff_days: 3.2 }, "DATE_DRIFT")).toBe("3d");
  });

  it("rounds fractional date drift to the nearest day", () => {
    expect(formatDiff({ date_diff_days: 2.6 }, "DATE_DRIFT")).toBe("3d");
  });

  it("formats an AMOUNT_MISMATCH diff as an absolute rupee value", () => {
    expect(formatDiff({ diff: -40 }, "AMOUNT_MISMATCH")).toBe("₹40");
  });

  it("returns an em dash when diff is exactly zero", () => {
    expect(formatDiff({ diff: 0 }, "AMOUNT_MISMATCH")).toBe("—");
  });

  it("returns an em dash when diff is missing entirely", () => {
    expect(formatDiff({}, "DUPLICATE")).toBe("—");
  });
});

describe("CATEGORY_LABELS", () => {
  it("has a human-readable label for all seven exception categories used by the backend", () => {
    const expectedKeys = [
      "AMOUNT_MISMATCH", "MISSING_IN_LEDGER", "MISSING_IN_SETTLEMENT",
      "DUPLICATE", "DATE_DRIFT", "ID_AMBIGUOUS", "EXACT_MATCH",
    ];
    for (const key of expectedKeys) {
      expect(CATEGORY_LABELS[key]).toBeDefined();
      expect(CATEGORY_LABELS[key]).not.toBe("");
    }
  });
});

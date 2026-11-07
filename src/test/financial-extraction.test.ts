import { describe, expect, it } from "vitest";
import { convertUnits, detectBasis, detectUnits, mapLabel, parseFiscalYear, parseIndianNumber } from "@/lib/financial-metrics";
import { initialReviewStatus, validateFinancials } from "@/lib/financial-validation";

describe("Indian number parsing", () => {
  it("parses lakh-style grouping", () => expect(parseIndianNumber("1,23,456.78")).toBe(123456.78));
  it("treats brackets as negative", () => expect(parseIndianNumber("(1,234)")).toBe(-1234));
  it("returns null for dashes", () => expect(parseIndianNumber("-")).toBeNull());
});

describe("unit conversion", () => {
  it("1 crore = 100 lakh", () => expect(convertUnits(1, "crore", "lakh")).toBe(100));
  it("10 million = 1 crore", () => expect(convertUnits(10, "million", "crore")).toBe(1));
  it("detects ₹ in crore", () => expect(detectUnits("(All amounts in ₹ crore)")).toBe("crore"));
  it("detects Rs. in lakhs", () => expect(detectUnits("Rs. in Lakhs")).toBe("lakh"));
});

describe("Indian fiscal year headers", () => {
  it.each([["FY24", 2024], ["2023-24", 2024], ["Mar-24", 2024], ["March 31, 2024", 2024], ["31.03.2023", 2023], ["FY 2022-23", 2023]])("%s → %d", (h, fy) => {
    expect(parseFiscalYear(h)).toBe(fy);
  });
});

describe("basis and label mapping", () => {
  it("detects consolidated", () => expect(detectBasis("Consolidated Balance Sheet as at 31 March 2024")).toBe("consolidated"));
  it("maps Schedule III labels", () => {
    expect(mapLabel("Revenue from operations")?.key).toBe("revenue");
    expect(mapLabel("Total equity and liabilities")?.key).toBe("total_equity_and_liabilities");
  });
});

describe("validation", () => {
  it("flags a balance sheet that is off by more than 0.5%", () => {
    const issues = validateFinancials(
      [
        { fiscal_year: 2024, metric_key: "total_assets", value: 1000 },
        { fiscal_year: 2024, metric_key: "total_equity_and_liabilities", value: 990 },
      ],
      [2024],
    );
    expect(issues.find((i) => i.rule_key === "balance_sheet_balances")?.passed).toBe(false);
  });
  it("accepts a balance sheet within 0.5%", () => {
    const issues = validateFinancials(
      [
        { fiscal_year: 2024, metric_key: "total_assets", value: 1000 },
        { fiscal_year: 2024, metric_key: "total_equity", value: 600 },
        { fiscal_year: 2024, metric_key: "total_liabilities", value: 398 },
      ],
      [2024],
    );
    expect(issues.find((i) => i.rule_key === "balance_sheet_balances")?.passed).toBe(true);
  });
  it("flags cash roll-forward mismatch", () => {
    const issues = validateFinancials(
      [
        { fiscal_year: 2024, metric_key: "opening_cash", value: 100 },
        { fiscal_year: 2024, metric_key: "net_change_in_cash", value: 50 },
        { fiscal_year: 2024, metric_key: "closing_cash", value: 170 },
      ],
      [2024],
    );
    expect(issues.find((i) => i.rule_key === "cash_roll_forward")?.passed).toBe(false);
  });
  it("flags conflicting duplicates across documents", () => {
    const issues = validateFinancials(
      [
        { fiscal_year: 2023, metric_key: "revenue", value: 500, document_id: "a" },
        { fiscal_year: 2023, metric_key: "revenue", value: 520, document_id: "b" },
      ],
      [2023],
    );
    expect(issues.some((i) => i.rule_key === "duplicate_conflict")).toBe(true);
  });
  it("never auto-approves values below 0.9 confidence", () => {
    expect(initialReviewStatus(0.85, [])).toBe("needs_review");
    expect(initialReviewStatus(0.95, ["unit_unknown"])).toBe("needs_review");
    expect(initialReviewStatus(0.95, [])).toBe("high_confidence");
  });
});

import { describe, expect, it } from "vitest";
import { convertUnits, detectBasis, detectUnits, mapLabel, parseFiscalYear, parseIndianNumber } from "@/lib/financial-metrics";
import { approvalBlockers, consolidate, initialReviewStatus, validateFinancials } from "@/lib/financial-validation";

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
        { fiscal_year: 2023, metric_key: "revenue", value: 500, document_id: "a", statement: "income_statement", reporting_basis: "consolidated", source_unit: "crore", flags: ["pdf_text_extracted"] },
        { fiscal_year: 2023, metric_key: "revenue", value: 520, document_id: "b", statement: "income_statement", reporting_basis: "consolidated", source_unit: "crore", flags: ["pdf_text_extracted"] },
      ],
      [2023],
    );
    const conflict = issues.find((i) => i.rule_key === "duplicate_conflict");
    expect(conflict).toBeDefined();
    expect(approvalBlockers(issues)).toContain(conflict);
  });
  it("prefers a newer overlapping report only for the same basis and source units", () => {
    const overlap = [
      { fiscal_year: 2024, metric_key: "revenue", value: 100, document_id: "older", statement: "income_statement" as const, reporting_basis: "consolidated", source_unit: "crore", source_report_fiscal_year: 2024, source_report_date: "2025-01-01", flags: ["pdf_text_extracted"] },
      { fiscal_year: 2024, metric_key: "revenue", value: 120, document_id: "newer", statement: "income_statement" as const, reporting_basis: "consolidated", source_unit: "crore", source_report_fiscal_year: 2025, source_report_date: "2026-01-01", flags: ["pdf_text_extracted"] },
    ];
    const sameBasisAndUnits = consolidate(overlap);
    expect(sameBasisAndUnits.chosen.get("2024|revenue")).toBe(120);
    expect(sameBasisAndUnits.conflicts).toHaveLength(1);
    expect(sameBasisAndUnits.conflicts[0]?.reason).toContain("comparative values");

    const mixedBasis = consolidate([
      overlap[0]!,
      { ...overlap[1]!, reporting_basis: "standalone" },
    ]);
    expect(mixedBasis.chosen.has("2024|revenue")).toBe(false);
    expect(mixedBasis.conflicts[0]?.rule_key).toBe("source_context_mismatch");
    expect(mixedBasis.conflicts[0]?.reason).toContain("values were not compared");

    const mixedUnits = consolidate([
      overlap[0]!,
      { ...overlap[1]!, source_unit: "lakh" },
    ]);
    expect(mixedUnits.chosen.has("2024|revenue")).toBe(false);
    expect(mixedUnits.conflicts[0]?.rule_key).toBe("source_context_mismatch");
    expect(mixedUnits.conflicts[0]?.reason).toContain("values were not compared");
  });
  it("recognizes matching current-year and comparative figures as the same reported value", () => {
    const result = consolidate([
      { fiscal_year: 2021, metric_key: "revenue", value: 100, document_id: "fy2021", statement: "income_statement", reporting_basis: "consolidated", source_unit: "crore", source_report_fiscal_year: 2021, flags: ["pdf_text_extracted"] },
      { fiscal_year: 2021, metric_key: "revenue", value: 100, document_id: "fy2022", statement: "income_statement", reporting_basis: "consolidated", source_unit: "crore", source_report_fiscal_year: 2022, flags: ["pdf_text_extracted"] },
    ]);

    expect(result.chosen.get("2021|revenue")).toBe(100);
    expect(result.conflicts).toHaveLength(0);
  });
  it("keeps statement type in the validation comparison context", () => {
    const result = consolidate([
      { fiscal_year: 2024, metric_key: "revenue", value: 100, statement: "income_statement", reporting_basis: "consolidated", source_unit: "crore", flags: ["pdf_text_extracted"] },
      { fiscal_year: 2024, metric_key: "revenue", value: 100, statement: "balance_sheet", reporting_basis: "consolidated", source_unit: "crore", flags: ["pdf_text_extracted"] },
    ]);

    expect(result.chosen.has("2024|revenue")).toBe(false);
    expect(result.conflicts[0]?.rule_key).toBe("source_context_mismatch");
  });
  it("does not report standalone and consolidated values as duplicate conflicts", () => {
    const issues = validateFinancials([
      { fiscal_year: 2024, metric_key: "revenue", value: 100, reporting_basis: "consolidated", source_unit: "crore", flags: ["pdf_text_extracted"] },
      { fiscal_year: 2024, metric_key: "revenue", value: 80, reporting_basis: "standalone", source_unit: "crore", flags: ["pdf_text_extracted"] },
    ], [2024]);

    expect(issues.some((issue) => issue.rule_key === "duplicate_conflict")).toBe(false);
    expect(issues.some((issue) => issue.rule_key === "source_context_mismatch")).toBe(true);
  });
  it("does not compare values reported in different units", () => {
    const issues = validateFinancials([
      { fiscal_year: 2024, metric_key: "revenue", value: 100, reporting_basis: "consolidated", source_unit: "crore", flags: ["pdf_text_extracted"] },
      { fiscal_year: 2024, metric_key: "revenue", value: 10000, reporting_basis: "consolidated", source_unit: "lakh", flags: ["pdf_text_extracted"] },
    ], [2024]);

    expect(issues.some((issue) => issue.rule_key === "duplicate_conflict")).toBe(false);
    expect(issues.find((issue) => issue.rule_key === "source_context_mismatch")?.message).toContain("figures were not compared");
  });
  it("keeps a single PDF value eligible for validation when it has no duplicate report", () => {
    const result = consolidate([
      { fiscal_year: 2024, metric_key: "revenue", value: 100, flags: ["pdf_text_extracted"] },
    ]);
    expect(result.chosen.get("2024|revenue")).toBe(100);
    expect(result.conflicts).toHaveLength(0);
  });
  it("keeps missing core figures as warnings but blocks approval", () => {
    const issues = validateFinancials([], [2024]);
    const missing = issues.find((issue) => issue.rule_key === "missing_core");
    expect(missing?.severity).toBe("warning");
    expect(missing?.message).toContain("Revenue from operations");
    expect(approvalBlockers(issues)).toContain(missing);
  });
  it("does not block approval on non-critical warnings alone", () => {
    expect(approvalBlockers([
      { rule_key: "cash_flow_sum", severity: "warning", fiscal_year: 2024, message: "May include FX effects.", passed: false },
    ])).toEqual([]);
  });
  it("never auto-approves values below 0.9 confidence", () => {
    expect(initialReviewStatus(0.85, [])).toBe("needs_review");
    expect(initialReviewStatus(0.95, ["unit_unknown"])).toBe("needs_review");
    expect(initialReviewStatus(0.95, ["fuzzy_label"])).toBe("needs_review");
    expect(initialReviewStatus(0.95, ["pdf_text_extracted"])).toBe("high_confidence");
    expect(initialReviewStatus(0.95, [])).toBe("high_confidence");
  });
});

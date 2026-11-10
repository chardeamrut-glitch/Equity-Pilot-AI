import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  readFinancialWorkbook,
  validateImportedFinancialYears,
  validateFinancialWorkbook,
  type FinancialWorkbook,
  type FinancialYearDraft,
} from "@/lib/excel-import";
import { analyzeFinancials } from "@/lib/financial-analysis";

const financialRow = (year: string): FinancialYearDraft => ({
  year,
  revenue: "100",
  ebitda: "20",
  ebit: "15",
  netProfit: "10",
  totalDebt: "5",
  totalEquity: "40",
  currentAssets: "25",
  currentLiabilities: "10",
  operatingCashFlow: "12",
  capex: "3",
  averageEquity: "",
  averageCapitalEmployed: "",
});

const workbookFor = (
  overrides: Partial<FinancialWorkbook> = {},
): FinancialWorkbook => ({
  rows: [],
  declaredUnits: [],
  missingColumns: [],
  duplicateColumns: [],
  ...overrides,
});

describe("Excel financial data import and validation", () => {
  it("imports editable rows and detects units stated in column headers", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Financial year",
        "Revenue (₹ crore)",
        "EBITDA",
        "EBIT",
        "Net profit",
        "Total debt",
        "Total equity",
        "Current assets",
        "Current liabilities",
        "Operating cash flow",
        "Capex",
      ],
      [2023, 100, 20, 15, 10, 5, 40, 25, 10, 12, 3],
      [2024, null, 22, 16, 11, 4, 42, 26, 11, 13, 4],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Statements");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = new File([], "financials.xlsx");
    Object.defineProperty(file, "size", { value: buffer.byteLength });
    Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });

    const imported = await readFinancialWorkbook(file);

    expect(imported.declaredUnits).toEqual(["crore"]);
    expect(imported.rows[0]?.revenue).toBe("100");
    expect(imported.rows[1]?.revenue).toBe("");
  });

  it("keeps blank required values missing and never coerces them to zero", () => {
    const rows = [financialRow("2023"), { ...financialRow("2024"), revenue: "" }];
    const result = validateFinancialWorkbook(workbookFor(), rows, "crore");

    expect(result.issues.some((issue) => issue.rule_key === "missing_value" && issue.field === "revenue")).toBe(true);
    expect(result.financialYears).toBeNull();
  });

  it("allows financial analysis once critical input errors are corrected", () => {
    const blocked = validateFinancialWorkbook(
      workbookFor(),
      [financialRow("2023"), { ...financialRow("2024"), revenue: "bad" }],
      "crore",
    );
    const resolved = validateFinancialWorkbook(
      workbookFor(),
      [financialRow("2023"), financialRow("2024")],
      "crore",
    );

    expect(blocked.financialYears).toBeNull();
    expect(resolved.financialYears).not.toBeNull();
    if (!resolved.financialYears) throw new Error("Expected valid financial years");
    expect(analyzeFinancials(resolved.financialYears)).toHaveLength(2);
  });

  it("revalidates imported financial years and preserves optional values and missing fields", () => {
    const result = validateImportedFinancialYears(
      [
        {
          year: "2023",
          revenue: 100,
          ebitda: 20,
          ebit: 15,
          netProfit: 10,
          totalDebt: 5,
          totalEquity: 40,
          currentAssets: 25,
          currentLiabilities: 10,
          operatingCashFlow: 12,
          capex: 3,
          averageEquity: 30,
          averageCapitalEmployed: null,
        },
        {
          year: "2024",
          revenue: 110,
          ebitda: 22,
          ebit: 16,
          netProfit: 11,
          totalDebt: 4,
          totalEquity: 42,
          currentAssets: 26,
          currentLiabilities: 11,
          operatingCashFlow: 13,
          capex: 4,
        },
      ],
      ["crore"],
      [],
      "crore",
    );

    expect(result.financialYears?.[0]).toMatchObject({
      year: "2023",
      currentAssets: 25,
      currentLiabilities: 10,
      averageEquity: 30,
    });
    expect(result.financialYears?.[0]?.averageCapitalEmployed).toBeUndefined();
    expect(result.financialYears?.[1]?.averageEquity).toBeUndefined();
    expect(result.issues.some((issue) => issue.severity === "error")).toBe(false);
  });

  it("allows explicit zero and parses parenthesized negative values", () => {
    const rows = [financialRow("2023"), { ...financialRow("2024"), revenue: "0", capex: "(3)" }];
    const result = validateFinancialWorkbook(workbookFor(), rows, "crore");

    expect(result.financialYears?.[1]?.revenue).toBe(0);
    expect(result.financialYears?.[1]?.capex).toBe(-3);
  });

  it("flags invalid numbers and duplicate fiscal years across equivalent labels", () => {
    const rows = [
      { ...financialRow("FY24"), ebitda: "not-a-number" },
      financialRow("2023-24"),
    ];
    const result = validateFinancialWorkbook(workbookFor(), rows, "crore");

    expect(result.issues.some((issue) => issue.rule_key === "invalid_number" && issue.field === "ebitda")).toBe(true);
    expect(result.issues.some((issue) => issue.rule_key === "duplicate_year")).toBe(true);
    expect(result.financialYears).toBeNull();
  });

  it("blocks mixed and mismatched reporting units until the unit matches", () => {
    const rows = [financialRow("2023"), financialRow("2024")];
    const mismatched = validateFinancialWorkbook(
      workbookFor({ declaredUnits: ["lakh"] }),
      rows,
      "crore",
    );
    const matched = validateFinancialWorkbook(
      workbookFor({ declaredUnits: ["lakh"] }),
      rows,
      "lakh",
    );
    const mixed = validateFinancialWorkbook(
      workbookFor({ declaredUnits: ["crore", "lakh"] }),
      rows,
      "crore",
    );

    expect(mismatched.issues.some((issue) => issue.rule_key === "unit_mismatch")).toBe(true);
    expect(mismatched.financialYears).toBeNull();
    expect(matched.financialYears).not.toBeNull();
    expect(mixed.issues.some((issue) => issue.rule_key === "unit_inconsistent")).toBe(true);
    expect(mixed.financialYears).toBeNull();
  });

  it("flags missing years and invalid year counts", () => {
    const result = validateFinancialWorkbook(
      workbookFor(),
      [{ ...financialRow(""), revenue: "1" }],
      "crore",
    );

    expect(result.issues.some((issue) => issue.rule_key === "missing_year")).toBe(true);
    expect(result.issues.some((issue) => issue.rule_key === "year_count")).toBe(true);
    expect(result.financialYears).toBeNull();
  });
});

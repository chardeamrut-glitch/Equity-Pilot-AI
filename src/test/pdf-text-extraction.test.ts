import { describe, expect, it } from "vitest";
import { extractionRowKey, parsePdfTextPages, rowsNotAlreadyExtracted } from "@/lib/extraction.server";

describe("text-based PDF parsing", () => {
  const identity = {
    document_id: "document-a",
    reporting_basis: "consolidated" as const,
    fiscal_year: 2024,
    metric_key: "revenue",
    statement: "income_statement" as const,
    raw_label: "Revenue from operations",
    value: 125,
    page_ref: "p.12",
  };

  it("skips a same-document, same-page occurrence already stored from a prior retry", () => {
    expect(rowsNotAlreadyExtracted([identity], (row) => row, [identity])).toEqual([]);
  });

  it("preserves an equal same-document occurrence from a different page", () => {
    const secondPage = { ...identity, page_ref: "p.13" };

    expect(rowsNotAlreadyExtracted([secondPage], (row) => row, [identity])).toEqual([secondPage]);
    expect(extractionRowKey(identity)).not.toBe(extractionRowKey(secondPage));
  });

  it("preserves an equal metric occurrence from a different source document", () => {
    const otherDocument = { ...identity, document_id: "document-b" };

    expect(rowsNotAlreadyExtracted([otherDocument], (row) => row, [identity])).toEqual([otherDocument]);
    expect(extractionRowKey(identity)).not.toBe(extractionRowKey(otherDocument));
  });

  it("matches same-page repeated occurrences by count, not just metric and value", () => {
    const repeated = [identity, { ...identity, raw_label: "Revenue" }];
    const firstOccurrenceOnly = rowsNotAlreadyExtracted(repeated, (row) => row, [identity]);
    expect(firstOccurrenceOnly).toHaveLength(1);
    expect(firstOccurrenceOnly[0]?.raw_label).toBe("Revenue");
    expect(rowsNotAlreadyExtracted(repeated, (row) => row, repeated)).toEqual([]);
  });

  it("includes document, reporting basis, year, statement, page, and value in retry identity", () => {
    const row = {
      ...identity,
    };

    expect(extractionRowKey(row)).toBe(extractionRowKey({ ...row, raw_label: "Revenue" }));
    expect(extractionRowKey(row)).not.toBe(extractionRowKey({ ...row, value: 126 }));
    expect(extractionRowKey(row)).not.toBe(extractionRowKey({ ...row, fiscal_year: 2023 }));
    expect(extractionRowKey(row)).not.toBe(extractionRowKey({ ...row, reporting_basis: "standalone" }));
  });

  it("keeps only recognized metric rows and omits missing or unrelated figures", () => {
    const parsed = parsePdfTextPages([
      "Consolidated Balance Sheet\nParticulars 2024 2023\nTotal assets 100 90\nOther contingent reconciliation item 25 15\nUnmapped liabilities — —",
    ]);

    expect(parsed.basis).toBe("consolidated");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((item) => item.metric_key === "total_assets")).toBe(true);
    expect(parsed.items.some((item) => item.raw_label === "Unmapped liabilities")).toBe(false);
    expect(parsed.warnings).toContain("Some statement lines were skipped because their year columns and values could not be aligned safely.");
    expect(parsed.items.every((item) =>
      item.statement != null && ["income_statement", "balance_sheet", "cash_flow"].includes(item.statement),
    )).toBe(true);
  });

  it("maps five-year statement rows past note columns and ignores dates and page references", () => {
    const years = "2026 2025 2024 2023 2022";
    const parsed = parsePdfTextPages([
      [
        "Consolidated Balance Sheet",
        `Particulars Note No. ${years}`,
        `Total equity 12 500 450 400 350 300`,
        `Total liabilities 13 500 450 400 350 300`,
        `Total assets 14 1000 900 800 700 600`,
        `Date 31 March 2026 31 March 2025`,
        `See note 21 and page 8`,
        `Revenue grew by 12% to 2,600 during the year`,
        "Consolidated Statement of Profit and Loss",
        `Particulars Note No. ${years}`,
        `Revenue from operations 18 2500 2200 2000 1800 1600`,
        `Profit before taxation 19 300 270 240 210 180`,
        `Profit for the year after tax 20 220 200 180 160 140`,
        "Consolidated Statement of Cash Flows",
        `Particulars Note No. ${years}`,
        `Net cash generated from operating activities 31 330 300 270 240 210`,
      ].join("\n"),
    ]);

    for (const fiscalYear of [2022, 2023, 2024, 2025, 2026]) {
      expect(parsed.items).toContainEqual(expect.objectContaining({ metric_key: "revenue", fiscal_year: fiscalYear }));
      expect(parsed.items).toContainEqual(expect.objectContaining({ metric_key: "profit_before_tax", fiscal_year: fiscalYear }));
      expect(parsed.items).toContainEqual(expect.objectContaining({ metric_key: "net_profit", fiscal_year: fiscalYear }));
      expect(parsed.items).toContainEqual(expect.objectContaining({ metric_key: "total_equity", fiscal_year: fiscalYear }));
      expect(parsed.items).toContainEqual(expect.objectContaining({ metric_key: "total_liabilities", fiscal_year: fiscalYear }));
      expect(parsed.items).toContainEqual(expect.objectContaining({ metric_key: "total_assets", fiscal_year: fiscalYear }));
      expect(parsed.items).toContainEqual(expect.objectContaining({ metric_key: "cash_from_operations", fiscal_year: fiscalYear }));
    }
    expect(parsed.items.some((item) => item.raw_label.startsWith("Date"))).toBe(false);
    expect(parsed.items.some((item) => item.raw_label.startsWith("See note"))).toBe(false);
    expect(parsed.items.some((item) => item.raw_label.startsWith("Revenue grew"))).toBe(false);
    expect(parsed.items).toHaveLength(35);
  });

  it("retains a plausible fuzzy metric mapping for manual review but rejects narrative figures", () => {
    const parsed = parsePdfTextPages([
      [
        "Consolidated Statement of Profit and Loss",
        "Particulars 2024 2023",
        "Revenue from operations excluding excise 2500 2200",
        "Revenue from operations grew by 12% to 2600",
      ].join("\n"),
    ]);

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.map((item) => item.fiscal_year)).toEqual([2024, 2023]);
    expect(parsed.items.every((item) => item.flags.includes("fuzzy_label"))).toBe(true);
    expect(parsed.items.every((item) => item.confidence < 0.9)).toBe(true);
    expect(parsed.warnings).toContain("Some statement lines were skipped because their year columns and values could not be aligned safely.");
  });

  it("does not mix standalone statements into a consolidated extraction", () => {
    const pages = [
      "Consolidated Balance Sheet\nParticulars 2024 2023\nTotal assets 1000 900",
      "Standalone Balance Sheet\nParticulars 2024 2023\nTotal assets 500 450",
    ];

    const parsed = parsePdfTextPages(pages, pages.length, "consolidated");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items.every((item) => item.metric_key === "total_assets")).toBe(true);
    expect(parsed.items.map((item) => item.value)).toEqual([1000, 900]);
  });

  it("does not produce financial values when a selected statement page has no aligned figures", () => {
    expect(() => parsePdfTextPages(["Balance sheet\nParticulars"])).toThrow(
      "No financial statement figures could be confidently aligned to financial years.",
    );
  });

  it("does not treat year headings as financial values", () => {
    expect(() => parsePdfTextPages(["Balance sheet\nParticulars 2024 2023"])).toThrow(
      "No financial statement figures could be confidently aligned to financial years.",
    );
  });
});

import * as XLSX from "xlsx";
import type { FinancialYear } from "./financial-analysis";
import { financialFields, normalizeReportingUnit, validateWorkbook, type PreviewRow, type WorkbookPreview } from "./excel-validation";

const ALIASES: Record<string, keyof FinancialYear> = {
  year: "year",
  financialyear: "year",
  fy: "year",

  revenue: "revenue",
  totalrevenue: "revenue",
  revenuefromoperations: "revenue",
  salefromoperations: "revenue",

  ebitda: "ebitda",
  ebit: "ebit",

  netprofit: "netProfit",
  netprofitaftertax: "netProfit",
  pat: "netProfit",

  totaldebt: "totalDebt",
  borrowings: "totalDebt",

  totalequity: "totalEquity",
  shareholdersfunds: "totalEquity",

  currentassets: "currentAssets",
  currentliabilities: "currentLiabilities",

  operatingcashflow: "operatingCashFlow",
  cashflowfromoperations: "operatingCashFlow",

  capex: "capex",
  capitalexpenditure: "capex",

  averageequity: "averageEquity",
  averagecapitalemployed: "averageCapitalEmployed",
};

export async function readFinancialWorkbookPreview(file: File): Promise<WorkbookPreview> {
  if (!/\.xlsx?$/i.test(file.name)) throw new Error("Please upload an XLSX or XLS file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Maximum file size is 10 MB.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const name = workbook.SheetNames[0];
  const sheet = name ? workbook.Sheets[name] : undefined;
  if (!sheet) throw new Error("No worksheet found.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  const headers = matrix[0]?.map(value => String(value ?? "")) ?? [];
  const mapping = new Map<string, number>();
  const headerUnits: string[] = [];
  headers.forEach((header, index) => {
    const suffix = /\(([^)]+)\)\s*$/.exec(header);
    const unit = suffix ? normalizeReportingUnit(suffix[1]) : null;
    if (unit) headerUnits.push(unit);
    const base = unit ? header.replace(/\([^)]+\)\s*$/, "") : header;
    const key = base.toLowerCase().replace(/[^a-z0-9]/g, "");
    const field = ["units", "reportingunits", "unit"].includes(key) ? "units" : ALIASES[key];
    if (field) {
      if (mapping.has(field)) throw new Error(`Duplicate column detected: ${field}`);
      mapping.set(field, index);
    }
  });
  const rows = matrix.slice(1).map(values => {
    const get = (field: string) => {
      const index = mapping.get(field);
      return index === undefined ? "" : String(values[index] ?? "");
    };
    return Object.fromEntries([["year", get("year")], ["units", get("units") || (new Set(headerUnits).size === 1 ? headerUnits[0] : "")], ...financialFields.map(field => [field, get(field)])]) as PreviewRow;
  });
  if (!rows.length) throw new Error("No financial data found in the worksheet.");
  return {
    rows,
    missingColumns: ["year", ...financialFields.slice(0, 10)].filter(field => !mapping.has(field)),
    headerUnits: [...new Set(headerUnits)],
    warnings: workbook.SheetNames.length > 1 ? [`Only worksheet “${name}” was imported; other worksheets were not combined.`] : [],
  };
}

export async function readFinancialWorkbook(file: File): Promise<FinancialYear[]> {
  const preview = await readFinancialWorkbookPreview(file);
  const expectedUnit = normalizeReportingUnit(preview.rows[0]?.units ?? "");
  if (!expectedUnit) throw new Error("Reporting units are required.");
  const result = validateWorkbook(preview, expectedUnit);
  const errors = result.issues.filter(issue => issue.severity === "error");
  if (errors.length) throw new Error(errors.map(issue => issue.message).join("\n"));
  return result.data;
}

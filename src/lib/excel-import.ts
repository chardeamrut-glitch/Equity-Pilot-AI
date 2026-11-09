import * as XLSX from "xlsx";
import type { FinancialYear } from "./financial-analysis";
import { detectUnits, parseFiscalYear, type Unit } from "./financial-metrics";

export type FinancialField = keyof FinancialYear;
export type FinancialYearDraft = Record<FinancialField, string>;

export interface FinancialWorkbook {
  rows: FinancialYearDraft[];
  declaredUnits: Unit[];
  missingColumns: FinancialField[];
  duplicateColumns: FinancialField[];
}

export interface ExcelValidationIssue {
  rule_key: string;
  severity: "error" | "warning";
  rowIndex?: number;
  field?: FinancialField;
  message: string;
}

export interface FinancialWorkbookValidation {
  issues: ExcelValidationIssue[];
  financialYears: FinancialYear[] | null;
}

export const FINANCIAL_YEAR_FIELDS: { key: FinancialField; label: string }[] = [
  { key: "year", label: "Financial year" },
  { key: "revenue", label: "Revenue" },
  { key: "ebitda", label: "EBITDA" },
  { key: "ebit", label: "EBIT" },
  { key: "netProfit", label: "Net profit" },
  { key: "totalDebt", label: "Total debt" },
  { key: "totalEquity", label: "Total equity" },
  { key: "currentAssets", label: "Current assets" },
  { key: "currentLiabilities", label: "Current liabilities" },
  { key: "operatingCashFlow", label: "Operating cash flow" },
  { key: "capex", label: "Capital expenditure" },
  { key: "averageEquity", label: "Average equity" },
  { key: "averageCapitalEmployed", label: "Average capital employed" },
];

const REQUIRED_NUMERIC_FIELDS: Exclude<FinancialField, "year" | "averageEquity" | "averageCapitalEmployed">[] = [
  "revenue",
  "ebitda",
  "ebit",
  "netProfit",
  "totalDebt",
  "totalEquity",
  "currentAssets",
  "currentLiabilities",
  "operatingCashFlow",
  "capex",
];

const ALIASES: Record<string, FinancialField> = {
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

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\b(?:crores?|cr|lakhs?|lacs?|millions?|mn|thousands?)\b/g, "")
    .replace(/₹|\brs\.?(?=\s|$)|\binr\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function asInput(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

type NumericFinancialField = Exclude<FinancialField, "year">;

type ParsedNumber =
  | { kind: "value"; value: number }
  | { kind: "missing" }
  | { kind: "invalid" };

function parseNumber(value: string): ParsedNumber {
  if (!value.trim() || /^[-—–]+$/.test(value.trim())) return { kind: "missing" };

  let cleaned = value.trim().replace(/[₹$€£,\s]/g, "");
  const isNegative = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (isNegative) cleaned = cleaned.slice(1, -1);

  const number = Number(cleaned);
  if (!Number.isFinite(number)) return { kind: "invalid" };

  return { kind: "value", value: isNegative ? -number : number };
}

function blankDraft(): FinancialYearDraft {
  return Object.fromEntries(FINANCIAL_YEAR_FIELDS.map(({ key }) => [key, ""])) as FinancialYearDraft;
}

export async function readFinancialWorkbook(file: File): Promise<FinancialWorkbook> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["xlsx", "xls"].includes(extension || "")) {
    throw new Error("Please upload an XLSX or XLS file.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Maximum file size is 10 MB.");
  }

  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found.");

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Unable to read the selected worksheet.");

  const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const headers = Object.keys(sourceRows[0] ?? {});
  const fieldMap = new Map<FinancialField, string>();
  const duplicateColumns = new Set<FinancialField>();
  const declaredUnits = new Set<Unit>();

  for (const header of headers) {
    const field = ALIASES[normalizeHeader(header)];
    if (!field) continue;
    if (fieldMap.has(field)) {
      duplicateColumns.add(field);
      continue;
    }
    fieldMap.set(field, header);

    if (field !== "year") {
      const unit = detectUnits(header);
      if (unit) declaredUnits.add(unit);
    }
  }

  const unitCue = /(?:₹|rs\.?|inr|amounts?\s+in|\b(?:crores?|lakhs?|millions?|thousands?)\b)/i;
  for (const row of sourceRows) {
    for (const value of Object.values(row)) {
      if (typeof value !== "string" || !unitCue.test(value)) continue;
      const unit = detectUnits(value);
      if (unit) declaredUnits.add(unit);
    }
  }

  const rows = sourceRows.map((source) => {
    const draft = blankDraft();
    for (const [field, header] of fieldMap) draft[field] = asInput(source[header]);
    return draft;
  });

  const requiredFields: FinancialField[] = ["year", ...REQUIRED_NUMERIC_FIELDS];
  const missingColumns = requiredFields.filter((field) => !fieldMap.has(field));

  return {
    rows,
    declaredUnits: [...declaredUnits],
    missingColumns,
    duplicateColumns: [...duplicateColumns],
  };
}

export function validateFinancialWorkbook(
  workbook: FinancialWorkbook,
  rows: FinancialYearDraft[],
  analysisUnit: Unit,
): FinancialWorkbookValidation {
  const issues: ExcelValidationIssue[] = [];
  const financialYears: FinancialYear[] = [];

  if (rows.length < 2 || rows.length > 5) {
    issues.push({
      rule_key: "year_count",
      severity: "error",
      message: "Provide between 2 and 5 financial years.",
    });
  }

  for (const field of workbook.missingColumns) {
    issues.push({
      rule_key: "missing_column",
      severity: "warning",
      field,
      message: `${FINANCIAL_YEAR_FIELDS.find((item) => item.key === field)?.label ?? field} column is missing; fill the blank preview cells.`,
    });
  }

  for (const field of workbook.duplicateColumns) {
    issues.push({
      rule_key: "duplicate_column",
      severity: "error",
      field,
      message: `More than one column maps to ${FINANCIAL_YEAR_FIELDS.find((item) => item.key === field)?.label ?? field}. Correct the workbook and upload it again.`,
    });
  }

  if (workbook.declaredUnits.length > 1) {
    issues.push({
      rule_key: "unit_inconsistent",
      severity: "error",
      message: `The workbook declares mixed reporting units (${workbook.declaredUnits.join(", ")}). Use one unit throughout the workbook.`,
    });
  } else if (workbook.declaredUnits.length === 1 && workbook.declaredUnits[0] !== analysisUnit) {
    issues.push({
      rule_key: "unit_mismatch",
      severity: "error",
      message: `The workbook reports ₹ ${workbook.declaredUnits[0]}, but the selected analysis unit is ₹ ${analysisUnit}. Change the analysis unit to match the workbook.`,
    });
  } else if (workbook.declaredUnits.length === 0) {
    issues.push({
      rule_key: "unit_unspecified",
      severity: "warning",
      message: `No reporting unit was detected. Values are interpreted as ₹ ${analysisUnit}, as selected.`,
    });
  }

  const yearRows = new Map<number, number[]>();
  rows.forEach((row, rowIndex) => {
    const parsedYear = parseFiscalYear(row.year);
    if (!row.year.trim()) {
      issues.push({
        rule_key: "missing_year",
        severity: "error",
        rowIndex,
        field: "year",
        message: `Row ${rowIndex + 1}: financial year is missing.`,
      });
    } else if (parsedYear == null) {
      issues.push({
        rule_key: "invalid_year",
        severity: "error",
        rowIndex,
        field: "year",
        message: `Row ${rowIndex + 1}: "${row.year}" is not a recognised Indian financial year.`,
      });
    } else {
      yearRows.set(parsedYear, [...(yearRows.get(parsedYear) ?? []), rowIndex]);
    }

    const parsed: { year: string } & Partial<Record<NumericFinancialField, number>> = {
      year: parsedYear == null ? row.year.trim() : String(parsedYear),
    };
    const numericFields: FinancialField[] = [...REQUIRED_NUMERIC_FIELDS, "averageEquity", "averageCapitalEmployed"];

    for (const field of numericFields) {
      const rawValue = row[field];
      const value = parseNumber(rawValue);
      const required = REQUIRED_NUMERIC_FIELDS.includes(field as (typeof REQUIRED_NUMERIC_FIELDS)[number]);

      if (value.kind === "missing") {
        if (required) {
          issues.push({
            rule_key: "missing_value",
            severity: "error",
            rowIndex,
            field,
            message: `Row ${rowIndex + 1}: ${FINANCIAL_YEAR_FIELDS.find((item) => item.key === field)?.label ?? field} is missing.`,
          });
        }
        continue;
      }

      if (value.kind === "invalid") {
        issues.push({
          rule_key: "invalid_number",
          severity: "error",
          rowIndex,
          field,
          message: `Row ${rowIndex + 1}: "${rawValue}" is not a valid number for ${FINANCIAL_YEAR_FIELDS.find((item) => item.key === field)?.label ?? field}.`,
        });
        continue;
      }

      parsed[field as NumericFinancialField] = value.value;
    }

    if (parsedYear != null) {
      financialYears.push(parsed as FinancialYear);
    }
  });

  for (const [year, indices] of yearRows) {
    if (indices.length > 1) {
      for (const rowIndex of indices.slice(1)) {
        issues.push({
          rule_key: "duplicate_year",
          severity: "error",
          rowIndex,
          field: "year",
          message: `Row ${rowIndex + 1}: FY${String(year).slice(-2)} duplicates another financial year.`,
        });
      }
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  return {
    issues,
    financialYears: !hasErrors && financialYears.length === rows.length ? financialYears : null,
  };
}

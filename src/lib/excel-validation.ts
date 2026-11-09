import type { FinancialYear } from "./financial-analysis";

export const financialFields = ["revenue", "ebitda", "ebit", "netProfit", "totalDebt", "totalEquity", "currentAssets", "currentLiabilities", "operatingCashFlow", "capex", "averageEquity", "averageCapitalEmployed"] as const;
export type FinancialField = typeof financialFields[number];
export type PreviewRow = { year: string; units: string } & Record<FinancialField, string>;
export type WorkbookPreview = { rows: PreviewRow[]; missingColumns: string[]; headerUnits: string[]; warnings: string[] };
export type ImportIssue = { severity: "error" | "warning"; message: string; row?: number; field?: string };

export function parseFinancialNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const negative = /^\(.+\)$/.test(text);
  const value = (negative ? text.slice(1, -1) : text).replace(/[₹$€£,\s]/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  const number = Number(value) * (negative ? -1 : 1);
  return Number.isFinite(number) ? number : null;
}

export function financialYearEnd(raw: string): number | null {
  const text = raw.trim().replace(/^FY\s*/i, "");
  if (/^\d{4}$/.test(text)) {
    const year = Number(text);
    return year >= 1900 && year <= 2199 ? year : null;
  }
  const match = /^(\d{4})\s*[-–/]\s*(\d{2}|\d{4})$/.exec(text);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2].length === 2 ? Math.floor(start / 100) * 100 + Number(match[2]) + (Number(match[2]) < start % 100 ? 100 : 0) : Number(match[2]);
  return start >= 1900 && end <= 2199 && end === start + 1 ? end : null;
}

export function normalizeReportingUnit(raw: string): string | null {
  const text = raw.toLowerCase().replace(/[₹\s().]/g, "").replace(/^inr/, "");
  const aliases: Record<string, string> = { crore: "crore", crores: "crore", cr: "crore", lakh: "lakh", lakhs: "lakh", lac: "lakh", lacs: "lakh", million: "million", millions: "million", thousand: "thousand", thousands: "thousand", absolute: "absolute", rupees: "absolute", rs: "absolute" };
  return aliases[text] ?? null;
}

export function validateWorkbook(preview: WorkbookPreview, expectedUnit: string): { issues: ImportIssue[]; data: FinancialYear[] } {
  const issues: ImportIssue[] = preview.warnings.map(message => ({ severity: "warning", message }));
  const error = (message: string, row?: number, field?: string) => issues.push({ severity: "error", message, row, field });
  if (preview.rows.length < 2 || preview.rows.length > 5) error("Provide between 2 and 5 financial years.");
  if (preview.missingColumns.length) issues.push({ severity: "warning", message: `Missing columns: ${preview.missingColumns.join(", ")}. Enter their values in the preview.` });
  for (const unit of preview.headerUnits) if (unit !== expectedUnit) error(`Workbook column units (${unit}) do not match selected reporting units (${expectedUnit}). Correct the workbook or reporting selection.`);
  const seen = new Set<number>();
  const years: number[] = [];
  const data: FinancialYear[] = [];
  preview.rows.forEach((row, index) => {
    const label = `Excel row ${index + 2}`;
    const year = financialYearEnd(row.year);
    if (year === null) error(`${label}: ${row.year.trim() ? "invalid" : "missing"} financial year.`, index, "year");
    else {
      if (seen.has(year)) error(`${label}: duplicate financial year FY${year}.`, index, "year");
      seen.add(year); years.push(year);
    }
    const unit = normalizeReportingUnit(row.units);
    if (!unit) error(`${label}: ${row.units.trim() ? "invalid" : "missing"} reporting units.`, index, "units");
    else if (unit !== expectedUnit) error(`${label}: reporting units (${unit}) do not match selected units (${expectedUnit}).`, index, "units");
    const values: Partial<Record<FinancialField, number>> = {};
    for (const field of financialFields) {
      const optional = field === "averageEquity" || field === "averageCapitalEmployed";
      if (optional && !row[field].trim()) continue;
      const value = parseFinancialNumber(row[field]);
      if (value === null) error(`${label}: ${row[field].trim() ? "invalid numerical value" : "missing required value"} for ${field}.`, index, field);
      else values[field] = value;
    }
    // No incomplete row reaches the calculation engine.
    if (year !== null && financialFields.slice(0, 10).every(field => values[field] !== undefined)) data.push({ year: String(year), ...values } as FinancialYear);
  });
  if (years.length === preview.rows.length && seen.size === years.length) {
    const ascending = years.every((year, index) => index === 0 || year > years[index - 1]);
    const descending = years.every((year, index) => index === 0 || year < years[index - 1]);
    if (!ascending && !descending) error("Financial years are out of order. Use oldest-to-newest or newest-to-oldest order.");
    else {
      if (descending) issues.push({ severity: "warning", message: "Years are newest first; calculations will use chronological order." });
      if (years.some((year, index) => index > 0 && Math.abs(year - years[index - 1]) !== 1)) error("Financial years contain gaps. Supply consecutive financial years for annual growth calculations.");
    }
  }
  return { issues, data: issues.some(issue => issue.severity === "error") ? [] : data };
}
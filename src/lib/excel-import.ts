
import * as XLSX from "xlsx";
import type { FinancialYear } from "./financial-analysis";

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

const REQUIRED_FIELDS = [
  "year",
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

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A required financial value is missing.");
  }

  let cleaned = value.trim().replace(/[₹$€£,\s]/g, "");
  const isNegative = cleaned.startsWith("(") && cleaned.endsWith(")");

  if (isNegative) {
    cleaned = cleaned.slice(1, -1);
  }

  const number = Number(cleaned);

  if (!Number.isFinite(number)) {
    throw new Error(`Invalid financial number: ${value}`);
  }

  return isNegative ? -number : number;
}

export async function readFinancialWorkbook(
  file: File
): Promise<FinancialYear[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!["xlsx", "xls"].includes(extension || "")) {
    throw new Error("Please upload an XLSX or XLS file.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Maximum file size is 10 MB.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("No worksheet found.");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
  throw new Error("Unable to read the selected worksheet.");
}

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    sheet,
    { defval: "" }
  );

  if (rows.length < 2 || rows.length > 5) {
    throw new Error(
      "Please provide between 2 and 5 financial years."
    );
  }


const firstRow = rows[0];

if (!firstRow) {
  throw new Error("No financial data found in the worksheet.");
}

const headers = Object.keys(firstRow);
const fieldMap = new Map<string, string>();


  for (const header of headers) {
    const field = ALIASES[normalizeHeader(header)];

    if (field) {
      if (fieldMap.has(field)) {
        throw new Error(`Duplicate column detected: ${field}`);
      }
      fieldMap.set(field, header);
    }
  }

  const missing = REQUIRED_FIELDS.filter(
    field => !fieldMap.has(field)
  );

  if (missing.length) {
    throw new Error(
      `Missing Excel columns: ${missing.join(", ")}`
    );
  }

  const results: FinancialYear[] = rows.map((row, index) => {
    try {
      const get = (field: keyof FinancialYear) => {
        const header = fieldMap.get(field);
        return header ? row[header] : undefined;
      };

      const yearValue = get("year");

      if (yearValue === undefined || yearValue === "") {
        throw new Error("Financial year is missing.");
      }

      const year = String(yearValue).trim();

      const result: FinancialYear = {
        year,
        revenue: parseNumber(get("revenue")),
        ebitda: parseNumber(get("ebitda")),
        ebit: parseNumber(get("ebit")),
        netProfit: parseNumber(get("netProfit")),
        totalDebt: parseNumber(get("totalDebt")),
        totalEquity: parseNumber(get("totalEquity")),
        currentAssets: parseNumber(get("currentAssets")),
        currentLiabilities: parseNumber(get("currentLiabilities")),
        operatingCashFlow: parseNumber(get("operatingCashFlow")),
        capex: parseNumber(get("capex")),
      };

      const averageEquity = get("averageEquity");
      const averageCapital = get("averageCapitalEmployed");

      if (averageEquity !== undefined && averageEquity !== "") {
        result.averageEquity = parseNumber(averageEquity);
      }

      if (averageCapital !== undefined && averageCapital !== "") {
        result.averageCapitalEmployed = parseNumber(averageCapital);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Invalid data";

      throw new Error(`Excel row ${index + 2}: ${message}`);
    }
  });

  const years = new Set(results.map(row => row.year));

  if (years.size !== results.length) {
    throw new Error("Duplicate financial years detected.");
  }

  return results;
}

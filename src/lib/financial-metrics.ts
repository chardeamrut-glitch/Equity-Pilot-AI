// Pure, deterministic helpers for Indian financial statements. No AI here.

export type Statement = "income_statement" | "balance_sheet" | "cash_flow";
export type Unit = "crore" | "lakh" | "million" | "thousand" | "absolute";

export interface MetricDef {
  key: string;
  label: string;
  statement: Statement;
  /** false for per-share values / share counts that must not be unit-scaled */
  scaled: boolean;
  /** DB column in the statement table; null = used only for validation */
  column: string | null;
  synonyms: string[];
  core?: boolean;
}

const m = (key: string, label: string, statement: Statement, synonyms: string[], opts: Partial<MetricDef> = {}): MetricDef => ({
  key, label, statement, synonyms, scaled: true, column: key, ...opts,
});

export const METRICS: MetricDef[] = [
  // Income statement
  m("revenue", "Revenue from operations", "income_statement", ["revenue from operations", "revenue from operations including excise duty", "net revenue from operations", "revenue", "net sales", "sales", "total revenue from operations", "income from operations", "turnover"], { core: true }),
  m("other_income", "Other income", "income_statement", ["other income"]),
  m("total_income", "Total income", "income_statement", ["total income", "total revenue"]),
  m("cost_of_materials", "Cost of materials consumed", "income_statement", ["cost of materials consumed", "cost of raw materials consumed", "raw materials consumed", "cost of goods sold", "cost of sales", "purchases of stock-in-trade"]),
  m("employee_expenses", "Employee benefits expense", "income_statement", ["employee benefits expense", "employee benefit expenses", "employee cost", "employee costs", "staff costs"]),
  m("other_expenses", "Other expenses", "income_statement", ["other expenses"]),
  m("ebitda", "EBITDA", "income_statement", ["ebitda", "operating profit", "earnings before interest tax depreciation and amortisation"]),
  m("depreciation", "Depreciation & amortisation", "income_statement", ["depreciation and amortisation expense", "depreciation and amortization expense", "depreciation and amortisation", "depreciation", "depreciation amortisation and impairment"]),
  m("ebit", "EBIT", "income_statement", ["ebit", "earnings before interest and tax"]),
  m("finance_costs", "Finance costs", "income_statement", ["finance costs", "finance cost", "interest expense", "interest"]),
  m("exceptional_items", "Exceptional items", "income_statement", ["exceptional items", "exceptional item"]),
  m("profit_before_tax", "Profit before tax", "income_statement", ["profit before tax", "profit before taxes", "profit before taxation", "profit before exceptional items and tax", "pbt"], { core: true }),
  m("tax_expense", "Total tax expense", "income_statement", ["total tax expense", "tax expense", "income tax expense", "total income tax expense"]),
  m("net_profit", "Profit for the year", "income_statement", ["profit for the year", "profit for the period", "profit for the year after tax", "profit for the period after tax", "net profit", "profit after tax", "pat", "net profit after tax"], { core: true }),
  m("non_controlling_interest_profit", "Profit attributable to non-controlling interests", "income_statement", ["non-controlling interests", "non controlling interests", "minority interest"], { column: "minority_interest" }),
  m("eps_basic", "EPS – basic (₹)", "income_statement", ["basic eps", "eps basic", "basic earnings per share", "earnings per share basic", "basic"], { scaled: false }),
  m("eps_diluted", "EPS – diluted (₹)", "income_statement", ["diluted eps", "eps diluted", "diluted earnings per share", "earnings per share diluted", "diluted"], { scaled: false }),
  // Balance sheet
  m("share_capital", "Equity share capital", "balance_sheet", ["equity share capital", "share capital"]),
  m("reserves", "Other equity / reserves", "balance_sheet", ["other equity", "reserves and surplus", "reserves & surplus", "reserves"]),
  m("total_equity", "Total equity", "balance_sheet", ["total equity", "equity attributable to owners", "equity attributable to owners of the parent", "total equity attributable to equity holders", "shareholders funds", "net worth"], { core: true }),
  m("current_assets", "Current assets", "balance_sheet", ["current assets"]),
  m("current_liabilities", "Current liabilities", "balance_sheet", ["current liabilities"]),
  m("average_equity", "Average equity", "balance_sheet", ["average equity"]),
  m("average_capital_employed", "Average capital employed", "balance_sheet", ["average capital employed"]),
  m("minority_interest", "Non-controlling interests (BS)", "balance_sheet", ["non-controlling interests", "minority interest"]),
  m("long_term_borrowings", "Non-current borrowings", "balance_sheet", ["non-current borrowings", "long-term borrowings", "long term borrowings", "borrowings non-current"]),
  m("short_term_borrowings", "Current borrowings", "balance_sheet", ["current borrowings", "short-term borrowings", "short term borrowings", "borrowings current"]),
  m("total_debt", "Total borrowings", "balance_sheet", ["total borrowings", "total debt"]),
  m("trade_payables", "Trade payables", "balance_sheet", ["trade payables", "sundry creditors"]),
  m("other_liabilities", "Other liabilities", "balance_sheet", ["other current liabilities", "other liabilities"]),
  m("total_liabilities", "Total liabilities", "balance_sheet", ["total liabilities"], { core: true }),
  m("total_equity_and_liabilities", "Total equity and liabilities", "balance_sheet", ["total equity and liabilities", "total equity & liabilities", "total liabilities and equity"], { column: null }),
  m("fixed_assets", "Property, plant & equipment", "balance_sheet", ["property plant and equipment", "property, plant and equipment", "fixed assets", "tangible assets", "net block"]),
  m("cwip", "Capital work-in-progress", "balance_sheet", ["capital work-in-progress", "capital work in progress", "cwip"]),
  m("investments", "Investments", "balance_sheet", ["investments", "non-current investments", "current investments"]),
  m("inventories", "Inventories", "balance_sheet", ["inventories", "inventory", "stock in trade"]),
  m("trade_receivables", "Trade receivables", "balance_sheet", ["trade receivables", "sundry debtors", "debtors"]),
  m("cash_and_equivalents", "Cash and cash equivalents", "balance_sheet", ["cash and cash equivalents", "cash & cash equivalents", "cash and bank balances"]),
  m("other_assets", "Other assets", "balance_sheet", ["other current assets", "other assets"]),
  m("total_assets", "Total assets", "balance_sheet", ["total assets"], { core: true }),
  m("shares_outstanding", "Shares outstanding (number)", "balance_sheet", ["number of shares", "shares outstanding", "number of equity shares"], { scaled: false }),
  // Cash flow
  m("cash_from_operations", "Net cash from operating activities", "cash_flow", ["net cash from operating activities", "net cash generated from operating activities", "net cash flow from operating activities", "cash generated from operations", "net cash provided by operating activities", "cash flow from operating activities"], { core: true }),
  m("capex", "Capital expenditure", "cash_flow", ["purchase of property plant and equipment", "purchase of property, plant and equipment", "capital expenditure", "purchase of fixed assets", "capex"]),
  m("cash_from_investing", "Net cash from investing activities", "cash_flow", ["net cash used in investing activities", "net cash from investing activities", "net cash flow from investing activities", "net cash generated from investing activities", "cash flow from investing activities"]),
  m("cash_from_financing", "Net cash from financing activities", "cash_flow", ["net cash used in financing activities", "net cash from financing activities", "net cash flow from financing activities", "net cash generated from financing activities", "cash flow from financing activities"]),
  m("dividends_paid", "Dividends paid", "cash_flow", ["dividends paid", "dividend paid", "payment of dividends"]),
  m("free_cash_flow", "Free cash flow", "cash_flow", ["free cash flow"]),
  m("net_change_in_cash", "Net change in cash", "cash_flow", ["net increase in cash and cash equivalents", "net increase/(decrease) in cash and cash equivalents", "net (decrease)/increase in cash and cash equivalents", "net decrease in cash and cash equivalents", "net change in cash", "net increase decrease in cash and cash equivalents"]),
  m("opening_cash", "Opening cash & equivalents", "cash_flow", ["cash and cash equivalents at the beginning of the year", "cash and cash equivalents at beginning of the year", "opening cash and cash equivalents", "cash and cash equivalents at the beginning of the period", "opening cash"], { column: null }),
  m("closing_cash", "Closing cash & equivalents", "cash_flow", ["cash and cash equivalents at the end of the year", "cash and cash equivalents at end of the year", "closing cash and cash equivalents", "cash and cash equivalents at the end of the period", "closing cash"], { column: null }),
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((d) => [d.key, d])) as Record<string, MetricDef>;

export function normaliseLabel(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\- ]/g, " ")
    .replace(/^\s*(?:[a-z]|[ivx]+|\d+)[\.\)]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a raw line label to a metric. Exact synonym = 0.95, prefix match = 0.8. */
export function mapLabel(raw: string, statementHint?: Statement): { key: string; confidence: number } | null {
  const n = normaliseLabel(raw);
  if (!n) return null;
  const candidates = statementHint ? [...METRICS.filter((d) => d.statement === statementHint), ...METRICS.filter((d) => d.statement !== statementHint)] : METRICS;
  for (const d of candidates) if (d.synonyms.some((s) => normaliseLabel(s) === n)) return { key: d.key, confidence: 0.95 };
  for (const d of candidates)
    for (const s of d.synonyms) {
      const ns = normaliseLabel(s);
      if (ns.length >= 8 && n.startsWith(ns)) return { key: d.key, confidence: 0.8 };
    }
  return null;
}

/** Parses "1,23,456.78", "(1,234)", "-1234", "₹ 12.5", "—", "nil". Returns null for blanks/dashes. */
export function parseIndianNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (input == null) return null;
  let s = String(input).trim();
  if (!s || /^(-+|—|–|nil|na|n\/a|none)$/i.test(s)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/₹|rs\.?|inr|cr\.?|crores?|lakhs?|lacs?|mn|million/gi, "").replace(/[,\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const v = Number(s);
  return neg ? -v : v;
}

export const UNIT_FACTOR: Record<Unit, number> = { crore: 1e7, lakh: 1e5, million: 1e6, thousand: 1e3, absolute: 1 };

export function convertUnits(value: number, from: Unit, to: Unit) {
  return (value * UNIT_FACTOR[from]) / UNIT_FACTOR[to];
}

export function detectUnits(text: string): Unit | null {
  const t = text.toLowerCase();
  const rules: [RegExp, Unit][] = [
    [/(?:in|₹|rs\.?|inr)\s*(?:in\s*)?(?:crores?|cr\b)/, "crore"],
    [/(?:in|₹|rs\.?|inr)\s*(?:in\s*)?(?:lakhs?|lacs?)/, "lakh"],
    [/(?:in|₹|rs\.?|inr|usd|\$)\s*(?:in\s*)?(?:millions?|mn\b)/, "million"],
    [/(?:in|₹|rs\.?|inr)\s*(?:in\s*)?(?:thousands?|'000)/, "thousand"],
  ];
  for (const [re, u] of rules) if (re.test(t)) return u;
  if (/\bcrores?\b/.test(t)) return "crore";
  if (/\blakhs?\b/.test(t)) return "lakh";
  return null;
}

export function detectCurrency(text: string): string | null {
  if (/₹|\binr\b|\brs\.?\s|rupees?/i.test(text)) return "INR";
  if (/\busd\b|us\$/i.test(text)) return "USD";
  return null;
}

export function detectBasis(text: string): "consolidated" | "standalone" | null {
  const t = text.toLowerCase();
  const c = (t.match(/consolidated/g) ?? []).length;
  const s = (t.match(/standalone|stand-alone/g) ?? []).length;
  if (c === 0 && s === 0) return null;
  return c >= s ? "consolidated" : "standalone";
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Indian FY of a column header. FY ends in March: "Mar-24", "FY24", "2023-24", "31.03.2024", "March 31, 2024" → 2024. */
export function parseFiscalYear(header: unknown): number | null {
  if (header == null) return null;
  if (typeof header === "number" && header > 1990 && header < 2100) return header;
  const s = String(header).trim().toLowerCase();
  let r: RegExpMatchArray | null;
  if ((r = s.match(/fy\s*'?(\d{4})\s*[-–\/]\s*(\d{2,4})/))) return toYear(r[2]!, Number(r[1]));
  if ((r = s.match(/fy\s*'?(\d{2,4})\b/))) return toYear(r[1]!);
  if ((r = s.match(/\b(\d{4})\s*[-–\/]\s*(\d{2,4})\b/)) && Number(r[1]) > 1990) return toYear(r[2]!, Number(r[1]));
  if ((r = s.match(/\b(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})\b/))) return fyFromDate(Number(r[2]), toYear(r[3]!)!);
  if ((r = s.match(/([a-z]{3})[a-z]*[\s\-',.]*(?:\d{1,2}(?:st|nd|rd|th)?,?\s*)?'?(\d{2,4})\b/)) && MONTHS[r[1]!]) return fyFromDate(MONTHS[r[1]!]!, toYear(r[2]!)!);
  if ((r = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*,?\s+(\d{4})\b/)) && MONTHS[r[2]!]) return fyFromDate(MONTHS[r[2]!]!, Number(r[3]));
  if ((r = s.match(/^(\d{4})$/)) && Number(r[1]) > 1990) return Number(r[1]);
  return null;
}

function toYear(y: string, startYear?: number): number | null {
  let n = Number(y);
  if (y.length === 2) n = 2000 + n;
  if (startYear && n !== startYear + 1) return startYear + 1;
  return n > 1990 && n < 2100 ? n : null;
}
function fyFromDate(month: number, year: number) {
  return month <= 3 ? year : year + 1;
}

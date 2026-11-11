// Server-only: document parsing + AI structuring. Imported only inside server function handlers.
import * as XLSX from "xlsx";
import { extractText, getDocumentProxy } from "unpdf";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import {
  METRICS, METRIC_BY_KEY, mapLabel, parseIndianNumber, parseFiscalYear,
  detectUnits, detectBasis, detectCurrency, type Statement, type Unit,
} from "./financial-metrics";

export interface RawItem {
  metric_key: string;
  statement?: Statement;
  raw_label: string;
  fiscal_year: number;
  value: number;
  confidence: number;
  page_ref: string | null;
  flags: string[];
}
export interface ParseResult {
  method: "spreadsheet" | "pdf_text" | "pdf_ai" | "spreadsheet_ai";
  units: Unit | null;
  currency: string | null;
  basis: "consolidated" | "standalone" | null;
  pageCount: number | null;
  items: RawItem[];
  warnings?: string[];
}

export interface ExtractionRowIdentity {
  document_id: string;
  reporting_basis: "consolidated" | "standalone";
  fiscal_year: number;
  metric_key: string;
  statement: Statement;
  raw_label: string;
  value: number;
  page_ref: string | null;
}

export function extractionRowKey(row: ExtractionRowIdentity): string {
  return JSON.stringify([
    row.document_id,
    row.reporting_basis,
    row.fiscal_year,
    row.metric_key,
    row.statement,
    row.page_ref,
    row.value,
  ]);
}

/** Keeps repeated same-page occurrences while making retries idempotent as a multiset. */
export function rowsNotAlreadyExtracted<T extends ExtractionRowIdentity, R>(
  rows: R[],
  identity: (row: R) => T,
  existingRows: ExtractionRowIdentity[],
): R[] {
  const existingCounts = new Map<string, number>();
  for (const row of existingRows) {
    const key = extractionRowKey(row);
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  const parsedCounts = new Map<string, number>();
  const newIndexes = new Set<number>();
  rows.forEach((row, index) => {
    const key = extractionRowKey(identity(row));
    const occurrence = (parsedCounts.get(key) ?? 0) + 1;
    parsedCounts.set(key, occurrence);
    if (occurrence > (existingCounts.get(key) ?? 0)) newIndexes.add(index);
  });
  return rows.filter((_, index) => newIndexes.has(index));
}

export class ExtractionError extends Error {}

function statementHint(text: string): Statement | undefined {
  const t = text.toLowerCase();
  if (/cash\s*flow/.test(t)) return "cash_flow";
  if (/balance\s*sheet|financial position/.test(t)) return "balance_sheet";
  if (/profit\s*(and|&)\s*loss|income statement|statement of profit/.test(t)) return "income_statement";
  return undefined;
}

export function parseSpreadsheet(buf: ArrayBuffer, isCsv: boolean): ParseResult & { sheetText: string } {
  const wb = isCsv ? XLSX.read(new TextDecoder().decode(buf), { type: "string", raw: true }) : XLSX.read(buf, { type: "array" });
  const items: RawItem[] = [];
  let allText = "";
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: null });
    const sheetText = name + "\n" + rows.map((r) => r.map((c) => (c == null ? "" : String(c))).join(",")).join("\n");
    allText += sheetText + "\n";
    let hint = statementHint(name) ?? statementHint(sheetText.slice(0, 400));
    // header row = first row with ≥1 FY-like cells after column 0
    let yearCols: Map<number, number> | null = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const fyCols = new Map<number, number>();
      row.forEach((c, j) => { if (j > 0) { const fy = parseFiscalYear(c); if (fy) fyCols.set(j, fy); } });
      const labelCell = row.find((c) => typeof c === "string" && c.trim()) as string | undefined;
      if (fyCols.size >= 1 && (!yearCols || fyCols.size >= yearCols.size) && row.filter((c) => parseIndianNumber(c) != null && !parseFiscalYear(c)).length === 0) {
        yearCols = fyCols;
        continue;
      }
      if (!labelCell) continue;
      const sectionHint = statementHint(labelCell);
      if (sectionHint && row.filter((c) => parseIndianNumber(c) != null).length === 0) { hint = sectionHint; continue; }
      if (!yearCols) continue;
      const mapped = mapLabel(labelCell, hint);
      if (!mapped) continue;
      for (const [col, fy] of yearCols) {
        const v = parseIndianNumber(row[col]);
        if (v == null) continue;
        items.push({ metric_key: mapped.key, raw_label: labelCell.trim(), fiscal_year: fy, value: v, confidence: mapped.confidence,
          page_ref: `${name}!R${i + 1}`, flags: mapped.confidence < 0.9 ? ["fuzzy_label"] : [] });
      }
    }
  }
  return { method: "spreadsheet", units: detectUnits(allText), currency: detectCurrency(allText), basis: detectBasis(allText), pageCount: wb.SheetNames.length, items, sheetText: allText };
}

export async function pdfPages(buf: ArrayBuffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { totalPages, pages: text as string[] };
}

/** Pick pages most likely to hold the primary statements (annual reports run to 300+ pages). */
export function selectStatementPages(pages: string[], maxChars = 90_000) {
  const scored = pages.map((t, i) => {
    const l = t.toLowerCase();
    let s = 0;
    if (/balance sheet/.test(l)) s += 3;
    if (/profit and loss|statement of profit/.test(l)) s += 3;
    if (/cash flow/.test(l)) s += 3;
    if (/total assets|total equity and liabilities/.test(l)) s += 4;
    if (/revenue from operations/.test(l)) s += 2;
    if (/net cash (from|used|generated)/.test(l)) s += 4;
    s += Math.min(METRICS.filter((metric) => metric.synonyms.some((synonym) => l.includes(synonym))).length * 0.5, 6);
    if (/notes? to (the )?(consolidated |standalone )?financial statements/.test(l)) s -= 2;
    s += Math.min((t.match(/\d[\d,]{3,}/g) ?? []).length / 40, 3);
    return { i, s, t };
  });
  const picked: typeof scored = [];
  let total = 0;
  for (const p of [...scored].sort((a, b) => b.s - a.s)) {
    if (p.s <= 1 || total + p.t.length > maxChars) continue;
    picked.push(p);
    total += p.t.length;
  }
  return picked.sort((a, b) => a.i - b.i);
}

function isNotesPage(headings: string[]) {
  const firstLines = headings.slice(0, 12);
  const notesIndex = firstLines.findIndex((line) =>
    /^\s*notes?\s+to\s+(?:the\s+)?(?:(?:consolidated|standalone)\s+)?financial statements\b/i.test(line),
  );
  if (notesIndex < 0) return false;
  return !firstLines.slice(0, notesIndex).some((line) => statementHeading(line));
}

const FISCAL_YEAR_TOKEN =
  /\b(?:FY\s*['’]?\d{2,4}(?:\s*[-–/]\s*\d{2,4})?|\d{4}\s*[-–/]\s*\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|(?:19|20)\d{2})\b/gi;
const FINANCIAL_TOKEN =
  /\(\s*\d[\d,]*(?:\.\d+)?\s*\)|(?<![\p{L}\d])[-−]?\d[\d,]*(?:\.\d+)?|—|–|nil|n\/a/giu;

function fiscalYearsInLine(line: string): number[] {
  const years: number[] = [];
  for (const match of line.matchAll(FISCAL_YEAR_TOKEN)) {
    const year = parseFiscalYear(match[0]);
    if (year != null && !years.includes(year)) years.push(year);
  }
  return years;
}

function numericTokens(line: string): { start: number; end: number; value: number | null }[] {
  return [...line.matchAll(FINANCIAL_TOKEN)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    value: parseIndianNumber(match[0]),
  }));
}

function lineLabel(line: string, numbers: { start: number; end: number; value: number | null }[]) {
  for (const number of numbers) {
    const label = line.slice(0, number.start).trim().replace(/^[\s|:;.,-]+|[\s|:;.,-]+$/g, "");
    if (/[a-z]{3}/i.test(label)) return { label, start: number.start };
  }
  return null;
}

function looksLikeNarrative(label: string) {
  return /\b(?:increased|decreased|grew|growth|rose|fell|declined|compared|during|year on year|year-on-year|approximately|reported|was|were|is|are)\b/i.test(label);
}

function statementHeading(line: string): Statement | undefined {
  const text = line.toLowerCase();
  if (/\bstatement of cash flows?\b|\bcash flow statement\b|\bcash flows? statement\b/.test(text)) return "cash_flow";
  if (/\bbalance sheet\b|\bstatement of financial position\b/.test(text)) return "balance_sheet";
  if (/\b(?:statement of )?profit\s+(?:and|&|or)\s+loss\b|\bprofit and loss statement\b|\bp\s*&\s*l(?: statement)?\b|\bincome statement\b/.test(text)) return "income_statement";
  return undefined;
}

function isYearHeading(line: string, years: number[]) {
  if (!years.length || looksLikeNarrative(line)) return false;
  const withoutDates = line
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}\b/gi, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/gi, " ");
  const residual = withoutDates
    .replace(FISCAL_YEAR_TOKEN, " ")
    .replace(/\b(?:note|notes|no|number|particulars|year|ended|financial|fy|as|at|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[|:;.,()\-–/]/g, " ")
    .trim();
  if (residual.length) return false;
  return years.length > 1 || /\b(particulars|year ended|financial year|as at)\b/i.test(line);
}

function rowValues(
  line: string,
  numbers: ReturnType<typeof numericTokens>,
  labelStart: number,
  yearCount: number,
  hasNoteColumn: boolean,
) {
  const dateRanges = [...line.matchAll(/\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4})\b/gi)]
    .map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
  let values = numbers.filter((token) => {
    if (token.start < labelStart || dateRanges.some((range) => token.start >= range.start && token.end <= range.end)) return false;
    if (/(?:note|page|pg\.?|p\.)\s*(?:no\.?|#)?\s*$/i.test(line.slice(Math.max(0, token.start - 14), token.start))) return false;
    return true;
  });
  if (hasNoteColumn && values.length === yearCount + 1) values = values.slice(1);
  return values;
}

/** Conservatively maps text-layer PDF rows; ambiguous year/value alignment is reported, not guessed. */
export function parsePdfTextPages(
  pages: string[],
  totalPages = pages.length,
  expectedBasis?: "consolidated" | "standalone",
): ParseResult {
  const picked = selectStatementPages(pages);
  if (!picked.length) throw new ExtractionError("No financial statement pages were found in this PDF.");

  const items: RawItem[] = [];
  const statementPages: string[] = [];
  const detectedBases = new Set<"consolidated" | "standalone">();
  let activeYears: number[] = [];
  let activeStatement: Statement | undefined;
  let skippedAmbiguousRows = false;
  let hasNoteColumn = false;
  let pendingYears: number[] = [];

  for (const { i: pageIndex, t: pageText } of picked) {
    const headings = pageText.split(/\r?\n/).map((line) => line.trim());
    if (isNotesPage(headings)) {
      activeYears = [];
      pendingYears = [];
      activeStatement = undefined;
      hasNoteColumn = false;
      continue;
    }
    const pageBasis = headings.slice(0, 12).find((line) => statementHeading(line) && /\b(consolidated|standalone|stand-alone)\b/i.test(line));
    if (
      expectedBasis &&
      pageBasis &&
      (/\bstandalone|stand-alone\b/i.test(pageBasis) ? "standalone" : "consolidated") !== expectedBasis
    ) {
      activeYears = [];
      pendingYears = [];
      activeStatement = undefined;
      hasNoteColumn = false;
      continue;
    }
    statementPages.push(pageText);
    for (const heading of headings.filter((line) => statementHeading(line))) {
      if (/\bstandalone|stand-alone\b/i.test(heading)) detectedBases.add("standalone");
      else if (/\bconsolidated\b/i.test(heading)) detectedBases.add("consolidated");
    }

    for (const rawLine of pageText.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+/g, " ").trim();
      if (!line) continue;

      const numbers = numericTokens(line);
      const lineStatement = statementHeading(line);
      if (lineStatement) {
        if (lineStatement !== activeStatement) {
          activeYears = [];
          pendingYears = [];
          hasNoteColumn = false;
        }
        activeStatement = lineStatement;
        const lineBasis = /\bstandalone|stand-alone\b/i.test(line) ? "standalone" : /\bconsolidated\b/i.test(line) ? "consolidated" : undefined;
        if (expectedBasis && lineBasis && lineBasis !== expectedBasis) {
          activeStatement = undefined;
          continue;
        }
      }

      const years = fiscalYearsInLine(line);
      if (/\bnotes?\s*(?:no\.?|number|#)/i.test(line)) hasNoteColumn = true;
      if (years.length && isYearHeading(line, years)) {
        pendingYears = [...new Set([...pendingYears, ...years])];
        activeYears = pendingYears;
        if (/\bparticulars\b.*\bnotes?\b/i.test(line)) hasNoteColumn = true;
        continue;
      }
      pendingYears = [];

      if (!activeYears.length || !activeStatement || !numbers.length) continue;
      const prefix = lineLabel(line, numbers);
      if (!prefix) continue;

      const mapped = mapLabel(prefix.label, activeStatement);
      if (!mapped || METRIC_BY_KEY[mapped.key]?.statement !== activeStatement ||
        (mapped.confidence < 0.9 && looksLikeNarrative(prefix.label))) {
        skippedAmbiguousRows = true;
        continue;
      }
      const values = rowValues(line, numbers, prefix.start, activeYears.length, hasNoteColumn);
      if (values.length !== activeYears.length) {
        skippedAmbiguousRows = true;
        continue;
      }

      for (let column = 0; column < activeYears.length; column++) {
        const value = values[column]?.value;
        if (value == null) continue;
        items.push({
          metric_key: mapped.key,
          statement: activeStatement,
          raw_label: prefix.label.slice(0, 300),
          fiscal_year: activeYears[column]!,
          value,
          confidence: mapped.confidence,
          page_ref: `p.${pageIndex + 1}`,
          flags: ["pdf_text_extracted", ...(mapped.confidence < 0.9 ? ["fuzzy_label"] : [])],
        });
      }
    }
  }

  if (!items.length) throw new ExtractionError("No financial statement figures could be confidently aligned to financial years.");
  return {
    method: "pdf_text",
    units: detectUnits(statementPages.join("\n")),
    currency: detectCurrency(statementPages.join("\n")),
    basis: detectedBases.size === 1 ? [...detectedBases][0]! : null,
    pageCount: totalPages,
    items,
    ...(skippedAmbiguousRows
      ? { warnings: ["Some statement lines were skipped because their year columns and values could not be aligned safely."] }
      : {}),
  };
}

const METRIC_KEYS = METRICS.map((d) => d.key) as [string, ...string[]];
const aiSchema = z.object({
  currency: z.string().nullable(),
  units: z.enum(["crore", "lakh", "million", "thousand", "absolute"]).nullable(),
  basis: z.enum(["consolidated", "standalone"]).nullable(),
  items: z.array(
    z.object({
      metric_key: z.enum(METRIC_KEYS),
      raw_label: z.string(),
      fiscal_year: z.number(),
      value: z.number(),
      page: z.number().nullable(),
      confidence: z.number(),
    }),
  ),
});

const INSTRUCTIONS = `You extract figures from Indian company financial statements (Schedule III / Ind AS).
Rules:
- Copy numbers exactly as printed. Never estimate, compute or invent figures. If a line is absent, omit it.
- fiscal_year is the Indian FY end year: "31 March 2024", "FY24", "2023-24" → 2024.
- Values in the units printed in the statement header (e.g. "₹ in crore"); report that unit in "units". Brackets mean negative. EPS in rupees as printed.
- Only use these metric keys: ${METRICS.map((d) => `${d.key} (${d.label})`).join("; ")}.
- Prefer the primary statements (balance sheet, statement of profit and loss, cash flow statement) over notes.
- basis: consolidated or standalone as stated in the statement title.
- confidence 0–1: 0.95+ only when the label and column are unambiguous; lower when the label is approximate, the column/year is unclear or the text layout is garbled.
- page = the [Page N] marker the figure came from.`;

export async function aiStructure(text: string, apiKey: string): Promise<z.infer<typeof aiSchema>> {
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: INSTRUCTIONS,
    prompt: `Extract every matching line item for every year column present.\n\n${text}`,
    output: Output.object({ schema: aiSchema }),
    providerOptions: {
      openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
    },
  });
  try {
    for await (const _ of result.textStream) { /* drain */ }
    return (await result.output) as z.infer<typeof aiSchema>;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new ExtractionError("The AI response could not be parsed into statement data.");
    const msg = e instanceof Error ? e.message : String(e);
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 402) throw new ExtractionError("AI credits exhausted — add credits in workspace settings to extract PDFs.");
    if (status === 429) throw new ExtractionError("AI rate limit reached — try again in a minute.");
    if (status === 403) throw new ExtractionError("AI access is not enabled for this workspace.");
    console.error("AI extraction failed", msg);
    throw new ExtractionError("AI extraction failed. Please try again.");
  }
}

export async function parsePdf(buf: ArrayBuffer, expectedBasis?: "consolidated" | "standalone"): Promise<ParseResult> {
  let pages: string[];
  let totalPages: number;
  try {
    ({ pages, totalPages } = await pdfPages(buf));
  } catch {
    throw new ExtractionError("Could not read this PDF (it may be encrypted or corrupted).");
  }
  const fullText = pages.join("\n");
  if (fullText.replace(/\s/g, "").length < 200) {
    throw new ExtractionError("This PDF has no text layer (scanned image). OCR is not supported yet — upload a text PDF, Excel or CSV.");
  }
  return parsePdfTextPages(pages, totalPages, expectedBasis);
}

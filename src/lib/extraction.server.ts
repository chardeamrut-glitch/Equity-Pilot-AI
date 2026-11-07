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
  raw_label: string;
  fiscal_year: number;
  value: number;
  confidence: number;
  page_ref: string | null;
  flags: string[];
}
export interface ParseResult {
  method: "spreadsheet" | "pdf_ai" | "spreadsheet_ai";
  units: Unit | null;
  currency: string | null;
  basis: "consolidated" | "standalone" | null;
  pageCount: number | null;
  items: RawItem[];
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
    if (picked.length >= 14) break;
  }
  return picked.sort((a, b) => a.i - b.i);
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

export async function parsePdf(buf: ArrayBuffer, apiKey: string | undefined): Promise<ParseResult> {
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
  if (!apiKey) throw new ExtractionError("AI extraction is not configured (missing API key).");
  const picked = selectStatementPages(pages);
  if (!picked.length) throw new ExtractionError("No financial statement pages were found in this PDF.");
  const text = picked.map((p) => `[Page ${p.i + 1}]\n${p.t}`).join("\n\n");
  const out = await aiStructure(text, apiKey);
  return {
    method: "pdf_ai",
    units: out.units ?? detectUnits(text),
    currency: out.currency ?? detectCurrency(text),
    basis: out.basis ?? detectBasis(text),
    pageCount: totalPages,
    items: out.items
      .filter((x) => METRIC_BY_KEY[x.metric_key])
      .map((x) => ({
        metric_key: x.metric_key, raw_label: x.raw_label, fiscal_year: Math.round(x.fiscal_year), value: x.value,
        confidence: Math.max(0, Math.min(1, x.confidence)), page_ref: x.page ? `p.${x.page}` : null, flags: ["ai_extracted"],
      })),
  };
}

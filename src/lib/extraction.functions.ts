import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { METRIC_BY_KEY, convertUnits, type Unit } from "./financial-metrics";
import { consolidate, initialReviewStatus, validateFinancials, type MetricValue } from "./financial-validation";

const MAX_BYTES = 25 * 1024 * 1024;
/** Flags that make a value uncertain and force manual review. */
const UNCERTAIN = new Set(["fuzzy_label", "unit_assumed", "basis_mismatch", "duplicate_in_document", "negative_unexpected"]);
const MUST_BE_POSITIVE = new Set(["revenue", "total_assets", "total_income", "share_capital"]);

// POST /api/documents/extract
export const extractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ documentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: doc, error } = await sb
      .from("uploaded_documents")
      .select("*, analyses(id,user_id,units,reporting_basis,start_fy,end_fy,stage)")
      .eq("id", data.documentId)
      .single();
    if (error || !doc || !doc.analyses) return { ok: false as const, error: "Document not found" };
    const a = doc.analyses;
    if (a.user_id !== context.userId) return { ok: false as const, error: "Not allowed" };

    const fail = async (msg: string) => {
      await sb.from("uploaded_documents").update({ extraction_status: "failed", extraction_error: msg }).eq("id", doc.id);
      return { ok: false as const, error: msg };
    };

    await sb.from("uploaded_documents").update({ extraction_status: "processing", extraction_error: null }).eq("id", doc.id);
    try {
      if ((doc.size_bytes ?? 0) > MAX_BYTES) return await fail("File exceeds the 25 MB limit.");
      const { data: blob, error: dErr } = await sb.storage.from("financial-documents").download(doc.storage_path);
      if (dErr || !blob) return await fail("Could not read the file from storage.");
      if (blob.size > MAX_BYTES) return await fail("File exceeds the 25 MB limit.");
      const buf = await blob.arrayBuffer();
      const ext = doc.file_name.toLowerCase().split(".").pop() ?? "";

      const ex = await import("./extraction.server");
      const apiKey = process.env["LOVABLE_API_KEY"];
      let parsed: Awaited<ReturnType<typeof ex.parsePdf>>;
      try {
        if (ext === "pdf") parsed = await ex.parsePdf(buf, apiKey);
        else if (["xlsx", "xls", "csv"].includes(ext)) {
          const s = ex.parseSpreadsheet(buf, ext === "csv");
          parsed = s;
          if (s.items.length < 5 && apiKey) {
            const out = await ex.aiStructure(s.sheetText.slice(0, 80_000), apiKey);
            parsed = {
              method: "spreadsheet_ai", units: out.units ?? s.units, currency: out.currency ?? s.currency, basis: out.basis ?? s.basis, pageCount: s.pageCount,
              items: out.items.map((x) => ({ metric_key: x.metric_key, raw_label: x.raw_label, fiscal_year: Math.round(x.fiscal_year), value: x.value,
                confidence: Math.max(0, Math.min(1, x.confidence)), page_ref: null, flags: ["ai_extracted"] })),
            };
          }
        } else return await fail("Unsupported file type. Upload PDF, XLSX or CSV.");
      } catch (e) {
        if (e instanceof ex.ExtractionError) return await fail(e.message);
        console.error(e);
        return await fail("The file could not be parsed.");
      }

      if (!parsed.items.length) return await fail("No recognisable financial statement line items were found.");

      const target = a.units as Unit;
      const unitAssumed = !parsed.units;
      const srcUnit = (parsed.units ?? target) as Unit;
      const basisMismatch = parsed.basis != null && parsed.basis !== a.reporting_basis;
      const minFy = (a.start_fy ?? 1990) - 1; // keep prior year for opening balances
      const maxFy = a.end_fy ?? 2100;

      const seen = new Map<string, number>();
      const rows = parsed.items
        .filter((it) => it.fiscal_year >= minFy && it.fiscal_year <= maxFy)
        .map((it) => {
          const def = METRIC_BY_KEY[it.metric_key]!;
          const flags = [...it.flags];
          if (unitAssumed && def.scaled) flags.push("unit_assumed");
          if (basisMismatch) flags.push("basis_mismatch");
          if (MUST_BE_POSITIVE.has(it.metric_key) && it.value < 0) flags.push("negative_unexpected");
          const k = `${it.fiscal_year}|${it.metric_key}`;
          seen.set(k, (seen.get(k) ?? 0) + 1);
          if (seen.get(k)! > 1) flags.push("duplicate_in_document");
          const normalized = def.scaled ? Number(convertUnits(it.value, srcUnit, target).toFixed(4)) : it.value;
          return {
            analysis_id: a.id, document_id: doc.id, fiscal_year: it.fiscal_year, metric_key: it.metric_key, statement: def.statement,
            raw_label: it.raw_label.slice(0, 300), value: it.value, original_value: it.value, normalized_value: normalized,
            source_unit: def.scaled ? srcUnit : "absolute", confidence: Number(it.confidence.toFixed(3)), page_ref: it.page_ref, flags,
            review_status: initialReviewStatus(it.confidence, flags.filter((f) => UNCERTAIN.has(f))),
          };
        });
      if (!rows.length) return await fail(`No figures found for FY${minFy + 1}–FY${maxFy}.`);

      await sb.from("extracted_financial_metrics").delete().eq("document_id", doc.id);
      const { error: iErr } = await sb.from("extracted_financial_metrics").insert(rows);
      if (iErr) return await fail("Could not save extracted values: " + iErr.message);

      const years = [...new Set(rows.map((r) => r.fiscal_year))].sort();
      await sb.from("uploaded_documents").update({
        extraction_status: "completed", extraction_error: null, extraction_method: parsed.method, page_count: parsed.pageCount,
        detected_units: parsed.units, detected_currency: parsed.currency, detected_basis: parsed.basis, detected_fiscal_years: years,
        extracted_at: new Date().toISOString(),
      }).eq("id", doc.id);
      if (a.stage === "company_selected" || a.stage === "documents_uploaded") {
        await sb.from("analyses").update({ stage: "extracted" }).eq("id", a.id);
      }
      return { ok: true as const, count: rows.length, needsReview: rows.filter((r) => r.review_status === "needs_review").length, years };
    } catch (e) {
      console.error("extractDocument", e);
      return await fail("Unexpected error during extraction.");
    }
  });

// Review actions on a single extracted value
export const reviewMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["confirm", "correct", "reject", "reset"]),
      value: z.number().finite().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: row, error } = await sb.from("extracted_financial_metrics").select("*, analyses(units, stage)").eq("id", data.id).single();
    if (error || !row) throw new Error("Value not found");
    const now = new Date().toISOString();
    let patch: Record<string, unknown>;
    if (data.action === "confirm") patch = { review_status: "confirmed", reviewed_at: now };
    else if (data.action === "reject") patch = { review_status: "rejected", reviewed_at: now };
    else if (data.action === "reset") {
      const def = METRIC_BY_KEY[row.metric_key];
      const orig = row.original_value;
      const norm = orig == null ? null : def?.scaled ? convertUnits(Number(orig), (row.source_unit ?? row.analyses?.units) as Unit, row.analyses!.units as Unit) : Number(orig);
      patch = { review_status: "needs_review", value: orig, normalized_value: norm, is_user_corrected: false, reviewed_at: null };
    } else {
      if (data.value == null) throw new Error("A value is required");
      // Corrections are entered in the analysis unit.
      patch = { review_status: "corrected", normalized_value: data.value, is_user_corrected: true, reviewed_at: now };
    }
    const { error: uErr } = await sb.from("extracted_financial_metrics").update(patch).eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    // Any edit after approval re-opens review.
    if (row.analyses && !["company_selected", "documents_uploaded", "extracted"].includes(row.analyses.stage)) {
      await sb.from("analyses").update({ stage: "extracted" }).eq("id", row.analysis_id);
    }
    return { ok: true };
  });

async function loadValues(sb: typeof import("@/integrations/supabase/client").supabase, analysisId: string) {
  const { data, error } = await sb
    .from("extracted_financial_metrics")
    .select("id,fiscal_year,metric_key,normalized_value,document_id,review_status")
    .eq("analysis_id", analysisId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, value: r.normalized_value == null ? null : Number(r.normalized_value) })) as (MetricValue & { id: string })[];
}

// POST /api/financial-data/validate
export const validateFinancialData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ analysisId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: a, error } = await sb.from("analyses").select("id,start_fy,end_fy,user_id").eq("id", data.analysisId).single();
    if (error || !a || a.user_id !== context.userId) throw new Error("Analysis not found");
    const values = await loadValues(sb, a.id);
    const years: number[] = [];
    for (let y = a.start_fy!; y <= a.end_fy!; y++) years.push(y);
    const issues = validateFinancials(values, years);
    await sb.from("data_validation_results").delete().eq("analysis_id", a.id);
    if (issues.length) {
      await sb.from("data_validation_results").insert(issues.map((i) => ({ analysis_id: a.id, fiscal_year: i.fiscal_year, rule_key: i.rule_key, severity: i.severity, message: i.message, passed: i.passed })));
    }
    const pendingReview = values.filter((v) => v.review_status === "needs_review").length;
    return { issues, pendingReview, errors: issues.filter((i) => i.severity === "error" && !i.passed).length };
  });

// Approve: writes standardised statements. Blocks on unreviewed values or validation errors.
export const approveFinancialData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ analysisId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: a, error } = await sb.from("analyses").select("*").eq("id", data.analysisId).single();
    if (error || !a || a.user_id !== context.userId) throw new Error("Analysis not found");
    const values = await loadValues(sb, a.id);
    const pending = values.filter((v) => v.review_status === "needs_review").length;
    if (pending) return { ok: false as const, error: `${pending} uncertain value(s) still need review.` };
    const years: number[] = [];
    for (let y = a.start_fy!; y <= a.end_fy!; y++) years.push(y);
    const issues = validateFinancials(values, years);
    const errors = issues.filter((i) => i.severity === "error" && !i.passed);
    if (errors.length) return { ok: false as const, error: `${errors.length} validation error(s) must be fixed first.` };

    const { chosen } = consolidate(values);
    const { data: corrected } = await sb.from("extracted_financial_metrics").select("fiscal_year").eq("analysis_id", a.id).eq("is_user_corrected", true);
    const correctedYears = new Set((corrected ?? []).map((c) => c.fiscal_year));
    const docByYear = new Map<number, string>();
    for (const v of values) if (v.document_id && !docByYear.has(v.fiscal_year)) docByYear.set(v.fiscal_year, v.document_id);

    for (const fy of years) {
      const cols = (stmt: string) => {
        const o: Record<string, number | null> = {};
        for (const def of Object.values(METRIC_BY_KEY)) if (def.statement === stmt && def.column) o[def.column] = chosen.get(`${fy}|${def.key}`) ?? null;
        return o;
      };
      const { data: period, error: pErr } = await sb.from("financial_periods").upsert({
        analysis_id: a.id, fiscal_year: fy, period_label: `FY${fy}`, period_start: `${fy - 1}-04-01`, period_end: `${fy}-03-31`,
        reporting_basis: a.reporting_basis, currency: a.currency, units: a.units, source_document_id: docByYear.get(fy) ?? null, validation_status: "completed",
      }, { onConflict: "analysis_id,fiscal_year,reporting_basis" }).select("id").single();
      if (pErr || !period) throw new Error(pErr?.message ?? "Could not save period");
      const base = { period_id: period.id, analysis_id: a.id, source_document_id: docByYear.get(fy) ?? null, is_user_corrected: correctedYears.has(fy) };
      for (const [table, stmt] of [["income_statements", "income_statement"], ["balance_sheets", "balance_sheet"], ["cash_flow_statements", "cash_flow"]] as const) {
        const { error: sErr } = await sb.from(table).upsert({ ...base, ...cols(stmt) }, { onConflict: "period_id" });
        if (sErr) throw new Error(sErr.message);
      }
    }
    await sb.from("extracted_financial_metrics").update({ review_status: "confirmed", reviewed_at: new Date().toISOString() }).eq("analysis_id", a.id).eq("review_status", "high_confidence");
    await sb.from("analyses").update({ stage: "validated" }).eq("id", a.id);
    return { ok: true as const, years: years.length };
  });

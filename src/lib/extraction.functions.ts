import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  financialFieldSchema,
  financialMetricRowsFromYears,
  financialYearSchema,
  validateImportedFinancialYears,
} from "./excel-import";
import { METRIC_BY_KEY, convertUnits, type Statement, type Unit } from "./financial-metrics";
import {
  appendValidationResults,
  approvalBlockers,
  consolidate,
  initialReviewStatus,
  validateFinancials,
  type MetricValue,
} from "./financial-validation";

const MAX_BYTES = 25 * 1024 * 1024;
type PendingExtractedMetric = Omit<
  import("@/integrations/supabase/types").Database["public"]["Tables"]["extracted_financial_metrics"]["Insert"],
  "document_id" | "fiscal_year" | "metric_key" | "page_ref" | "raw_label" | "statement" | "value"
> & {
  document_id: string;
  fiscal_year: number;
  metric_key: string;
  page_ref: string | null;
  raw_label: string;
  statement: Statement;
  value: number;
};
/** Flags that make a value uncertain and force manual review. */
const UNCERTAIN = new Set(["fuzzy_label", "unit_assumed", "basis_mismatch", "duplicate_in_document", "negative_unexpected", "unrecognized_label"]);
const MUST_BE_POSITIVE = new Set(["revenue", "total_assets", "total_income", "share_capital"]);

export const importExcelWorkbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      documentId: z.string().uuid(),
      financialYears: z.array(financialYearSchema).min(2).max(5),
      declaredUnits: z.array(z.enum(["crore", "lakh", "million", "thousand", "absolute"])),
      missingColumns: z.array(financialFieldSchema),
      duplicateColumns: z.array(financialFieldSchema),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: document, error } = await sb
      .from("uploaded_documents")
      .select("id,file_name,analysis_id,extraction_status,analyses(id,user_id,units,reporting_basis,start_fy,end_fy)")
      .eq("id", data.documentId)
      .single();
    if (error || !document || !document.analyses || document.analyses.user_id !== context.userId) {
      throw new Error("Document not found or you do not have access.");
    }

    const analysis = document.analyses;
    if (!["xlsx", "xls", "csv"].includes(document.file_name.toLowerCase().split(".").pop() ?? "")) {
      throw new Error("Only Excel or CSV workbooks can be imported this way.");
    }
    if (document.extraction_status === "completed") {
      throw new Error("This workbook has already been imported.");
    }

    const validation = validateImportedFinancialYears(
      data.financialYears,
      data.declaredUnits,
      data.duplicateColumns,
      analysis.units as Unit,
      data.missingColumns,
    );
    if (!validation.financialYears) {
      const errors = validation.issues.filter((issue) => issue.severity === "error");
      throw new Error(errors.map((issue) => issue.message).join(" "));
    }

    const startFy = analysis.start_fy;
    const endFy = analysis.end_fy;
    if (startFy == null || endFy == null) {
      throw new Error("Set a financial-year range on the analysis before importing a workbook.");
    }
    const fiscalYears = validation.financialYears.map((year) => Number(year.year));
    if (fiscalYears.some((year) => year < startFy || year > endFy)) {
      throw new Error(`Workbook years must be within FY${startFy}–FY${endFy}.`);
    }

    const { data: existingMetrics, error: metricsQueryError } = await sb
      .from("extracted_financial_metrics")
      .select("id")
      .eq("document_id", document.id)
      .limit(1);
    if (metricsQueryError) throw new Error(metricsQueryError.message);
    if (existingMetrics.length) throw new Error("This workbook already has imported values.");

    const { data: existingPeriods, error: periodsError } = await sb
      .from("financial_periods")
      .select("id")
      .eq("analysis_id", analysis.id)
      .limit(1);
    if (periodsError) throw new Error(periodsError.message);
    if (existingPeriods.length) {
      throw new Error("This analysis already has saved financial records. Import the workbook into a new analysis to avoid replacing existing data.");
    }

    const metricRows = financialMetricRowsFromYears(validation.financialYears, analysis.units as Unit)
      .map((metric) => ({
        ...metric,
        analysis_id: analysis.id,
        document_id: document.id,
      }));
    if (!metricRows.length) throw new Error("The workbook contains no financial values to import.");

    const { data: claimedDocument, error: claimError } = await sb
      .from("uploaded_documents")
      .update({ extraction_status: "processing", extraction_error: null })
      .eq("id", document.id)
      .in("extraction_status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(`Could not claim workbook for import: ${claimError.message}`);
    if (!claimedDocument) throw new Error("This workbook is already being imported or has already been processed.");

    const { error: insertError } = await sb
      .from("extracted_financial_metrics")
      .insert(metricRows);
    if (insertError) {
      const { error: resetError } = await sb
        .from("uploaded_documents")
        .update({ extraction_status: "failed", extraction_error: insertError.message })
        .eq("id", document.id);
      if (resetError) {
        throw new Error(`Could not save workbook values for review: ${insertError.message}. Status update failed: ${resetError.message}`);
      }
      throw new Error(`Could not save workbook values for review: ${insertError.message}`);
    }

    const years = [...new Set(fiscalYears)].sort((a, b) => a - b);
    const { error: documentError } = await sb
      .from("uploaded_documents")
      .update({
        extraction_status: "completed",
        extraction_error: null,
        extraction_method: "spreadsheet",
        detected_units: data.declaredUnits[0] ?? analysis.units,
        detected_currency: "INR",
        detected_basis: analysis.reporting_basis,
        detected_fiscal_years: years,
        extracted_at: new Date().toISOString(),
      })
      .eq("id", document.id);
    if (documentError) {
      const { error: cleanupError } = await sb
        .from("extracted_financial_metrics")
        .delete()
        .eq("document_id", document.id);
      if (cleanupError) {
        throw new Error(`Could not update workbook status: ${documentError.message}. Metric cleanup failed: ${cleanupError.message}`);
      }
      const { error: resetError } = await sb
        .from("uploaded_documents")
        .update({ extraction_status: "pending", extraction_error: documentError.message })
        .eq("id", document.id);
      if (resetError) {
        throw new Error(`Could not update workbook status: ${documentError.message}. Status reset failed: ${resetError.message}`);
      }
      throw new Error(`Could not update workbook status: ${documentError.message}`);
    }

    const { error: stageError } = await sb
      .from("analyses")
      .update({ stage: "extracted" })
      .eq("id", analysis.id)
      .eq("user_id", context.userId);
    if (stageError) {
      const { error: cleanupError } = await sb
        .from("extracted_financial_metrics")
        .delete()
        .eq("document_id", document.id);
      if (cleanupError) {
        throw new Error(`Analysis status could not be updated: ${stageError.message}. Metric cleanup failed: ${cleanupError.message}`);
      }
      const { error: resetError } = await sb
        .from("uploaded_documents")
        .update({ extraction_status: "pending", extraction_error: stageError.message })
        .eq("id", document.id);
      if (resetError) {
        throw new Error(`Analysis status could not be updated: ${stageError.message}. Workbook status reset failed: ${resetError.message}`);
      }
      throw new Error(`Analysis status could not be updated: ${stageError.message}`);
    }

    return { ok: true as const, count: metricRows.length, years };
  });

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
      const { error: statusError } = await sb
        .from("uploaded_documents")
        .update({ extraction_status: "failed", extraction_error: msg })
        .eq("id", doc.id);
      return {
        ok: false as const,
        error: statusError ? `${msg} Status update failed: ${statusError.message}` : msg,
      };
    };

    const { data: claimed, error: claimError } = await sb
      .from("uploaded_documents")
      .update({ extraction_status: "processing", extraction_error: null })
      .eq("id", doc.id)
      .in("extraction_status", ["pending", "failed", "completed"])
      .select("id")
      .maybeSingle();
    if (claimError) return { ok: false as const, error: `Could not start extraction: ${claimError.message}` };
    if (!claimed) return { ok: false as const, error: "This document is already being extracted or cannot be retried." };

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
        if (ext === "pdf") parsed = await ex.parsePdf(buf, doc.reporting_basis);
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
      const basisMismatch = parsed.basis != null && parsed.basis !== doc.reporting_basis;
      const extractionBasis = parsed.basis ?? doc.detected_basis ?? doc.reporting_basis;
      const minFy = (a.start_fy ?? 1990) - 1; // keep prior year for opening balances
      const maxFy = a.end_fy ?? 2100;

      const { data: existingRows, error: existingError } = await sb
        .from("extracted_financial_metrics")
        .select("fiscal_year,metric_key,statement,raw_label,value,page_ref")
        .eq("document_id", doc.id);
      if (existingError) return await fail("Could not check existing extracted values: " + existingError.message);
      const { extractionRowKey, rowsNotAlreadyExtracted } = await import("./extraction.server");
      const identityKeyForRow = (
        row: Omit<Parameters<typeof extractionRowKey>[0], "document_id" | "reporting_basis">,
      ) =>
        parsed.method === "pdf_text"
          ? extractionRowKey({ ...row, document_id: doc.id, reporting_basis: extractionBasis })
          : JSON.stringify([
            row.fiscal_year,
            row.metric_key,
            row.statement,
            row.raw_label.trim().toLowerCase(),
            row.value,
            row.page_ref,
          ]);
      const existingKeys = new Set((existingRows ?? []).map((row) => identityKeyForRow({
        fiscal_year: row.fiscal_year,
        metric_key: row.metric_key,
        statement: row.statement as import("./financial-metrics").Statement,
        raw_label: row.raw_label ?? "",
        value: Number(row.value),
        page_ref: row.page_ref,
      })));

      const seenCounts = new Map<string, number>();
      const rowsByMetricYear = new Map<string, number[]>();
      const rows: PendingExtractedMetric[] = [];
      for (const it of parsed.items) {
        if (it.fiscal_year < minFy || it.fiscal_year > maxFy) continue;
        const def = METRIC_BY_KEY[it.metric_key];
        const statement = def?.statement ?? it.statement;
        if (!statement) {
          return await fail("Could not determine the statement type for one or more extracted values.");
        }
        const unrecognized = !def;
        const rowIdentity = {
          fiscal_year: it.fiscal_year,
          metric_key: it.metric_key,
          statement,
          raw_label: it.raw_label.slice(0, 300),
          value: it.value,
          page_ref: it.page_ref,
        };

        const flags = [...it.flags];
        if (unitAssumed && (def?.scaled ?? true)) flags.push("unit_assumed");
        if (basisMismatch) flags.push("basis_mismatch");
        if (def && MUST_BE_POSITIVE.has(it.metric_key) && it.value < 0) flags.push("negative_unexpected");
        const metricYearKey = `${it.fiscal_year}|${it.metric_key}`;
        const conflictingExisting = (existingRows ?? []).some((existing) =>
          existing.fiscal_year === it.fiscal_year &&
          existing.metric_key === it.metric_key &&
          existing.statement === statement &&
          Number(existing.value) !== it.value,
        );
        const previousRows = rowsByMetricYear.get(metricYearKey) ?? [];
        const conflictingParsedRows = previousRows.filter((index) => rows[index]!.value !== it.value);
        const seenCount = (seenCounts.get(metricYearKey) ?? 0) + 1;
        seenCounts.set(metricYearKey, seenCount);
        if (parsed.method === "pdf_text" ? conflictingExisting || conflictingParsedRows.length > 0 : seenCount > 1) {
          flags.push("duplicate_in_document");
        }
        const normalized = !def
          ? it.value
          : def.scaled
            ? Number(convertUnits(it.value, srcUnit, target).toFixed(4))
            : it.value;
        const row = {
          analysis_id: a.id, document_id: doc.id, fiscal_year: it.fiscal_year, metric_key: it.metric_key, statement,
          raw_label: it.raw_label.slice(0, 300), value: it.value, original_value: it.value, normalized_value: normalized,
          source_unit: !def ? srcUnit : def.scaled ? srcUnit : "absolute", confidence: Number(it.confidence.toFixed(3)), page_ref: it.page_ref, flags,
          review_status: unrecognized
            ? "needs_review"
            : initialReviewStatus(it.confidence, flags.filter((f) => UNCERTAIN.has(f))),
        };
        if (parsed.method === "pdf_text" && conflictingParsedRows.length) {
          for (const previousIndex of conflictingParsedRows) {
            const previous = rows[previousIndex]!;
            previous.flags = previous.flags?.includes("duplicate_in_document")
              ? previous.flags
              : [...(previous.flags ?? []), "duplicate_in_document"];
            previous.review_status = "needs_review";
          }
        }
        if (parsed.method === "pdf_text") rowsByMetricYear.set(metricYearKey, [...previousRows, rows.length]);
        rows.push(row);
      }
      if (!rows.length) return await fail(`No figures found for FY${minFy + 1}–FY${maxFy}.`);

      const newRows = parsed.method === "pdf_text"
        ? rowsNotAlreadyExtracted(
          rows,
          (row) => ({
            ...row,
            document_id: doc.id,
            reporting_basis: extractionBasis,
          }),
          (existingRows ?? []).map((row) => ({
            document_id: doc.id,
            reporting_basis: extractionBasis,
            fiscal_year: row.fiscal_year,
            metric_key: row.metric_key,
            statement: row.statement as import("./financial-metrics").Statement,
            raw_label: row.raw_label ?? "",
            value: Number(row.value),
            page_ref: row.page_ref,
          })),
        )
        : rows.filter((row) => !existingKeys.has(identityKeyForRow(row)));
      if (newRows.length) {
        const { error: iErr } = await sb.from("extracted_financial_metrics").insert(newRows);
        if (iErr) return await fail("Could not save extracted values: " + iErr.message);
      }

      const years = [...new Set(rows.map((r) => r.fiscal_year))].sort();
      const { error: completionError } = await sb.from("uploaded_documents").update({
        extraction_status: "completed", extraction_error: parsed.warnings?.join(" ") ?? null, extraction_method: parsed.method, page_count: parsed.pageCount,
        detected_units: parsed.units, detected_currency: parsed.currency, detected_basis: parsed.basis, detected_fiscal_years: years,
        extracted_at: new Date().toISOString(),
      }).eq("id", doc.id);
      if (completionError) {
        return await fail(`Values were saved, but extraction status could not be updated: ${completionError.message}`);
      }
      if (a.stage === "company_selected" || a.stage === "documents_uploaded") {
        const { error: stageError } = await sb.from("analyses").update({ stage: "extracted" }).eq("id", a.id);
        if (stageError) console.error("Could not update analysis stage after extraction", stageError.message);
      }
      return {
        ok: true as const,
        count: newRows.length,
        skippedDuplicates: rows.length - newRows.length,
        needsReview: rows.filter((r) => r.review_status === "needs_review").length,
        years,
      };
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
      action: z.enum(["confirm", "correct", "reject", "reset", "map"]),
      value: z.number().finite().nullable().optional(),
      metricKey: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: row, error } = await sb.from("extracted_financial_metrics").select("*, analyses(units, stage)").eq("id", data.id).single();
    if (error || !row) throw new Error("Value not found");
    const now = new Date().toISOString();
    let patch: import("@/integrations/supabase/types").Database["public"]["Tables"]["extracted_financial_metrics"]["Update"];
    if (data.action === "map") {
      if (row.metric_key !== "unrecognized") throw new Error("Only unrecognized PDF values can be mapped.");
      const def = METRIC_BY_KEY[data.metricKey ?? ""];
      if (!def) throw new Error("Select a supported financial metric.");
      const original = row.original_value == null ? null : Number(row.original_value);
      const sourceUnit = (row.source_unit ?? row.analyses?.units) as Unit;
      const analysisUnit = row.analyses?.units as Unit;
      const normalized = original == null
        ? null
        : def.scaled
          ? Number(convertUnits(original, sourceUnit, analysisUnit).toFixed(4))
          : original;
      patch = {
        metric_key: def.key,
        statement: def.statement,
        normalized_value: normalized,
        source_unit: def.scaled ? sourceUnit : "absolute",
        flags: row.flags.filter((flag) => flag !== "unrecognized_label"),
        review_status: "needs_review",
        is_user_corrected: true,
        reviewed_at: null,
      };
    } else if (data.action === "confirm") patch = { review_status: "confirmed", reviewed_at: now };
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
    .select("id,fiscal_year,metric_key,statement,page_ref,normalized_value,document_id,review_status,source_unit,flags,uploaded_documents(created_at,fiscal_year,reporting_basis,detected_basis,detected_currency)")
    .eq("analysis_id", analysisId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    fiscal_year: r.fiscal_year,
    metric_key: r.metric_key,
    statement: r.statement as import("./financial-metrics").Statement,
    page_ref: r.page_ref,
    value: r.normalized_value == null ? null : Number(r.normalized_value),
    document_id: r.document_id,
    review_status: r.review_status,
    source_unit: r.source_unit,
    currency: r.uploaded_documents?.detected_currency,
    reporting_basis: r.uploaded_documents?.detected_basis ?? r.uploaded_documents?.reporting_basis ?? null,
    source_report_fiscal_year: r.uploaded_documents?.fiscal_year ?? null,
    source_report_date: r.uploaded_documents?.created_at ?? null,
    flags: r.flags,
  })) satisfies (MetricValue & { id: string })[];
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
    const unmapped = values.filter((value) => value.metric_key === "unrecognized" && value.review_status !== "rejected");
    if (unmapped.length) {
      issues.push({
        rule_key: "unmapped_pdf_values",
        severity: "error",
        fiscal_year: null,
        passed: false,
        message: `${unmapped.length} unrecognized PDF value(s) must be mapped to a financial metric or rejected before approval.`,
      });
    }
    await appendValidationResults(
      a.id,
      issues,
      (rows) => sb.from("data_validation_results").insert(rows),
    );
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
    const unmapped = values.filter((v) => v.metric_key === "unrecognized" && v.review_status !== "rejected").length;
    if (unmapped) return { ok: false as const, error: `${unmapped} unrecognized PDF value(s) must be mapped or rejected before approval.` };
    const pending = values.filter((v) => v.review_status === "needs_review").length;
    if (pending) return { ok: false as const, error: `${pending} uncertain value(s) still need review.` };
    const years: number[] = [];
    for (let y = a.start_fy!; y <= a.end_fy!; y++) years.push(y);
    const issues = validateFinancials(values, years);
    const blockers = approvalBlockers(issues);
    const errors = blockers.filter((i) => i.severity === "error");
    if (errors.length) return { ok: false as const, error: `${errors.length} validation error(s) must be fixed first.` };
    const missingCore = blockers.find((i) => i.rule_key === "missing_core");
    if (missingCore) return { ok: false as const, error: `Required financial data is missing for FY${missingCore.fiscal_year}: ${missingCore.message.replace(/^Missing: /, "")}` };

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
    await sb.from("analyses").update({ stage: "validated" }).eq("id", a.id);
    return { ok: true as const, years: years.length };
  });

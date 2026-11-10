import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  financialFieldSchema,
  financialMetricRowsFromYears,
  financialYearSchema,
  validateImportedFinancialYears,
} from "@/lib/excel-import";
import type { FinancialYear } from "@/lib/financial-analysis";

// POST /api/companies/search equivalent
export const searchCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const q = data.query.replace(/[%_,()]/g, " ").trim();
    const { data: rows, error } = await context.supabase
      .from("companies")
      .select("id,name,nse_symbol,bse_code,isin,exchange,sector,industry,source")
      .or(`name.ilike.%${q}%,nse_symbol.ilike.%${q}%,bse_code.ilike.%${q}%,isin.ilike.%${q}%`)
      .order("name")
      .limit(12);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// POST /api/analyses equivalent
export const createAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        reportingBasis: z.enum(["consolidated", "standalone"]),
        units: z.enum(["crore", "lakh", "million", "thousand", "absolute"]),
        startFy: z.number().int().min(1990).max(2100),
        endFy: z.number().int().min(1990).max(2100),
        excelData: z.object({
          financialYears: z.array(financialYearSchema).min(2).max(5),
          declaredUnits: z.array(z.enum(["crore", "lakh", "million", "thousand", "absolute"])),
          duplicateColumns: z.array(financialFieldSchema),
          missingColumns: z.array(financialFieldSchema),
        }).optional(),
      })
      .refine((v) => v.endFy >= v.startFy, "End FY must be after start FY")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let financialYears: FinancialYear[] | undefined;
    let startFy = data.startFy;
    let endFy = data.endFy;
    if (data.excelData) {
      const validated = validateImportedFinancialYears(
        data.excelData.financialYears,
        data.excelData.declaredUnits,
        data.excelData.duplicateColumns,
        data.units,
        data.excelData.missingColumns,
      );
      if (!validated.financialYears) {
        const errors = validated.issues.filter((issue) => issue.severity === "error");
        throw new Error(errors.map((issue) => issue.message).join(" "));
      }

      financialYears = validated.financialYears;
      startFy = Math.min(...financialYears.map((year) => Number(year.year)));
      endFy = Math.max(...financialYears.map((year) => Number(year.year)));
    }

    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("name")
      .eq("id", data.companyId)
      .single();
    if (cErr || !company) throw new Error("Company not found");
    const { data: row, error } = await context.supabase
      .from("analyses")
      .insert({
        user_id: context.userId,
        company_id: data.companyId,
        title: `${company.name} — FY${startFy}–FY${endFy}`,
        reporting_basis: data.reportingBasis,
        units: data.units,
        start_fy: startFy,
        end_fy: endFy,
        ...(financialYears ? { stage: "extracted" as const } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (financialYears) {
      try {
        const metricRows = financialMetricRowsFromYears(financialYears, data.units)
          .map((metric) => ({ ...metric, analysis_id: row.id, document_id: null }));
        const { error: metricsError } = await context.supabase
          .from("extracted_financial_metrics")
          .insert(metricRows);
        if (metricsError) throw new Error(`Could not save Excel values for review: ${metricsError.message}`);
      } catch (error) {
        const { error: cleanupError } = await context.supabase
          .from("analyses")
          .delete()
          .eq("id", row.id)
          .eq("user_id", context.userId);
        const message = error instanceof Error ? error.message : String(error);
        if (cleanupError) throw new Error(`${message}. Cleanup failed: ${cleanupError.message}`);
        throw error;
      }
    }

    return { id: row.id };
  });

// Add a company not in the directory (user-entered identifiers, flagged as user_added)
export const addCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(160),
        nseSymbol: z.string().trim().toUpperCase().max(20).optional().or(z.literal("")),
        bseCode: z.string().trim().regex(/^\d{6}$/, "BSE code is 6 digits").optional().or(z.literal("")),
        exchange: z.enum(["NSE", "BSE", "BOTH"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("companies")
      .insert({
        name: data.name,
        nse_symbol: data.nseSymbol || null,
        bse_code: data.bseCode || null,
        exchange: data.exchange,
        source: "user_added",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message.includes("duplicate") ? "That symbol already exists in the directory" : error.message);
    return { id: row.id };
  });

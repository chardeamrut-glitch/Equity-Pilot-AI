import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateImportedFinancialYears } from "@/lib/excel-import";
import type { FinancialYear } from "@/lib/financial-analysis";

const financialYearSchema = z.object({
  year: z.string().trim().min(1),
  revenue: z.number().finite().nullable().default(null),
  ebitda: z.number().finite().nullable().default(null),
  ebit: z.number().finite().nullable().default(null),
  netProfit: z.number().finite().nullable().default(null),
  totalDebt: z.number().finite().nullable().default(null),
  totalEquity: z.number().finite().nullable().default(null),
  currentAssets: z.number().finite().nullable().default(null),
  currentLiabilities: z.number().finite().nullable().default(null),
  operatingCashFlow: z.number().finite().nullable().default(null),
  capex: z.number().finite().nullable().default(null),
  averageEquity: z.number().finite().nullable().default(null),
  averageCapitalEmployed: z.number().finite().nullable().default(null),
});

const financialFieldSchema = z.enum([
  "year", "revenue", "ebitda", "ebit", "netProfit", "totalDebt", "totalEquity",
  "currentAssets", "currentLiabilities", "operatingCashFlow", "capex", "averageEquity", "averageCapitalEmployed",
]);

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
        ...(financialYears ? { stage: "validated" as const } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (financialYears) {
      try {
        const financialYearByNumber = new Map(financialYears.map((year) => [Number(year.year), year]));
        const periods = Array.from({ length: endFy - startFy + 1 }, (_, index) => {
          const fiscalYear = startFy + index;
          return {
            analysis_id: row.id,
            fiscal_year: fiscalYear,
            period_label: `FY${fiscalYear}`,
            period_start: `${fiscalYear - 1}-04-01`,
            period_end: `${fiscalYear}-03-31`,
            reporting_basis: data.reportingBasis,
            currency: "INR",
            units: data.units,
            validation_status: "completed" as const,
          };
        });
        const { data: storedPeriods, error: periodsError } = await context.supabase
          .from("financial_periods")
          .insert(periods)
          .select("id,fiscal_year");
        if (periodsError || !storedPeriods) {
          throw new Error(`Could not save Excel periods: ${periodsError?.message ?? "No periods returned"}`);
        }

        const incomeRows = storedPeriods.map((period) => {
          const year = financialYearByNumber.get(period.fiscal_year);
          return {
            analysis_id: row.id,
            period_id: period.id,
            revenue: year?.revenue ?? null,
            ebitda: year?.ebitda ?? null,
            ebit: year?.ebit ?? null,
            net_profit: year?.netProfit ?? null,
          };
        });
        const balanceRows = storedPeriods.map((period) => {
          const year = financialYearByNumber.get(period.fiscal_year);
          return {
            analysis_id: row.id,
            period_id: period.id,
            total_debt: year?.totalDebt ?? null,
            total_equity: year?.totalEquity ?? null,
            current_assets: year?.currentAssets ?? null,
            current_liabilities: year?.currentLiabilities ?? null,
            average_equity: year?.averageEquity ?? null,
            average_capital_employed: year?.averageCapitalEmployed ?? null,
          };
        });
        const cashFlowRows = storedPeriods.map((period) => {
          const year = financialYearByNumber.get(period.fiscal_year);
          return {
            analysis_id: row.id,
            period_id: period.id,
            cash_from_operations: year?.operatingCashFlow ?? null,
            capex: year?.capex ?? null,
          };
        });
        const [incomeResult, balanceResult, cashFlowResult] = await Promise.all([
          context.supabase.from("income_statements").insert(incomeRows),
          context.supabase.from("balance_sheets").insert(balanceRows),
          context.supabase.from("cash_flow_statements").insert(cashFlowRows),
        ]);
        const writeError = incomeResult.error ?? balanceResult.error ?? cashFlowResult.error;
        if (writeError) throw new Error(`Could not save Excel statements: ${writeError.message}`);
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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      })
      .refine((v) => v.endFy >= v.startFy, "End FY must be after start FY")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
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
        title: `${company.name} — FY${data.startFy}–FY${data.endFy}`,
        reporting_basis: data.reportingBasis,
        units: data.units,
        start_fy: data.startFy,
        end_fy: data.endFy,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
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

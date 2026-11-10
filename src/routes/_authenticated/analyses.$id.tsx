import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, FileUp, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill } from "@/components/brand";
import { analysisQuery, documentsQuery, type AnalysisRow } from "@/lib/queries";
import { STAGES, STATEMENT_TYPES, fyLabel, stageIndex } from "@/lib/config";
import { extractDocument, importExcelWorkbook } from "@/lib/extraction.functions";
import { ReviewPanel } from "@/components/review-panel";
import { readFinancialWorkbook, validateFinancialWorkbook } from "@/lib/excel-import";
import type { Unit } from "@/lib/financial-metrics";
import {
  analyzeFinancials,
  calculateCAGR,
  financialYearsFromStatements,
  type StoredFinancialStatements,
} from "@/lib/financial-analysis";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/analyses/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search["tab"] === "analysis" || search["tab"] === "validation"
      ? { tab: search["tab"] }
      : {}),
  }),
  head: () => ({ meta: [{ title: "Analysis workspace — EquityPilot AI" }, { name: "description", content: "Upload statements and track analysis progress." }] }),
  component: AnalysisPage,
});

const ACCEPT = ".pdf,.xlsx,.xls,.csv";
const MAX = 25 * 1024 * 1024;

function documentFiscalYearLabel(document: { fiscal_year: number; detected_fiscal_years: number[] }) {
  const years = document.detected_fiscal_years.length
    ? [...document.detected_fiscal_years].sort((a, b) => a - b)
    : [document.fiscal_year];
  const label = (year: number) => `FY${String(year).slice(-2)}`;
  return years.length > 1 ? `${label(years[0]!)}–${label(years[years.length - 1]!)}` : label(years[0]!);
}

function AnalysisPage() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const { data: a, isLoading, error } = useQuery(analysisQuery(id));

  if (isLoading) return <div className="mx-auto max-w-6xl space-y-3"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>;
  if (error || !a) return <Card className="mx-auto max-w-xl p-8 text-center"><p className="text-sm text-destructive">Analysis not found or you don't have access.</p><Button asChild className="mt-4" size="sm"><Link to="/dashboard">Back to dashboard</Link></Button></Card>;

  const idx = stageIndex(a.stage);
  const co = a.companies;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">{co?.exchange === "BOTH" ? "NSE · BSE" : co?.exchange} · {co?.nse_symbol ?? co?.bse_code}</div>
          <h1 className="text-2xl font-semibold">{co?.name}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {a.reporting_basis} · INR {a.units} · FY{a.start_fy}–FY{a.end_fy}
          </p>
        </div>
        <StatusPill status={a.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-4">
          <div className="eyebrow mb-3">Workflow</div>
          <ol className="space-y-1">
            {STAGES.map((s, i) => {
              const done = i <= idx;
              const next = i === idx + 1;
              return (
                <li key={s.key} className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm ${next ? "bg-accent" : ""}`}>
                  <span className={`grid h-5 w-5 place-items-center rounded-full border font-mono text-[10px] ${done ? "border-success bg-success text-success-foreground" : next ? "border-primary text-primary" : "text-muted-foreground"}`}>
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className={done ? "text-foreground" : next ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        </Card>

        <Tabs defaultValue={tab ?? "upload"}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="validation">Data validation</TabsTrigger>
            <TabsTrigger value="analysis">Financial analysis</TabsTrigger>
            <TabsTrigger value="valuation">Valuation</TabsTrigger>
            <TabsTrigger value="thesis">Thesis</TabsTrigger>
            <TabsTrigger value="assistant">AI assistant</TabsTrigger>
            <TabsTrigger value="deck">Pitch deck</TabsTrigger>
          </TabsList>
          <TabsContent value="upload"><UploadPanel analysis={a} /></TabsContent>
          <TabsContent value="validation"><ReviewPanel analysis={a} /></TabsContent>
          <TabsContent value="analysis"><FinancialAnalysisPanel analysis={a} /></TabsContent>
          <TabsContent value="valuation"><Pending title="Valuation dashboard" need="Financial analysis + a verified market price source" detail="DCF and relative valuation with editable assumptions. Current market prices are never invented — a market-data source must be configured or you enter the price with its source." /></TabsContent>
          <TabsContent value="thesis"><Pending title="Investment thesis" need="Valuation" detail="AI-written thesis, risks and recommendation, clearly separated from the calculated numbers." /></TabsContent>
          <TabsContent value="assistant"><Pending title="AI research assistant" need="Extracted data" detail="Ask questions about this company's statements. Answers cite the uploaded document they came from." /></TabsContent>
          <TabsContent value="deck"><Pending title="10-slide pitch deck" need="Investment thesis" detail="Editable PowerPoint, Excel model and PDF report generated in the background." /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function FinancialAnalysisPanel({ analysis }: { analysis: AnalysisRow }) {
  const validationReady = stageIndex(analysis.stage) >= stageIndex("validated");
  const statements = useQuery({
    queryKey: ["financial-analysis-data", analysis.id],
    enabled: validationReady,
    queryFn: async () => {
      const { data: periods, error: periodError } = await supabase
        .from("financial_periods")
        .select("id,fiscal_year,reporting_basis,units,currency,validation_status")
        .eq("analysis_id", analysis.id)
        .order("fiscal_year", { ascending: true });
      if (periodError) throw periodError;
      if (!periods.length) return [];

      if (analysis.start_fy != null && analysis.end_fy != null) {
        const availableYears = new Set(periods.map((period) => period.fiscal_year));
        const missingYears: number[] = [];
        for (let year = analysis.start_fy; year <= analysis.end_fy; year++) {
          if (!availableYears.has(year)) missingYears.push(year);
        }
        if (missingYears.length) {
          throw new Error(`Missing validated financial periods: ${missingYears.map((year) => `FY${year}`).join(", ")}.`);
        }
      }

      const periodIds = periods.map((period) => period.id);
      const [income, balance, cashFlow] = await Promise.all([
        supabase.from("income_statements")
          .select("period_id,revenue,ebitda,ebit,net_profit")
          .eq("analysis_id", analysis.id)
          .in("period_id", periodIds),
        supabase.from("balance_sheets")
          .select("period_id,total_debt,total_equity,current_assets,current_liabilities,average_equity,average_capital_employed")
          .eq("analysis_id", analysis.id)
          .in("period_id", periodIds),
        supabase.from("cash_flow_statements")
          .select("period_id,cash_from_operations,capex")
          .eq("analysis_id", analysis.id)
          .in("period_id", periodIds),
      ]);
      if (income.error) throw income.error;
      if (balance.error) throw balance.error;
      if (cashFlow.error) throw cashFlow.error;

      const incomeByPeriod = new Map((income.data ?? []).map((row) => [row.period_id, row]));
      const balanceByPeriod = new Map((balance.data ?? []).map((row) => [row.period_id, row]));
      const cashFlowByPeriod = new Map((cashFlow.data ?? []).map((row) => [row.period_id, row]));

      const stored: StoredFinancialStatements[] = periods.map((period) => {
        const incomeRow = incomeByPeriod.get(period.id);
        const balanceRow = balanceByPeriod.get(period.id);
        const cashFlowRow = cashFlowByPeriod.get(period.id);
        return {
          period,
          incomeStatement: incomeRow ? {
            revenue: incomeRow.revenue,
            ebitda: incomeRow.ebitda,
            ebit: incomeRow.ebit,
            netProfit: incomeRow.net_profit,
          } : null,
          balanceSheet: balanceRow ? {
            totalDebt: balanceRow.total_debt,
            totalEquity: balanceRow.total_equity,
            currentAssets: balanceRow.current_assets,
            currentLiabilities: balanceRow.current_liabilities,
            averageEquity: balanceRow.average_equity,
            averageCapitalEmployed: balanceRow.average_capital_employed,
          } : null,
          cashFlow: cashFlowRow ? {
            operatingCashFlow: cashFlowRow.cash_from_operations,
            capex: cashFlowRow.capex,
          } : null,
        };
      });

      return financialYearsFromStatements(stored, analysis.reporting_basis, analysis.units);
    },
  });
  const results = useMemo(
    () => statements.data ? analyzeFinancials(statements.data) : [],
    [statements.data],
  );
  const chartFinancials = useMemo(
    () => statements.data?.map((year, index) => ({ ...year, ...results[index] })) ?? [],
    [results, statements.data],
  );
  const chartConfig: ChartConfig = {
    revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
    ebitda: { label: "EBITDA", color: "hsl(var(--chart-2))" },
    ebit: { label: "EBIT", color: "hsl(var(--chart-3))" },
    netProfit: { label: "Net profit", color: "hsl(var(--chart-4))" },
    freeCashFlow: { label: "Free cash flow", color: "hsl(var(--chart-5))" },
    revenueGrowth: { label: "Revenue growth", color: "hsl(var(--chart-1))" },
    ebitdaMargin: { label: "EBITDA margin", color: "hsl(var(--chart-2))" },
    ebitMargin: { label: "EBIT margin", color: "hsl(var(--chart-3))" },
    netProfitMargin: { label: "Net profit margin", color: "hsl(var(--chart-4))" },
    roe: { label: "ROE", color: "hsl(var(--chart-5))" },
    roce: { label: "ROCE", color: "hsl(var(--chart-1))" },
    debtToEquity: { label: "Debt / equity", color: "hsl(var(--chart-2))" },
    currentRatio: { label: "Current ratio", color: "hsl(var(--chart-3))" },
  };
  const fmt = (value: number | null | undefined, suffix = "%") =>
    value == null || !Number.isFinite(value) ? "N/A" : `${value.toFixed(2)}${suffix}`;
  const fmtAmount = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value)
      ? "N/A"
      : `₹ ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${analysis.units}`;
  const latestFinancialYear = statements.data?.at(-1);
  const fiveYearRevenueStart = latestFinancialYear
    ? statements.data?.find((year) => Number(year.year) === Number(latestFinancialYear.year) - 5)
    : undefined;
  const revenueCagr =
    typeof fiveYearRevenueStart?.revenue === "number" &&
    typeof latestFinancialYear?.revenue === "number"
      ? calculateCAGR(fiveYearRevenueStart.revenue, latestFinancialYear.revenue, 5)
      : null;

  if (!validationReady) {
    return (
      <Card className="p-8">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Financial analysis requires validated data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Extract the statements, resolve critical validation errors, then approve the data in the Data validation tab.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (statements.isLoading) return <Card className="p-6"><Skeleton className="h-64" /></Card>;
  if (statements.error) return <Card className="p-6 text-sm text-destructive">{(statements.error as Error).message}</Card>;
  if (!results.length) return <Card className="p-8 text-sm text-muted-foreground">No validated financial periods are available for this analysis.</Card>;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="font-semibold">Five-year financial analysis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {analysis.reporting_basis} statements · INR, ₹ {analysis.units}. Ratios are calculated deterministically from approved statement values.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="eyebrow">Revenue · FY{latestFinancialYear?.year ?? "—"}</div>
          <div className="mt-2 font-mono text-xl font-medium">{fmtAmount(latestFinancialYear?.revenue)}</div>
        </Card>
        <Card className="p-5">
          <div className="eyebrow">EBITDA · FY{latestFinancialYear?.year ?? "—"}</div>
          <div className="mt-2 font-mono text-xl font-medium">{fmtAmount(latestFinancialYear?.ebitda)}</div>
        </Card>
        <Card className="p-5">
          <div className="eyebrow">Net profit · FY{latestFinancialYear?.year ?? "—"}</div>
          <div className="mt-2 font-mono text-xl font-medium">{fmtAmount(latestFinancialYear?.netProfit)}</div>
        </Card>
        <Card className="p-5">
          <div className="eyebrow">Five-year Revenue CAGR</div>
          <div className="mt-2 font-mono text-xl font-medium">{fmt(revenueCagr)}</div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Financial trends · ₹ {analysis.units}</h3>
          <ChartContainer config={chartConfig} className="mt-3 h-[260px] w-full">
            <LineChart data={chartFinancials} margin={{ left: 8, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={64} />
              <Tooltip formatter={(value) => fmtAmount(Number(value))} />
              <Legend />
              <Line dataKey="revenue" type="monotone" stroke="var(--color-revenue)" connectNulls={false} dot={false} />
              <Line dataKey="ebitda" type="monotone" stroke="var(--color-ebitda)" connectNulls={false} dot={false} />
              <Line dataKey="ebit" type="monotone" stroke="var(--color-ebit)" connectNulls={false} dot={false} />
              <Line dataKey="netProfit" type="monotone" stroke="var(--color-netProfit)" connectNulls={false} dot={false} />
              <Line dataKey="freeCashFlow" type="monotone" stroke="var(--color-freeCashFlow)" connectNulls={false} dot={false} />
            </LineChart>
          </ChartContainer>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Growth, margins and returns · %</h3>
          <ChartContainer config={chartConfig} className="mt-3 h-[260px] w-full">
            <LineChart data={results} margin={{ left: 8, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={64} />
              <Tooltip formatter={(value) => fmt(Number(value))} />
              <Legend />
              <Line dataKey="revenueGrowth" type="monotone" stroke="var(--color-revenueGrowth)" connectNulls={false} dot={false} />
              <Line dataKey="ebitdaMargin" type="monotone" stroke="var(--color-ebitdaMargin)" connectNulls={false} dot={false} />
              <Line dataKey="ebitMargin" type="monotone" stroke="var(--color-ebitMargin)" connectNulls={false} dot={false} />
              <Line dataKey="netProfitMargin" type="monotone" stroke="var(--color-netProfitMargin)" connectNulls={false} dot={false} />
              <Line dataKey="roe" type="monotone" stroke="var(--color-roe)" connectNulls={false} dot={false} />
              <Line dataKey="roce" type="monotone" stroke="var(--color-roce)" connectNulls={false} dot={false} />
            </LineChart>
          </ChartContainer>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Leverage and liquidity · x</h3>
          <ChartContainer config={chartConfig} className="mt-3 h-[260px] w-full">
            <LineChart data={results} margin={{ left: 8, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={64} />
              <Tooltip formatter={(value) => fmt(Number(value), "x")} />
              <Legend />
              <Line dataKey="debtToEquity" type="monotone" stroke="var(--color-debtToEquity)" connectNulls={false} dot={false} />
              <Line dataKey="currentRatio" type="monotone" stroke="var(--color-currentRatio)" connectNulls={false} dot={false} />
            </LineChart>
          </ChartContainer>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1050px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Financial year</th>
              <th className="px-3 py-3 text-right font-medium">Revenue growth</th>
              <th className="px-3 py-3 text-right font-medium">EBITDA margin</th>
              <th className="px-3 py-3 text-right font-medium">EBIT margin</th>
              <th className="px-3 py-3 text-right font-medium">Net profit margin</th>
              <th className="px-3 py-3 text-right font-medium">Debt / equity</th>
              <th className="px-3 py-3 text-right font-medium">Current ratio</th>
              <th className="px-3 py-3 text-right font-medium">ROE</th>
              <th className="px-3 py-3 text-right font-medium">ROCE</th>
              <th className="px-4 py-3 text-right font-medium">Free cash flow</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {results.map((result) => (
              <tr key={result.year}>
                <td className="px-4 py-3 font-mono">FY{result.year}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(result.revenueGrowth)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(result.ebitdaMargin)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(result.ebitMargin)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(result.netProfitMargin)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(result.debtToEquity, "x")}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(result.currentRatio, "x")}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(result.roe)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(result.roce)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtAmount(result.freeCashFlow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          N/A means required inputs are missing or a ratio denominator is zero. Current assets and current liabilities are not stored in the current statement schema, so current ratio is unavailable here.
        </p>
      </Card>
    </div>
  );
}

function Pending({ title, need, detail }: { title: string; need: string; detail: string }) {
  return (
    <Card className="p-8">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
          <p className="mt-3 text-xs"><span className="text-muted-foreground">Requires:</span> <span className="font-medium">{need}</span></p>
          <p className="mt-1 inline-flex items-center gap-1 rounded-sm bg-warning/10 px-2 py-1 text-xs text-warning-foreground">
            <AlertTriangle className="h-3 w-3" /> Engine not yet implemented in this milestone
          </p>
        </div>
      </div>
    </Card>
  );
}

type Analysis = AnalysisRow;

function UploadPanel({ analysis }: { analysis: Analysis }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const extract = useServerFn(extractDocument);
  const importWorkbook = useServerFn(importExcelWorkbook);
  const docs = useQuery(documentsQuery(analysis.id));
  const years: number[] = [];
  for (let y = analysis.end_fy!; y >= analysis.start_fy!; y--) years.push(y);
  const [fy, setFy] = useState(String(years[0]));
  const [type, setType] = useState<string>("annual_report");
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX) throw new Error("File exceeds 25 MB");
      const extension = file.name.split(".").pop()?.toLowerCase();
      const isWorkbook = extension === "xlsx" || extension === "xls" || extension === "csv";
      const workbook = isWorkbook ? await readFinancialWorkbook(file) : null;
      const validation = workbook
        ? validateFinancialWorkbook(workbook, workbook.rows, analysis.units as Unit)
        : null;
      if (validation && !validation.financialYears) {
        const errors = validation.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message);
        throw new Error(errors.join(" ") || "The workbook could not be validated.");
      }

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${u.user.id}/${analysis.id}/${crypto.randomUUID()}-${safe}`;
      const { error: sErr } = await supabase.storage.from("financial-documents").upload(path, file, { contentType: file.type });
      if (sErr) throw sErr;
      const { data: document, error } = await supabase.from("uploaded_documents").insert({
        analysis_id: analysis.id,
        user_id: u.user.id,
        fiscal_year: validation?.financialYears
          ? Math.max(...validation.financialYears.map((year) => Number(year.year)))
          : Number(fy),
        statement_type: type as "annual_report",
        reporting_basis: analysis.reporting_basis,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      }).select("id").single();
      if (error) {
        const { error: cleanupError } = await supabase.storage.from("financial-documents").remove([path]);
        if (cleanupError) throw new Error(`${error.message}. Uploaded file cleanup failed: ${cleanupError.message}`);
        throw error;
      }

      if (validation?.financialYears && workbook) {
        try {
          await importWorkbook({
            data: {
              documentId: document.id,
              financialYears: validation.financialYears,
              declaredUnits: workbook.declaredUnits,
              missingColumns: workbook.missingColumns,
              duplicateColumns: workbook.duplicateColumns,
            },
          });
        } catch (importError) {
          const importMessage = importError instanceof Error ? importError.message : String(importError);
          const { error: metricCleanupError } = await supabase
            .from("extracted_financial_metrics")
            .delete()
            .eq("document_id", document.id);
          if (metricCleanupError) {
            throw new Error(`${importMessage}. Imported metric cleanup failed: ${metricCleanupError.message}`);
          }
          const { error: documentCleanupError } = await supabase
            .from("uploaded_documents")
            .delete()
            .eq("id", document.id);
          if (documentCleanupError) {
            throw new Error(`${importMessage}. Document cleanup failed: ${documentCleanupError.message}`);
          }
          const { error: storageCleanupError } = await supabase.storage.from("financial-documents").remove([path]);
          if (storageCleanupError) {
            throw new Error(`${importMessage}. File cleanup failed: ${storageCleanupError.message}`);
          }
          throw importError;
        }
        return {
          workbook: true,
          warnings: validation.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
        };
      }
      if (analysis.stage !== "documents_uploaded") {
        const { error: stageError } = await supabase.from("analyses").update({ stage: "documents_uploaded" }).eq("id", analysis.id);
        if (stageError) throw stageError;
      }
      return { workbook: false, warnings: [] };
    },
    onSuccess: async (result) => {
      if (result.workbook) {
        toast.success("Workbook imported. Review and approve the values on Data validation.");
        if (result.warnings.length) toast.warning(result.warnings.join(" "));
      } else {
        toast.success("Uploaded");
      }
      qc.invalidateQueries({ queryKey: ["documents", analysis.id] });
      qc.invalidateQueries({ queryKey: ["analysis", analysis.id] });
      qc.invalidateQueries({ queryKey: ["analyses"] });
      if (result.workbook) {
        await navigate({
          to: "/analyses/$id",
          params: { id: analysis.id },
          search: { tab: "validation" },
        });
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const extractM = useMutation({
    mutationFn: async () => {
      const pendingDocs = (docs.data ?? []).filter((document) => document.extraction_status !== "completed");
      if (!pendingDocs.length) throw new Error("All uploaded documents have already been extracted.");
      for (const document of pendingDocs) {
        const result = await extract({ data: { documentId: document.id } });
        if (!result.ok) throw new Error(result.error);
      }
    },
    onSuccess: () => {
      toast.success("Statement extraction completed");
      qc.invalidateQueries({ queryKey: ["documents", analysis.id] });
      qc.invalidateQueries({ queryKey: ["analysis", analysis.id] });
      qc.invalidateQueries({ queryKey: ["metrics", analysis.id] });
      qc.invalidateQueries({ queryKey: ["financial-analysis-data", analysis.id] });
    },
    onError: (error) => {
      toast.error((error as Error).message);
      qc.invalidateQueries({ queryKey: ["documents", analysis.id] });
      qc.invalidateQueries({ queryKey: ["metrics", analysis.id] });
    },
  });

  const remove = useMutation({
    mutationFn: async (d: { id: string; storage_path: string }) => {
      await supabase.storage.from("financial-documents").remove([d.storage_path]);
      const { error } = await supabase.from("uploaded_documents").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", analysis.id] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const covered = new Set(docs.data?.flatMap((d) =>
    d.detected_fiscal_years.length ? d.detected_fiscal_years : [d.fiscal_year],
  ));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="font-semibold">Upload financial statements</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload {analysis.reporting_basis} statements for each of the five years. Excel/CSV workbooks up to 10 MB; PDFs up to 25 MB. Files are private to your account.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className="mb-1.5 text-xs text-muted-foreground">Financial year</div>
            <Select value={fy} onValueChange={setFy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{fyLabel(y)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="w-56">
            <div className="mb-1.5 text-xs text-muted-foreground">Document type</div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATEMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
          <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Choose file
          </Button>
        </div>
        <div className="mt-5 grid grid-cols-5 gap-2">
          {years.map((y) => (
            <div key={y} className={`rounded-md border p-2 text-center ${covered.has(y) ? "border-success/40 bg-success/5" : "border-dashed"}`}>
              <div className="font-mono text-xs">FY{String(y).slice(2)}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{covered.has(y) ? "Uploaded" : "Missing"}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="border-b px-5 py-3 text-sm font-semibold">Documents</div>
        {docs.isLoading ? (
          <div className="p-5"><Skeleton className="h-10" /></div>
        ) : !docs.data?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground"><FileUp className="mx-auto mb-2 h-6 w-6" />No documents uploaded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-5 py-2 font-medium">FY</th><th className="px-2 py-2 font-medium">File</th><th className="px-2 py-2 font-medium">Type</th><th className="px-2 py-2 font-medium">Extraction</th><th /></tr>
            </thead>
            <tbody className="divide-y">
              {docs.data.map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-2.5 font-mono">{documentFiscalYearLabel(d)}</td>
                  <td className="max-w-[220px] truncate px-2 py-2.5">{d.file_name}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">{STATEMENT_TYPES.find((t) => t.value === d.statement_type)?.label}</td>
                  <td className="px-2 py-2.5">
                    <StatusPill status={d.extraction_status} />
                    {d.extraction_error && <p className="mt-1 max-w-xs text-[11px] text-warning-foreground">{d.extraction_error}</p>}
                  </td>
                  <td className="px-3 text-right">
                    <Button variant="ghost" size="icon" aria-label="Delete document" onClick={() => remove.mutate(d)}><Trash2 /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!!docs.data?.length && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
            <p className="text-xs text-muted-foreground">{covered.size} of {years.length} years covered.</p>
            {docs.data.some((document) => document.extraction_status !== "completed") && (
              <Button size="sm" variant="outline" onClick={() => extractM.mutate()} disabled={extractM.isPending}>
                {extractM.isPending && <Loader2 className="animate-spin" />}
                {extractM.isPending ? "Extracting…" : "Extract data"}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

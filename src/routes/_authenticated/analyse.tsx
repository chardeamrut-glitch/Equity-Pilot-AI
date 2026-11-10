import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Check, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { addCompany, createAnalysis, searchCompanies } from "@/lib/api.functions";
import { lastFiveFYs } from "@/lib/config";
import {
  FINANCIAL_YEAR_FIELDS,
  readFinancialWorkbook,
  validateFinancialWorkbook,
  type FinancialWorkbook,
  type FinancialYearDraft,
} from "@/lib/excel-import";
import { analyzeFinancials } from "@/lib/financial-analysis";
import type { Unit } from "@/lib/financial-metrics";

export const Route = createFileRoute("/_authenticated/analyse")({
  head: () => ({ meta: [{ title: "Analyse a company — EquityPilot AI" }, { name: "description", content: "Search NSE and BSE listed companies." }] }),
  component: Analyse,
});

type Company = Awaited<ReturnType<typeof searchCompanies>>[number];

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function Analyse() {
  const navigate = useNavigate();
  const search = useServerFn(searchCompanies);
  const create = useServerFn(createAnalysis);
  const add = useServerFn(addCompany);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const [selected, setSelected] = useState<Company | null>(null);
  const [basis, setBasis] = useState<"consolidated" | "standalone">("consolidated");
  const [units, setUnits] = useState<"crore" | "lakh" | "million" | "thousand" | "absolute">("crore");
  const fys = lastFiveFYs();
  const [showAdd, setShowAdd] = useState(false);
  const [newCo, setNewCo] = useState({ name: "", nseSymbol: "", bseCode: "", exchange: "NSE" as "NSE" | "BSE" | "BOTH" });
  
const [financialWorkbook, setFinancialWorkbook] = useState<FinancialWorkbook | null>(null);
const [financialRows, setFinancialRows] = useState<FinancialYearDraft[]>([]);
const [uploadingExcel, setUploadingExcel] = useState(false);
const [uploadedFileName, setUploadedFileName] = useState("");

const validation = useMemo(
  () => financialWorkbook
    ? validateFinancialWorkbook(financialWorkbook, financialRows, units as Unit)
    : null,
  [financialWorkbook, financialRows, units],
);
const financialResults = useMemo(
  () => validation?.financialYears
    ? analyzeFinancials(validation.financialYears)
    : [],
  [validation],
);
const validationErrors = validation?.issues.filter((issue) => issue.severity === "error") ?? [];

const handleExcelUpload = async (file?: File) => {
  if (!file) return;

  setUploadingExcel(true);
  setFinancialWorkbook(null);
  setFinancialRows([]);
  setUploadedFileName("");

  try {
    const imported = await readFinancialWorkbook(file);
    setFinancialWorkbook(imported);
    setFinancialRows(imported.rows);
    setUploadedFileName(file.name);
    toast.success("Excel workbook imported. Review the validation results.");
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : "Unable to analyse Excel file"
    );
  } finally {
    setUploadingExcel(false);
  }
};

const updateFinancialCell = (rowIndex: number, field: keyof FinancialYearDraft, value: string) => {
  setFinancialRows((current) =>
    current.map((row, index) => index === rowIndex ? { ...row, [field]: value } : row),
  );
};

  const results = useQuery({
    queryKey: ["company-search", dq],
    queryFn: () => search({ data: { query: dq } }),
    enabled: dq.length >= 2,
  });

  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          companyId: selected!.id,
          reportingBasis: basis,
          units,
          startFy: fys[4],
          endFy: fys[0],
          ...(validation?.financialYears && financialWorkbook
            ? {
                excelData: {
                  financialYears: validation.financialYears,
                  declaredUnits: financialWorkbook.declaredUnits,
                  duplicateColumns: financialWorkbook.duplicateColumns,
                },
              }
            : {}),
        },
      }),
    onSuccess: (r) =>
      navigate({
        to: "/analyses/$id",
        params: { id: r.id },
        search: validation?.financialYears ? { tab: "analysis" } : {},
      }),
    onError: (e) => toast.error((e as Error).message),
  });

  const addM = useMutation({
    mutationFn: () => add({ data: newCo }),
    onSuccess: async () => {
      toast.success("Company added to directory");
      setShowAdd(false);
      setQ(newCo.name);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Step 2 · 3" title="Analyse a company" desc="Search by company name, NSE symbol, BSE code or ISIN. Confirm the exchange and reporting entity before uploading statements." />

      <Card className="p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSelected(null); }} placeholder="e.g. Infosys, HDFCBANK, 500325" className="h-11 pl-9 text-base" />
        </div>

        <div className="mt-3">
          {dq.length < 2 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Type at least 2 characters.</p>
          ) : results.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>
          ) : results.error ? (
            <p className="py-6 text-center text-sm text-destructive">{(results.error as Error).message}</p>
          ) : results.data?.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No match in the directory.{" "}
              <button className="font-medium text-primary hover:underline" onClick={() => { setShowAdd(true); setNewCo((c) => ({ ...c, name: dq })); }}>Add it manually</button>
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {results.data?.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setSelected(c)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 ${selected?.id === c.id ? "bg-accent" : ""}`}>
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {c.nse_symbol && `NSE: ${c.nse_symbol}`} {c.bse_code && ` · BSE: ${c.bse_code}`} {c.isin && ` · ${c.isin}`}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.sector}</span>
                    {c.source === "user_added" && <span className="font-mono text-[10px] uppercase text-warning-foreground">user added</span>}
                    {selected?.id === c.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /> Company not listed?</button>
        )}
      </Card>

      {showAdd && (
        <Card className="mt-4 p-5">
          <h2 className="text-sm font-semibold">Add a listed company</h2>
          <p className="mt-1 text-xs text-muted-foreground">Enter identifiers exactly as shown on NSE/BSE. Entries are flagged as user-added.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2 space-y-1.5"><Label>Company name</Label><Input value={newCo.name} onChange={(e) => setNewCo({ ...newCo, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>NSE symbol</Label><Input value={newCo.nseSymbol} onChange={(e) => setNewCo({ ...newCo, nseSymbol: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>BSE code</Label><Input value={newCo.bseCode} onChange={(e) => setNewCo({ ...newCo, bseCode: e.target.value })} /></div>
          </div>
          <div className="mt-3 flex gap-2">
            <Select value={newCo.exchange} onValueChange={(v) => setNewCo({ ...newCo, exchange: v as "NSE" })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="NSE">NSE</SelectItem><SelectItem value="BSE">BSE</SelectItem><SelectItem value="BOTH">NSE & BSE</SelectItem></SelectContent>
            </Select>
            <Button onClick={() => addM.mutate()} disabled={addM.isPending || newCo.name.length < 2}>Add company</Button>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {selected && (
        <Card className="mt-4 p-5">
          <div className="eyebrow">Confirm reporting entity</div>
          <h2 className="mt-1 text-lg font-semibold">{selected.name}</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Exchange</dt><dd className="font-mono">{selected.exchange === "BOTH" ? "NSE & BSE" : selected.exchange}</dd></div>
            <div><dt className="text-xs text-muted-foreground">NSE symbol</dt><dd className="font-mono">{selected.nse_symbol ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">BSE code</dt><dd className="font-mono">{selected.bse_code ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">ISIN</dt><dd className="font-mono">{selected.isin ?? "—"}</dd></div>
          </dl>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Reporting basis</Label>
              <Select value={basis} onValueChange={(v) => setBasis(v as typeof basis)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="consolidated">Consolidated</SelectItem><SelectItem value="standalone">Standalone</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Units in statements</Label>
              <Select value={units} onValueChange={(v) => setUnits(v as typeof units)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["crore", "lakh", "million", "thousand", "absolute"].map((u) => <SelectItem key={u} value={u}>₹ {u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted px-3 font-mono text-sm">FY{fys[4]} – FY{fys[0]}</div>
            </div>
          </div>
          
<div className="mt-6 border-t pt-5">
  <h3 className="text-base font-semibold">
    Import five-year financial statements
  </h3>

  <p className="mt-1 text-sm text-muted-foreground">
    Upload a standardized Excel workbook to validate and review
    the figures before calculating financial ratios.
  </p>

  <div className="mt-4 rounded-lg border border-dashed p-5">
    <div className="flex flex-col gap-3">
      <Label htmlFor="financial-excel">
        Financial statements (.xlsx or .xls)
      </Label>

      <Input
        id="financial-excel"
        type="file"
        accept=".xlsx,.xls"
        disabled={uploadingExcel}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          void handleExcelUpload(file);
          e.currentTarget.value = "";
        }}
      />

      <p className="text-xs text-muted-foreground">
        Maximum file size: 10 MB. Use the standardized
        EquityPilot Excel column format. Empty values stay blank; they are never treated as zero.
      </p>
    </div>
  </div>

  {uploadingExcel && (
    <div className="mt-4 flex items-center gap-2 text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      Processing financial statements...
    </div>
  )}

  {uploadedFileName && (
    <div className="mt-4 rounded-md bg-muted p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Check className="h-4 w-4 text-green-600" />
        Excel imported: {uploadedFileName}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {financialRows.length} financial years · Reporting unit: ₹ {units}
      </p>
    </div>
  )}

  {validation && (
    <div className="mt-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={validationErrors.length ? "font-semibold text-destructive" : "font-semibold text-green-700"}>
          {validationErrors.length
            ? `${validationErrors.length} critical validation issue${validationErrors.length === 1 ? "" : "s"}`
            : "Critical validation checks passed"}
        </span>
        <span className="text-muted-foreground">
          {validation.issues.filter((issue) => issue.severity === "warning").length} warning(s)
        </span>
        {!validationErrors.length && (
          <span className="text-xs text-green-700">Financial analysis is available.</span>
        )}
      </div>
      {!!validation.issues.length && (
        <ul className="mt-3 space-y-1.5 text-xs">
          {validation.issues.map((issue, index) => (
            <li
              key={`${issue.rule_key}-${issue.rowIndex ?? "all"}-${issue.field ?? ""}-${index}`}
              className={issue.severity === "error" ? "text-destructive" : "text-muted-foreground"}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )}

  {financialWorkbook && (
    <div className="mt-5">
      <h3 className="text-sm font-semibold">Editable financial data preview</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Correct or fill the highlighted cells. Validation updates as you edit.
      </p>
      <div className="mt-3 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="bg-muted">
            <tr>
              {FINANCIAL_YEAR_FIELDS.map(({ key, label }) => (
                <th key={key} className="p-2 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {financialRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {FINANCIAL_YEAR_FIELDS.map(({ key, label }) => {
                  const issue = validation?.issues.find(
                    (item) => item.rowIndex === rowIndex && item.field === key && item.severity === "error",
                  );
                  return (
                    <td key={key} className="p-1">
                      <Input
                        type="text"
                        inputMode={key === "year" ? "text" : "decimal"}
                        aria-label={`Row ${rowIndex + 1} ${label}`}
                        aria-invalid={!!issue}
                        title={issue?.message}
                        value={row[key]}
                        onChange={(event) => updateFinancialCell(rowIndex, key, event.target.value)}
                        className={`h-8 min-w-24 text-xs ${issue ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )}

  {financialResults.length > 0 && (
    <div className="mt-5">
      <h3 className="text-sm font-semibold">
        Financial analysis preview
      </h3>

      <div className="mt-3 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Year</th>
              <th className="p-3">Revenue growth</th>
              <th className="p-3">EBITDA margin</th>
              <th className="p-3">EBIT margin</th>
              <th className="p-3">Net margin</th>
              <th className="p-3">ROE</th>
              <th className="p-3">ROCE</th>
              <th className="p-3">Debt/Equity</th>
              <th className="p-3">Free cash flow</th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {financialResults.map((item) => {
              const format = (value: number | null) =>
                value === null
                  ? "N/A"
                  : `${value.toFixed(2)}%`;

              return (
                <tr key={item.year}>
                  <td className="p-3 font-medium">
                    {item.year}
                  </td>
                  <td className="p-3">
                    {format(item.revenueGrowth)}
                  </td>
                  <td className="p-3">
                    {format(item.ebitdaMargin)}
                  </td>
                  <td className="p-3">
                    {format(item.ebitMargin)}
                  </td>
                  <td className="p-3">
                    {format(item.netProfitMargin)}
                  </td>
                  <td className="p-3">
                    {format(item.roe)}
                  </td>
                  <td className="p-3">
                    {format(item.roce)}
                  </td>
                  <td className="p-3">
                    {item.debtToEquity === null
                      ? "N/A"
                      : item.debtToEquity.toFixed(2) + "x"}
                  </td>
                  <td className="p-3">
                    {item.freeCashFlow === null
                      ? "N/A"
                      : item.freeCashFlow.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Financial figures use ₹ {units}.
        Percentages and ratios are calculated from the supplied data.
      </p>
    </div>
  )}
</div>

          <Button
            variant="navy"
            className="mt-5"
            onClick={() => createM.mutate()}
            disabled={createM.isPending || (!!financialWorkbook && !validation?.financialYears)}
          >
            {createM.isPending && <Loader2 className="animate-spin" />}
            {validation?.financialYears ? "Confirm & view financial analysis" : "Confirm & continue to upload"}
          </Button>
        </Card>
      )}
    </div>
  );
}

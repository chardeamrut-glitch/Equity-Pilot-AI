import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { METRICS, type Statement } from "@/lib/financial-metrics";
import { approveFinancialData, reviewMetric, validateFinancialData } from "@/lib/extraction.functions";
import type { ValidationIssue } from "@/lib/financial-validation";

type Row = {
  id: string; fiscal_year: number; metric_key: string; statement: string; raw_label: string | null;
  original_value: number | null; normalized_value: number | null; source_unit: string | null; confidence: number | null;
  page_ref: string | null; flags: string[]; review_status: string; is_user_corrected: boolean; document_id: string | null;
  uploaded_documents: { file_name: string } | null;
};

const FLAG_TEXT: Record<string, string> = {
  fuzzy_label: "Label matched approximately",
  unit_assumed: "Unit not stated in document — assumed analysis unit",
  basis_mismatch: "Document basis differs from analysis basis",
  duplicate_in_document: "Same line appears more than once in this document",
  negative_unexpected: "Negative value where positive expected",
  ai_extracted: "Read by AI from PDF text",
};

const fmt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

export function ReviewPanel({ analysis }: { analysis: { id: string; units: string; start_fy: number | null; end_fy: number | null; stage: string } }) {
  const qc = useQueryClient();
  const validate = useServerFn(validateFinancialData);
  const approve = useServerFn(approveFinancialData);
  const review = useServerFn(reviewMetric);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [open, setOpen] = useState<{ fy: number; key: string } | null>(null);

  const metrics = useQuery({
    queryKey: ["metrics", analysis.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extracted_financial_metrics")
        .select("id,fiscal_year,metric_key,statement,raw_label,original_value,normalized_value,source_unit,confidence,page_ref,flags,review_status,is_user_corrected,document_id,uploaded_documents(file_name)")
        .eq("analysis_id", analysis.id);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const years = useMemo(() => {
    const ys: number[] = [];
    for (let y = analysis.end_fy!; y >= analysis.start_fy!; y--) ys.push(y);
    return ys;
  }, [analysis.start_fy, analysis.end_fy]);

  const cells = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of metrics.data ?? []) m.set(`${r.fiscal_year}|${r.metric_key}`, [...(m.get(`${r.fiscal_year}|${r.metric_key}`) ?? []), r]);
    return m;
  }, [metrics.data]);

  const pending = metrics.data?.filter((r) => r.review_status === "needs_review").length ?? 0;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["metrics", analysis.id] });
    qc.invalidateQueries({ queryKey: ["analysis", analysis.id] });
    setIssues(null);
  };

  const validateM = useMutation({
    mutationFn: () => validate({ data: { analysisId: analysis.id } }),
    onSuccess: (r) => setIssues(r.issues),
    onError: (e) => toast.error((e as Error).message),
  });
  const approveM = useMutation({
    mutationFn: () => approve({ data: { analysisId: analysis.id } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.error);
      toast.success(`Approved ${r.years} financial years`);
      refresh();
      qc.invalidateQueries({ queryKey: ["analyses"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const reviewM = useMutation({
    mutationFn: (v: { id: string; action: "confirm" | "correct" | "reject" | "reset"; value?: number | null }) => review({ data: v }),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  if (metrics.isLoading) return <Card className="p-6"><Skeleton className="h-64" /></Card>;
  if (metrics.error) return <Card className="p-6 text-sm text-destructive">{(metrics.error as Error).message}</Card>;
  if (!metrics.data?.length)
    return <Card className="p-10 text-center text-sm text-muted-foreground">No extracted data yet. Upload statements and click <span className="font-medium text-foreground">Extract</span> on the Upload tab.</Card>;

  const errors = issues?.filter((i) => i.severity === "error" && !i.passed) ?? [];
  const warnings = issues?.filter((i) => i.severity === "warning" && !i.passed) ?? [];
  const passed = issues?.filter((i) => i.passed) ?? [];
  const approved = !["company_selected", "documents_uploaded", "extracted"].includes(analysis.stage);
  const openRows = open ? cells.get(`${open.fy}|${open.key}`) ?? [] : [];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <span className="font-medium">{metrics.data.length}</span> values extracted ·{" "}
          <span className={pending ? "font-medium text-warning-foreground" : "text-success"}>{pending} need review</span> · all figures in ₹ {analysis.units} (EPS in ₹)
          {approved && <span className="ml-2 inline-flex items-center gap-1 text-success"><ShieldCheck className="h-4 w-4" /> Approved</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => validateM.mutate()} disabled={validateM.isPending}>
            {validateM.isPending && <Loader2 className="animate-spin" />} Run validation
          </Button>
          <Button variant="navy" size="sm" onClick={() => approveM.mutate()} disabled={approveM.isPending || pending > 0}
            title={pending ? "Review all highlighted values first" : undefined}>
            {approveM.isPending && <Loader2 className="animate-spin" />} Approve data
          </Button>
        </div>
      </Card>

      {issues && (
        <Card className="p-4">
          <div className="mb-2 flex gap-4 text-xs">
            <span className="text-destructive">{errors.length} errors</span>
            <span className="text-warning-foreground">{warnings.length} warnings</span>
            <span className="text-success">{passed.length} checks passed</span>
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {[...errors, ...warnings, ...passed].map((i, n) => (
              <li key={n} className="flex items-start gap-2">
                {i.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : i.severity === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
                <span><span className="font-mono text-xs text-muted-foreground">{i.fiscal_year ? `FY${String(i.fiscal_year).slice(2)} ` : ""}</span>{i.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-0">
        <Tabs defaultValue="income_statement">
          <div className="border-b px-4 pt-3">
            <TabsList>
              <TabsTrigger value="income_statement">Profit & loss</TabsTrigger>
              <TabsTrigger value="balance_sheet">Balance sheet</TabsTrigger>
              <TabsTrigger value="cash_flow">Cash flow</TabsTrigger>
            </TabsList>
          </div>
          {(["income_statement", "balance_sheet", "cash_flow"] as Statement[]).map((st) => (
            <TabsContent key={st} value={st} className="m-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Line item</th>
                    {years.map((y) => <th key={y} className="px-3 py-2 text-right font-mono font-medium">FY{String(y).slice(2)}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {METRICS.filter((d) => d.statement === st).map((d) => (
                    <tr key={d.key}>
                      <td className="px-4 py-1.5 text-foreground">{d.label}{d.core && <span className="ml-1 text-primary">*</span>}</td>
                      {years.map((y) => {
                        const list = (cells.get(`${y}|${d.key}`) ?? []).filter((r) => r.review_status !== "rejected");
                        const all = cells.get(`${y}|${d.key}`) ?? [];
                        const vals = [...new Set(list.map((r) => Number(r.normalized_value).toFixed(2)))];
                        const conflict = vals.length > 1;
                        const needs = list.some((r) => r.review_status === "needs_review");
                        const corrected = list.some((r) => r.review_status === "corrected");
                        const shown = list.find((r) => r.review_status === "corrected" || r.review_status === "confirmed") ?? list[0];
                        const tone = conflict ? "bg-destructive/10 text-destructive" : needs ? "bg-warning/15" : corrected ? "bg-accent text-accent-foreground" : "";
                        return (
                          <td key={y} className="p-0 text-right">
                            <button
                              className={`w-full px-3 py-1.5 text-right font-mono tabular-nums hover:ring-1 hover:ring-primary ${tone} ${!all.length ? "text-muted-foreground/50" : ""}`}
                              onClick={() => all.length && setOpen({ fy: y, key: d.key })}
                              aria-label={`${d.label} FY${y}`}
                            >
                              {shown ? fmt(shown.normalized_value) : "—"}
                              {conflict && " ⚠"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>
          ))}
        </Tabs>
        <div className="flex flex-wrap gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          <span><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-warning/30 align-middle" />Needs review</span>
          <span><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-destructive/20 align-middle" />Conflicting sources</span>
          <span><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-accent align-middle" />Corrected by you</span>
          <span>Click any value to see its source, confirm, correct or reject it.</span>
        </div>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{open && `${METRICS.find((d) => d.key === open.key)?.label} · FY${open.fy}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {openRows.map((r) => <CandidateRow key={r.id} r={r} units={analysis.units} busy={reviewM.isPending} onAction={(action, value) => reviewM.mutate({ id: r.id, action, value })} />)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CandidateRow({ r, units, busy, onAction }: { r: Row; units: string; busy: boolean; onAction: (a: "confirm" | "correct" | "reject" | "reset", v?: number | null) => void }) {
  const [val, setVal] = useState(r.normalized_value == null ? "" : String(r.normalized_value));
  const conf = r.confidence == null ? null : Math.round(Number(r.confidence) * 100);
  return (
    <div className={`rounded-md border p-3 ${r.review_status === "rejected" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{r.uploaded_documents?.file_name ?? "Unknown source"} {r.page_ref && <span className="font-mono text-muted-foreground">· {r.page_ref}</span>}</span>
        <span className="font-mono uppercase tracking-wider text-muted-foreground">{r.review_status.replace("_", " ")}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Label in document</dt><dd>{r.raw_label}</dd></div>
        <div><dt className="text-muted-foreground">As printed</dt><dd className="font-mono">{fmt(r.original_value)} {r.source_unit !== "absolute" ? r.source_unit : ""}</dd></div>
        <div><dt className="text-muted-foreground">Confidence</dt><dd className={`font-mono ${conf != null && conf < 90 ? "text-warning-foreground" : ""}`}>{conf ?? "—"}%</dd></div>
        <div><dt className="text-muted-foreground">Value (₹ {units})</dt><dd className="font-mono">{fmt(r.normalized_value)}</dd></div>
      </dl>
      {r.flags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {r.flags.map((f) => <li key={f} className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{FLAG_TEXT[f] ?? f}</li>)}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input value={val} onChange={(e) => setVal(e.target.value)} className="h-8 w-40 font-mono" inputMode="decimal" aria-label="Corrected value" />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => {
          const n = Number(val.replace(/,/g, ""));
          if (!val.trim() || !Number.isFinite(n)) return toast.error("Enter a number");
          onAction("correct", n);
        }}>Save correction</Button>
        <Button size="sm" disabled={busy || r.review_status === "confirmed"} onClick={() => onAction("confirm")}>Confirm</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction("reject")}>Reject</Button>
        {(r.is_user_corrected || r.review_status === "rejected") && <Button size="sm" variant="link" onClick={() => onAction("reset")}>Reset to extracted</Button>}
      </div>
    </div>
  );
}

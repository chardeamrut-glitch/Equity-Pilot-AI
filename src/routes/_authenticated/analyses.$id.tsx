import { pageMeta } from "@/lib/page-meta";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, FileUp, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill } from "@/components/brand";
import { ReviewPanel } from "@/components/review-panel";
import { extractDocument } from "@/lib/extraction.functions";
import { analysisQuery, documentsQuery, type AnalysisRow } from "@/lib/queries";
import { STAGES, STATEMENT_TYPES, fyLabel, stageIndex } from "@/lib/config";

export const Route = createFileRoute("/_authenticated/analyses/$id")({
  head: () => pageMeta("Analysis workspace", "Upload statements and track analysis progress."),
  component: AnalysisPage,
});

const ACCEPT = ".pdf,.xlsx,.xls,.csv";
const MAX = 25 * 1024 * 1024;

function AnalysisPage() {
  const { id } = Route.useParams();
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

      <div className="grid min-w-0 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
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

        <Tabs defaultValue="upload" className="min-w-0">
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
          <TabsContent value="analysis"><Pending title="Financial analysis" need="Validated data" detail="Growth, profitability, efficiency, liquidity, leverage and return ratios over five years, computed deterministically from your validated figures." /></TabsContent>
          <TabsContent value="valuation"><Pending title="Valuation dashboard" need="Financial analysis + a verified market price source" detail="DCF and relative valuation with editable assumptions. Current market prices are never invented — a market-data source must be configured or you enter the price with its source." /></TabsContent>
          <TabsContent value="thesis"><Pending title="Investment thesis" need="Valuation" detail="AI-written thesis, risks and recommendation, clearly separated from the calculated numbers." /></TabsContent>
          <TabsContent value="assistant"><Pending title="AI research assistant" need="Extracted data" detail="Ask questions about this company's statements. Answers cite the uploaded document they came from." /></TabsContent>
          <TabsContent value="deck"><Pending title="10-slide pitch deck" need="Investment thesis" detail="Editable PowerPoint, Excel model and PDF report generated in the background." /></TabsContent>
        </Tabs>
      </div>
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
  const extract = useServerFn(extractDocument);
  const docs = useQuery(documentsQuery(analysis.id));
  const years: number[] = [];
  for (let y = analysis.end_fy ?? 0; y >= (analysis.start_fy ?? 1); y--) years.push(y);
  const [fy, setFy] = useState(String(years[0]));
  const [type, setType] = useState<string>("annual_report");
  const fileRef = useRef<HTMLInputElement>(null);

  const extraction = useMutation({
    mutationFn: async (documentId: string) => {
      const result = await extract({ data: { documentId } });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => toast.success(`Extracted ${result.count} values · ${result.needsReview} need review`),
    onError: (error) => toast.error(error.message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["documents", analysis.id] });
      qc.invalidateQueries({ queryKey: ["metrics", analysis.id] });
      qc.invalidateQueries({ queryKey: ["analysis", analysis.id] });
      qc.invalidateQueries({ queryKey: ["analyses"] });
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX) throw new Error("File exceeds 25 MB");
      if (!/\.(pdf|xlsx|xls|csv)$/i.test(file.name)) throw new Error("Upload a PDF, Excel or CSV file");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${u.user.id}/${analysis.id}/${crypto.randomUUID()}-${safe}`;
      const { error: sErr } = await supabase.storage.from("financial-documents").upload(path, file, { contentType: file.type });
      if (sErr) throw sErr;
      const { error } = await supabase.from("uploaded_documents").insert({
        analysis_id: analysis.id,
        user_id: u.user.id,
        fiscal_year: Number(fy),
        statement_type: type as "annual_report",
        reporting_basis: analysis.reporting_basis,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (error) {
        await supabase.storage.from("financial-documents").remove([path]);
        throw error;
      }
      if (analysis.stage === "company_selected") {
        await supabase.from("analyses").update({ stage: "documents_uploaded" }).eq("id", analysis.id);
      }
    },
    onSuccess: () => {
      toast.success("Uploaded");
      qc.invalidateQueries({ queryKey: ["documents", analysis.id] });
      qc.invalidateQueries({ queryKey: ["analysis", analysis.id] });
      qc.invalidateQueries({ queryKey: ["analyses"] });
    },
    onError: (e) => toast.error((e as Error).message),
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

  const covered = new Set(docs.data?.map((d) => d.fiscal_year));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="font-semibold">Upload financial statements</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload {analysis.reporting_basis} statements for each of the five years. PDF, Excel or CSV, up to 25 MB. Files are private to your account.
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
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-5 py-2 font-medium">FY</th><th className="px-2 py-2 font-medium">File</th><th className="px-2 py-2 font-medium">Type</th><th className="px-2 py-2 font-medium">Extraction</th><th /></tr>
            </thead>
            <tbody className="divide-y">
              {docs.data.map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-2.5 font-mono">FY{String(d.fiscal_year).slice(2)}</td>
                  <td className="max-w-[220px] truncate px-2 py-2.5">{d.file_name}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">{STATEMENT_TYPES.find((t) => t.value === d.statement_type)?.label}</td>
                   <td className="px-2 py-2.5">
                     <StatusPill status={extraction.isPending && extraction.variables === d.id ? "processing" : d.extraction_status} />
                     {d.extraction_error && <p className="mt-1 max-w-64 text-xs text-destructive">{d.extraction_error}</p>}
                     {d.extraction_status === "completed" && <p className="mt-1 text-xs text-muted-foreground">{[d.detected_currency, d.detected_units, d.detected_basis].filter(Boolean).join(" · ")}</p>}
                   </td>
                  <td className="px-3 text-right">
                     <div className="flex items-center justify-end gap-1">
                       <Button variant="outline" size="sm" disabled={extraction.isPending || remove.isPending} onClick={() => extraction.mutate(d.id)}>
                         {extraction.isPending && extraction.variables === d.id ? <Loader2 className="animate-spin" /> : <FileUp />}
                         {d.extraction_status === "completed" ? "Re-extract" : d.extraction_status === "failed" ? "Retry extraction" : "Extract"}
                       </Button>
                       <Button variant="ghost" size="icon" aria-label="Delete document" disabled={extraction.isPending || remove.isPending} onClick={() => remove.mutate(d)}><Trash2 /></Button>
                     </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {!!docs.data?.length && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
            <p className="text-xs text-muted-foreground">{covered.size} of {years.length} years covered.</p>
            <p className="text-xs text-muted-foreground">{docs.data.filter((d) => d.extraction_status === "completed").length} documents extracted</p>
          </div>
        )}
      </Card>
    </div>
  );
}

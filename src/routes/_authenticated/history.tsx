import { pageMeta } from "@/lib/page-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/brand";
import { PageHeader } from "@/components/page-header";
import { analysesQuery } from "@/lib/queries";
import { STAGES, stageIndex } from "@/lib/config";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => pageMeta("Analysis history", "All your company analyses."),
  component: History,
});

function History() {
  const { data, isLoading, error } = useQuery(analysesQuery());
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Archive" title="Analysis history" />
      <Card className="overflow-x-auto">
        {isLoading ? (
          <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : error ? (
          <p className="p-5 text-sm text-destructive">{(error as Error).message}</p>
        ) : !data?.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No analyses yet. <Button asChild variant="link" className="px-1"><Link to="/analyse">Start one</Link></Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-5 py-2 font-medium">Company</th><th className="px-2 font-medium">Symbol</th><th className="px-2 font-medium">Basis</th><th className="px-2 font-medium">Period</th><th className="px-2 font-medium">Stage</th><th className="px-2 font-medium">Status</th><th className="px-5 font-medium text-right">Updated</th></tr>
            </thead>
            <tbody className="divide-y">
              {data.map((a) => (
                <tr key={a.id} className="hover:bg-muted/50">
                  <td className="px-5 py-2.5"><Link to="/analyses/$id" params={{ id: a.id }} className="font-medium hover:text-primary">{a.companies?.name}</Link></td>
                  <td className="px-2 font-mono text-xs">{a.companies?.nse_symbol ?? a.companies?.bse_code}</td>
                  <td className="px-2 capitalize">{a.reporting_basis}</td>
                  <td className="px-2 font-mono text-xs">FY{a.start_fy}–{a.end_fy}</td>
                  <td className="px-2">{STAGES[stageIndex(a.stage)]?.label}</td>
                  <td className="px-2"><StatusPill status={a.status} /></td>
                  <td className="px-5 text-right font-mono text-xs text-muted-foreground">{new Date(a.updated_at).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoBadge, StatusPill } from "@/components/brand";
import { PageHeader } from "./route";
import { analysesQuery } from "@/lib/queries";
import { STAGES, stageIndex } from "@/lib/config";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — EquityPilot AI" }, { name: "description", content: "Your equity research workspace." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data, isLoading, error } = useQuery(analysesQuery());
  const total = data?.length ?? 0;
  const inProgress = data?.filter((a) => a.stage !== "deck_generated").length ?? 0;
  const done = total - inProgress;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Workspace"
        title={`Welcome${user.user_metadata?.full_name ? ", " + String(user.user_metadata.full_name).split(" ")[0] : ""}`}
        desc="Start a new company analysis or continue where you left off."
        action={<Button asChild variant="navy"><Link to="/analyse"><Plus /> New analysis</Link></Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[["Total analyses", total], ["In progress", inProgress], ["Completed decks", done]].map(([l, v]) => (
          <Card key={l} className="p-5">
            <div className="eyebrow">{l}</div>
            <div className="mt-2 font-mono text-3xl font-medium">{isLoading ? "—" : v}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Recent analyses</h2>
          <Link to="/history" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : error ? (
          <p className="p-5 text-sm text-destructive">Could not load analyses: {(error as Error).message}</p>
        ) : total === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No analyses yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Search for an NSE or BSE company to begin.</p>
            <Button asChild className="mt-4" size="sm"><Link to="/analyse">Analyse a company</Link></Button>
          </div>
        ) : (
          <ul className="divide-y">
            {data!.slice(0, 6).map((a) => {
              const idx = stageIndex(a.stage);
              return (
                <li key={a.id}>
                  <Link to="/analyses/$id" params={{ id: a.id }} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/60">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.companies?.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {a.companies?.nse_symbol ?? a.companies?.bse_code} · {a.reporting_basis} · FY{a.start_fy}–FY{a.end_fy}
                      </div>
                    </div>
                    <div className="hidden w-48 sm:block">
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${((idx + 1) / STAGES.length) * 100}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{STAGES[idx]?.label}</div>
                    </div>
                    <StatusPill status={a.status} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">What an analysis produces</h2>
          <DemoBadge label="Illustrative" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Example layout only — e.g. for a company like Asian Paints. No figures are shown until you upload real statements.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {["Ratio analysis (5Y)", "DCF & relative valuation", "Investment thesis", "10-slide pitch deck"].map((x) => (
            <div key={x} className="rounded-md border border-dashed bg-muted/50 p-4 text-sm text-muted-foreground">{x}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}

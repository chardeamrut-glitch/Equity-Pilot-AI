import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Download reports — EquityPilot AI" }, { name: "description", content: "Download pitch decks, Excel models and PDF reports." }] }),
  component: Reports,
});

function Reports() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Outputs" title="Download reports" desc="Generated files appear here once an analysis reaches the pitch-deck stage." />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Presentation, t: "10-slide pitch deck", f: ".pptx (editable)" },
          { icon: FileSpreadsheet, t: "Financial model", f: ".xlsx" },
          { icon: FileText, t: "Research report", f: ".pdf" },
        ].map((r) => (
          <Card key={r.t} className="p-5">
            <r.icon className="h-5 w-5 text-primary" />
            <div className="mt-3 font-medium">{r.t}</div>
            <div className="font-mono text-xs text-muted-foreground">{r.f}</div>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-10 text-center text-sm text-muted-foreground">
        No reports generated yet. Report generation is planned for a later milestone.
      </Card>
    </div>
  );
}

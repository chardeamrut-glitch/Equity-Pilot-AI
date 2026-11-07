import { Link } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/config";

export function Logo({ to = "/" }: { to?: "/" | "/dashboard" }) {
  return (
    <Link to={to} className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-sm bg-navy font-mono text-xs font-semibold text-navy-foreground">
        EP
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">{APP_NAME}</span>
    </Link>
  );
}

export function DemoBadge({ label = "Demo data" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-warning/50 bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-warning-foreground">
      {label}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-success/10 text-success border-success/30",
    processing: "bg-accent text-accent-foreground border-primary/20",
    pending: "bg-muted text-muted-foreground border-border",
    failed: "bg-destructive/10 text-destructive border-destructive/30",
    not_configured: "bg-warning/10 text-warning-foreground border-warning/40",
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${map[status] ?? map.pending}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

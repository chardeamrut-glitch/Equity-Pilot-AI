// Deterministic validation of extracted figures. All values must be in the same unit.
import { METRICS } from "./financial-metrics";

export interface MetricValue {
  id?: string;
  fiscal_year: number;
  metric_key: string;
  value: number | null;
  document_id?: string | null;
  review_status?: string;
}

export interface ValidationIssue {
  rule_key: string;
  severity: "info" | "warning" | "error";
  fiscal_year: number | null;
  message: string;
  passed: boolean;
  metric_keys?: string[];
}

export const BS_TOLERANCE = 0.005; // 0.5%
export const CASH_TOLERANCE = 0.01; // 1%
export const DUPLICATE_TOLERANCE = 0.005;

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1) * tol;
const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Picks one value per (year, metric) ignoring rejected rows and reports conflicting duplicates. */
export function consolidate(values: MetricValue[]) {
  const groups = new Map<string, MetricValue[]>();
  for (const v of values) {
    if (v.review_status === "rejected" || v.value == null) continue;
    const k = `${v.fiscal_year}|${v.metric_key}`;
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  const chosen = new Map<string, number>();
  const conflicts: { fiscal_year: number; metric_key: string; values: number[] }[] = [];
  for (const [k, list] of groups) {
    const [fy, key] = k.split("|");
    const first = list[0]!.value!;
    if (list.some((x) => !close(x.value!, first, DUPLICATE_TOLERANCE))) {
      conflicts.push({ fiscal_year: Number(fy), metric_key: key!, values: list.map((x) => x.value!) });
    }
    // Prefer user-corrected / confirmed values.
    const pref = list.find((x) => x.review_status === "corrected" || x.review_status === "confirmed") ?? list[0]!;
    chosen.set(k, pref.value!);
  }
  return { chosen, conflicts };
}

export function validateFinancials(values: MetricValue[], years: number[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { chosen, conflicts } = consolidate(values);
  const get = (fy: number, k: string) => chosen.get(`${fy}|${k}`);

  for (const c of conflicts) {
    issues.push({ rule_key: "duplicate_conflict", severity: "error", fiscal_year: c.fiscal_year, passed: false, metric_keys: [c.metric_key],
      message: `${c.metric_key} has conflicting values across documents: ${c.values.map(fmt).join(" vs ")}. Correct or reject one.` });
  }

  for (const fy of years) {
    const missing = METRICS.filter((d) => d.core && get(fy, d.key) == null).map((d) => d.label);
    if (missing.length) {
      issues.push({ rule_key: "missing_core", severity: "warning", fiscal_year: fy, passed: false, message: `Missing: ${missing.join(", ")}` });
    }

    // Balance sheet reconciliation
    const ta = get(fy, "total_assets");
    const tel = get(fy, "total_equity_and_liabilities");
    const te = get(fy, "total_equity");
    const tl = get(fy, "total_liabilities");
    const mi = get(fy, "minority_interest") ?? 0;
    if (ta != null && (tel != null || (te != null && tl != null))) {
      const rhs = tel ?? te! + tl! + mi;
      const ok = close(ta, rhs, BS_TOLERANCE);
      issues.push({ rule_key: "balance_sheet_balances", severity: ok ? "info" : "error", fiscal_year: fy, passed: ok, metric_keys: ["total_assets", tel != null ? "total_equity_and_liabilities" : "total_liabilities"],
        message: ok ? `Total assets reconcile with equity + liabilities (${fmt(ta)}).` : `Total assets ${fmt(ta)} ≠ equity + liabilities ${fmt(rhs)} (diff ${fmt(ta - rhs)}).` });
    } else if (ta != null || te != null) {
      issues.push({ rule_key: "balance_sheet_balances", severity: "warning", fiscal_year: fy, passed: false, message: "Balance sheet totals incomplete — cannot reconcile." });
    }

    // Cash flow: opening + net change = closing
    const net = get(fy, "net_change_in_cash");
    const open = get(fy, "opening_cash") ?? get(fy - 1, "closing_cash");
    const closeC = get(fy, "closing_cash");
    if (net != null && open != null && closeC != null) {
      const ok = close(open + net, closeC, CASH_TOLERANCE);
      issues.push({ rule_key: "cash_roll_forward", severity: ok ? "info" : "error", fiscal_year: fy, passed: ok, metric_keys: ["opening_cash", "net_change_in_cash", "closing_cash"],
        message: ok ? "Opening cash + net change reconciles to closing cash." : `Opening ${fmt(open)} + net change ${fmt(net)} = ${fmt(open + net)}, but closing cash is ${fmt(closeC)}.` });
    }
    // Net change ≈ CFO + CFI + CFF
    const cfo = get(fy, "cash_from_operations"), cfi = get(fy, "cash_from_investing"), cff = get(fy, "cash_from_financing");
    if (net != null && cfo != null && cfi != null && cff != null) {
      const sum = cfo + cfi + cff;
      const ok = close(sum, net, CASH_TOLERANCE) || Math.abs(sum - net) <= Math.max(Math.abs(cfo), 1) * 0.01;
      issues.push({ rule_key: "cash_flow_sum", severity: ok ? "info" : "warning", fiscal_year: fy, passed: ok, metric_keys: ["net_change_in_cash"],
        message: ok ? "Operating + investing + financing equals net change in cash." : `CFO+CFI+CFF = ${fmt(sum)} vs net change ${fmt(net)} (may include FX effects).` });
    }
    // Closing cash vs balance sheet cash
    const bsCash = get(fy, "cash_and_equivalents");
    if (closeC != null && bsCash != null && !close(closeC, bsCash, CASH_TOLERANCE)) {
      issues.push({ rule_key: "cash_vs_balance_sheet", severity: "warning", fiscal_year: fy, passed: false, metric_keys: ["closing_cash", "cash_and_equivalents"],
        message: `Cash flow closing cash ${fmt(closeC)} differs from balance sheet cash ${fmt(bsCash)} (overdrafts or bank balances may explain it).` });
    }
    // P&L arithmetic: PBT - tax ≈ net profit
    const pbt = get(fy, "profit_before_tax"), tax = get(fy, "tax_expense"), np = get(fy, "net_profit");
    if (pbt != null && tax != null && np != null) {
      const ok = close(pbt - tax, np, 0.01);
      if (!ok) issues.push({ rule_key: "pnl_arithmetic", severity: "warning", fiscal_year: fy, passed: false, metric_keys: ["profit_before_tax", "tax_expense", "net_profit"],
        message: `PBT ${fmt(pbt)} − tax ${fmt(tax)} = ${fmt(pbt - tax)}, but profit for the year is ${fmt(np)} (check associates/discontinued ops).` });
    }
  }
  return issues;
}

/** Review status for a freshly extracted value: never auto-approve uncertain values. */
export function initialReviewStatus(confidence: number, flags: string[]) {
  return confidence >= 0.9 && flags.length === 0 ? "high_confidence" : "needs_review";
}

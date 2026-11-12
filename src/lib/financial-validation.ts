// Deterministic validation of extracted figures. All values must be in the same unit.
import { METRICS, type Statement } from "./financial-metrics";

export interface MetricValue {
  id?: string;
  fiscal_year: number;
  metric_key: string;
  value: number | null;
  document_id?: string | null;
  statement?: Statement | null;
  page_ref?: string | null;
  review_status?: string;
  source_unit?: string | null;
  currency?: string | null | undefined;
  reporting_basis?: string | null | undefined;
  source_report_fiscal_year?: number | null;
  source_report_date?: string | null;
  flags?: string[];
}

export interface ValidationIssue {
  rule_key: string;
  severity: "info" | "warning" | "error";
  fiscal_year: number | null;
  message: string;
  passed: boolean;
  metric_keys?: string[];
}

export function approvalBlockers(issues: ValidationIssue[]) {
  return issues.filter((issue) =>
    !issue.passed && (issue.severity === "error" || issue.rule_key === "missing_core"),
  );
}

export const BS_TOLERANCE = 0.005; // 0.5%
export const CASH_TOLERANCE = 0.01; // 1%

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b), 1) * tol;
const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export interface CandidateConflict {
  fiscal_year: number;
  metric_key: string;
  values: number[];
  reason: string;
  rule_key: "duplicate_conflict" | "source_context_mismatch";
}

const isEligibleCandidate = (value: MetricValue) =>
  value.value != null &&
  ["high_confidence", "confirmed", "corrected"].includes(value.review_status ?? "");

/** Uses the same eligibility and conflict policy for validation and review displays. */
export function selectFinancialCandidate(values: MetricValue[]) {
  const eligible = values.filter(isEligibleCandidate);
  if (!eligible.length) return { candidate: null, conflict: null };
  if (eligible.length === 1) return { candidate: eligible[0]!, conflict: null };

  const first = eligible[0]!;
  const contextFields = [
    "fiscal_year",
    "metric_key",
    "statement",
    "reporting_basis",
    "currency",
    "source_unit",
    "source_report_fiscal_year",
    "source_report_date",
  ] as const;
  const contextIsComplete = eligible.every((value) =>
    contextFields.every((field) => value[field] != null && value[field] !== ""),
  );
  const sameContext = contextIsComplete && eligible.every((value) =>
    contextFields.every((field) => value[field] === first[field]),
  );

  if (!sameContext) {
    return {
      candidate: null,
      conflict: {
        fiscal_year: first.fiscal_year,
        metric_key: first.metric_key,
        values: [],
        reason: "fiscal years, metrics, statement types, reporting bases, currencies, source units, or source report fiscal years/dates differ or are unknown; values were not compared",
        rule_key: "source_context_mismatch" as const,
      },
    };
  }

  const valuesDiffer = eligible.some((value) => value.value !== first.value);
  if (valuesDiffer) {
    const isComparativeOverlap = eligible.some((value) =>
      value.source_report_fiscal_year != null &&
      value.source_report_fiscal_year !== value.fiscal_year,
    );
    return {
      candidate: null,
      conflict: {
        fiscal_year: first.fiscal_year,
        metric_key: first.metric_key,
        values: eligible.map((value) => value.value!),
        reason: isComparativeOverlap
          ? "overlapping annual reports contain different comparative values"
          : "values differ across source documents",
        rule_key: "duplicate_conflict" as const,
      },
    };
  }

  return { candidate: first, conflict: null };
}

/** Selects a value only when eligible candidates agree in a complete source context. */
export function consolidate(values: MetricValue[]) {
  const groups = new Map<string, MetricValue[]>();
  for (const v of values) {
    const k = `${v.fiscal_year}|${v.metric_key}`;
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  const chosen = new Map<string, number>();
  const conflicts: CandidateConflict[] = [];
  for (const [k, allValues] of groups) {
    const { candidate, conflict } = selectFinancialCandidate(allValues);
    if (conflict) conflicts.push(conflict);
    if (candidate?.value != null) chosen.set(k, candidate.value);
  }
  return { chosen, conflicts };
}

export interface ValidationResultInsert {
  analysis_id: string;
  fiscal_year: number | null;
  rule_key: string;
  severity: ValidationIssue["severity"];
  message: string;
  passed: boolean;
}

/** Appends a validation run; the insert-only callback cannot remove prior results. */
export async function appendValidationResults(
  analysisId: string,
  issues: ValidationIssue[],
  insert: (rows: ValidationResultInsert[]) => PromiseLike<{ error: { message: string } | null }>,
) {
  if (!issues.length) return;
  const { error } = await insert(issues.map((issue) => ({
    analysis_id: analysisId,
    fiscal_year: issue.fiscal_year,
    rule_key: issue.rule_key,
    severity: issue.severity,
    message: issue.message,
    passed: issue.passed,
  })));
  if (error) throw new Error(`Could not save validation results: ${error.message}`);
}

export function validateFinancials(values: MetricValue[], years: number[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { chosen, conflicts } = consolidate(values);
  const get = (fy: number, k: string) => chosen.get(`${fy}|${k}`);

  for (const c of conflicts) {
    const message = c.rule_key === "source_context_mismatch"
      ? `${c.metric_key} has values from different or unknown comparison contexts (${c.reason}). The figures were not compared; review the source reports and retain compatible records.`
      : `${c.metric_key} has conflicting values across documents (${c.reason}): ${c.values.map(fmt).join(" vs ")}. Review the source reports and reject or correct the appropriate value.`;
    issues.push({ rule_key: c.rule_key, severity: "error", fiscal_year: c.fiscal_year, passed: false, metric_keys: [c.metric_key], message });
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
    const mi = get(fy, "minority_interest");
    if (ta != null && (tel != null || (te != null && tl != null))) {
      if (tel == null && mi == null) {
        issues.push({ rule_key: "balance_sheet_balances", severity: "warning", fiscal_year: fy, passed: false,
          message: "Balance sheet totals incomplete — cannot reconcile because minority interest is missing." });
      } else {
        const rhs = tel ?? te! + tl! + mi!;
        const ok = close(ta, rhs, BS_TOLERANCE);
        issues.push({ rule_key: "balance_sheet_balances", severity: ok ? "info" : "error", fiscal_year: fy, passed: ok, metric_keys: ["total_assets", tel != null ? "total_equity_and_liabilities" : "total_liabilities"],
          message: ok ? `Total assets reconcile with equity + liabilities (${fmt(ta)}).` : `Total assets ${fmt(ta)} ≠ equity + liabilities ${fmt(rhs)} (diff ${fmt(ta - rhs)}).` });
      }
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
    } else {
      const missingInputs = [
        open == null ? "opening cash (or prior-year closing cash)" : null,
        net == null ? "net change in cash" : null,
        closeC == null ? "closing cash" : null,
      ].filter((input): input is string => input != null);
      issues.push({ rule_key: "cash_roll_forward", severity: "warning", fiscal_year: fy, passed: false, metric_keys: ["opening_cash", "net_change_in_cash", "closing_cash"],
        message: `Cash roll-forward cannot be checked; missing ${missingInputs.join(", ")}.` });
    }
    // Net change ≈ CFO + CFI + CFF
    const cfo = get(fy, "cash_from_operations"), cfi = get(fy, "cash_from_investing"), cff = get(fy, "cash_from_financing");
    if (net != null && cfo != null && cfi != null && cff != null) {
      const sum = cfo + cfi + cff;
      const ok = close(sum, net, CASH_TOLERANCE) || Math.abs(sum - net) <= Math.max(Math.abs(cfo), 1) * 0.01;
      issues.push({ rule_key: "cash_flow_sum", severity: ok ? "info" : "warning", fiscal_year: fy, passed: ok, metric_keys: ["net_change_in_cash"],
        message: ok ? "Operating + investing + financing equals net change in cash." : `CFO+CFI+CFF = ${fmt(sum)} vs net change ${fmt(net)} (may include FX effects).` });
    } else {
      const missingInputs = [
        cfo == null ? "cash from operations" : null,
        cfi == null ? "cash from investing" : null,
        cff == null ? "cash from financing" : null,
        net == null ? "net change in cash" : null,
      ].filter((input): input is string => input != null);
      issues.push({ rule_key: "cash_flow_sum", severity: "warning", fiscal_year: fy, passed: false, metric_keys: ["net_change_in_cash"],
        message: `Cash-flow sum cannot be checked; missing ${missingInputs.join(", ")}.` });
    }
    // Closing cash vs balance sheet cash
    const bsCash = get(fy, "cash_and_equivalents");
    if (closeC != null && bsCash != null) {
      if (!close(closeC, bsCash, CASH_TOLERANCE)) {
        issues.push({ rule_key: "cash_vs_balance_sheet", severity: "warning", fiscal_year: fy, passed: false, metric_keys: ["closing_cash", "cash_and_equivalents"],
          message: `Cash flow closing cash ${fmt(closeC)} differs from balance sheet cash ${fmt(bsCash)} (overdrafts or bank balances may explain it).` });
      }
    } else {
      const missingInputs = [
        closeC == null ? "cash-flow closing cash" : null,
        bsCash == null ? "balance-sheet cash and equivalents" : null,
      ].filter((input): input is string => input != null);
      issues.push({ rule_key: "cash_vs_balance_sheet", severity: "warning", fiscal_year: fy, passed: false, metric_keys: ["closing_cash", "cash_and_equivalents"],
        message: `Cash flow and balance-sheet cash cannot be compared; missing ${missingInputs.join(", ")}.` });
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
  const uncertaintyFlags = flags.filter((flag) => flag !== "pdf_text_extracted");
  return confidence >= 0.9 && uncertaintyFlags.length === 0 ? "high_confidence" : "needs_review";
}

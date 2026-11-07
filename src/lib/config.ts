// Product branding is configurable here.
export const APP_NAME = "EquityPilot AI";
export const APP_TAGLINE = "Professional Equity Research. Simplified by AI.";

export const STAGES = [
  { key: "company_selected", label: "Company identified", step: 3 },
  { key: "documents_uploaded", label: "Statements uploaded", step: 4 },
  { key: "extracted", label: "Data extracted", step: 5 },
  { key: "validated", label: "Reviewed & validated", step: 7 },
  { key: "analysed", label: "Ratios & trends", step: 8 },
  { key: "researched", label: "Business research", step: 9 },
  { key: "valued", label: "Valuation", step: 10 },
  { key: "thesis_generated", label: "Investment thesis", step: 11 },
  { key: "deck_generated", label: "10-slide pitch deck", step: 12 },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export function stageIndex(stage: string) {
  return STAGES.findIndex((s) => s.key === stage);
}

/** Indian FY label: FY2024 = Apr 2023 – Mar 2024 */
export function fyLabel(fy: number) {
  return `FY${String(fy).slice(2)} (Apr ${fy - 1} – Mar ${fy})`;
}

export function lastFiveFYs(now = new Date()) {
  // Latest completed Indian FY ends in March.
  const latest = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [latest, latest - 1, latest - 2, latest - 3, latest - 4];
}

export const STATEMENT_TYPES = [
  { value: "annual_report", label: "Annual report (full)" },
  { value: "income_statement", label: "Profit & loss statement" },
  { value: "balance_sheet", label: "Balance sheet" },
  { value: "cash_flow", label: "Cash flow statement" },
  { value: "other", label: "Other" },
] as const;


export interface FinancialYear {
  year: string;
  revenue?: number | null;
  ebitda?: number | null;
  ebit?: number | null;
  netProfit?: number | null;
  totalDebt?: number | null;
  totalEquity?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  operatingCashFlow?: number | null;
  capex?: number | null;
  averageEquity?: number | null;
  averageCapitalEmployed?: number | null;
}

export interface FinancialAnalysisResult {
  year: string;
  revenueGrowth: number | null;
  ebitdaGrowth: number | null;
  profitGrowth: number | null;
  ebitdaMargin: number | null;
  ebitMargin: number | null;
  netProfitMargin: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  freeCashFlow: number | null;
}

export interface StoredFinancialPeriod {
  fiscal_year: number;
  reporting_basis: string;
  units: string;
  currency: string;
  validation_status: string;
}

export interface StoredFinancialStatements {
  period: StoredFinancialPeriod;
  incomeStatement: Pick<FinancialYear, "revenue" | "ebitda" | "ebit" | "netProfit"> | null;
  balanceSheet: Pick<FinancialYear, "totalDebt" | "totalEquity"> | null;
  cashFlow: Pick<FinancialYear, "operatingCashFlow" | "capex"> | null;
}

export function financialYearsFromStatements(
  statements: StoredFinancialStatements[],
  reportingBasis: string,
  units: string,
): FinancialYear[] {
  const years = new Set<number>();
  const sorted = [...statements].sort((a, b) => a.period.fiscal_year - b.period.fiscal_year);

  return sorted.map(({ period, incomeStatement, balanceSheet, cashFlow }) => {
    if (
      period.reporting_basis !== reportingBasis ||
      period.units !== units ||
      period.currency !== "INR"
    ) {
      throw new Error("Stored statement basis, currency, or units do not match this analysis.");
    }
    if (period.validation_status !== "completed") {
      throw new Error(`FY${period.fiscal_year} has not passed financial data validation.`);
    }
    if (years.has(period.fiscal_year)) {
      throw new Error(`Duplicate financial period FY${period.fiscal_year}.`);
    }
    years.add(period.fiscal_year);

    return {
      year: String(period.fiscal_year),
      revenue: incomeStatement?.revenue ?? null,
      ebitda: incomeStatement?.ebitda ?? null,
      ebit: incomeStatement?.ebit ?? null,
      netProfit: incomeStatement?.netProfit ?? null,
      totalDebt: balanceSheet?.totalDebt ?? null,
      totalEquity: balanceSheet?.totalEquity ?? null,
      operatingCashFlow: cashFlow?.operatingCashFlow ?? null,
      capex: cashFlow?.capex ?? null,
    };
  });
}

function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (
    numerator == null ||
    denominator == null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }

  return numerator / denominator;
}

function growthRate(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (
    current == null ||
    previous == null ||
    previous === undefined ||
    previous <= 0 ||
    !Number.isFinite(current)
  ) {
    return null;
  }

  return ((current / previous) - 1) * 100;
}

function validateYear(data: FinancialYear): void {
  if (!data.year?.trim()) {
    throw new Error("Financial year is required.");
  }

  for (const [field, value] of Object.entries(data)) {
    if (value != null && field !== "year" && !Number.isFinite(value)) {
      throw new Error(`Invalid ${field} for ${data.year}`);
    }
  }
}

export function analyzeFinancials(
  financialYears: FinancialYear[]
): FinancialAnalysisResult[] {
  if (financialYears.length < 2) {
    throw new Error(
      "At least two financial years are required for trend analysis."
    );
  }

  const sorted = [...financialYears].sort((a, b) =>
    a.year.localeCompare(b.year)
  );

  const seenYears = new Set<string>();

  sorted.forEach((year) => {
    validateYear(year);

    if (seenYears.has(year.year)) {
      throw new Error(
        `Duplicate financial year: ${year.year}`
      );
    }

    seenYears.add(year.year);
  });

  return sorted.map((current, index) => {
    const previous = sorted[index - 1];

    const capitalEmployed = current.averageCapitalEmployed ??
      (current.totalDebt != null && current.totalEquity != null
        ? current.totalDebt + current.totalEquity
        : null);

    const equityForRoe =
      current.averageEquity ?? current.totalEquity;

    return {
      year: current.year,

      revenueGrowth: growthRate(
        current.revenue,
        previous?.revenue
      ),

      ebitdaGrowth: growthRate(
        current.ebitda,
        previous?.ebitda
      ),

      profitGrowth: growthRate(
        current.netProfit,
        previous?.netProfit
      ),

      ebitdaMargin: safeDivide(
        current.ebitda == null ? null : current.ebitda * 100,
        current.revenue
      ),

      ebitMargin: safeDivide(
        current.ebit == null ? null : current.ebit * 100,
        current.revenue,
      ),

      netProfitMargin: safeDivide(
        current.netProfit == null ? null : current.netProfit * 100,
        current.revenue
      ),

      roe: safeDivide(
        current.netProfit == null ? null : current.netProfit * 100,
        equityForRoe
      ),

      roce: safeDivide(
        current.ebit == null ? null : current.ebit * 100,
        capitalEmployed
      ),

      debtToEquity: safeDivide(
        current.totalDebt,
        current.totalEquity
      ),

      currentRatio: safeDivide(
        current.currentAssets,
        current.currentLiabilities
      ),

      freeCashFlow: current.operatingCashFlow == null || current.capex == null
        ? null
        : current.operatingCashFlow - Math.abs(current.capex),
    };
  });
}

export function calculateCAGR(
  startingValue: number,
  endingValue: number,
  numberOfYears: number
): number | null {
  if (
    startingValue <= 0 ||
    endingValue < 0 ||
    numberOfYears <= 0 ||
    !Number.isFinite(startingValue) ||
    !Number.isFinite(endingValue)
  ) {
    return null;
  }

  return (
    (Math.pow(
      endingValue / startingValue,
      1 / numberOfYears
    ) - 1) * 100
  );
}

export function formatRatio(
  value: number | null,
  suffix = "%"
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)}${suffix}`;
}

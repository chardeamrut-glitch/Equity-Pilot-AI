
export interface FinancialYear {
  year: string;
  revenue: number;
  ebitda: number;
  ebit: number;
  netProfit: number;
  totalDebt: number;
  totalEquity: number;
  currentAssets: number;
  currentLiabilities: number;
  operatingCashFlow: number;
  capex: number;
  averageEquity?: number;
  averageCapitalEmployed?: number;
}

export interface FinancialAnalysisResult {
  year: string;
  revenueGrowth: number | null;
  ebitdaGrowth: number | null;
  profitGrowth: number | null;
  ebitdaMargin: number | null;
  netProfitMargin: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  freeCashFlow: number;
}

function safeDivide(
  numerator: number,
  denominator: number
): number | null {
  if (!Number.isFinite(numerator) ||
      !Number.isFinite(denominator) ||
      denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function growthRate(
  current: number,
  previous: number | undefined
): number | null {
  if (
    previous === undefined ||
    previous <= 0 ||
    !Number.isFinite(current)
  ) {
    return null;
  }

  return ((current / previous) - 1) * 100;
}

function validateYear(data: FinancialYear): void {
  const numericFields: (keyof FinancialYear)[] = [
    "revenue",
    "ebitda",
    "ebit",
    "netProfit",
    "totalDebt",
    "totalEquity",
    "currentAssets",
    "currentLiabilities",
    "operatingCashFlow",
    "capex",
  ];

  for (const field of numericFields) {
    const value = data[field];

    if (
      typeof value !== "number" ||
      !Number.isFinite(value)
    ) {
      throw new Error(
        `Invalid or missing ${field} for ${data.year}`
      );
    }
  }

  if (!data.year.trim()) {
    throw new Error("Financial year is required.");
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

    const capitalEmployed =
      current.averageCapitalEmployed ??
      current.totalDebt + current.totalEquity;

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
        current.ebitda * 100,
        current.revenue
      ),

      netProfitMargin: safeDivide(
        current.netProfit * 100,
        current.revenue
      ),

      roe: safeDivide(
        current.netProfit * 100,
        equityForRoe
      ),

      roce: safeDivide(
        current.ebit * 100,
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

      freeCashFlow:
        current.operatingCashFlow -
        Math.abs(current.capex),
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

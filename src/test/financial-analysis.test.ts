import { describe, expect, it } from "vitest";
import {
  analyzeFinancials,
  financialYearsFromStatements,
  type StoredFinancialStatements,
} from "@/lib/financial-analysis";

const period = (fiscal_year: number): StoredFinancialStatements["period"] => ({
  fiscal_year,
  reporting_basis: "consolidated",
  units: "crore",
  currency: "INR",
  validation_status: "completed",
});

describe("financial analysis", () => {
  it("calculates five-year statement ratios and margins from validated statement data", () => {
    const data = financialYearsFromStatements(
      Array.from({ length: 5 }, (_, index) => {
        const revenue = 80 + index * 10;
        return {
          period: period(2020 + index),
          incomeStatement: { revenue, ebitda: revenue * 0.25, ebit: revenue * 0.2, netProfit: revenue * 0.1 },
          balanceSheet: { totalDebt: 20, totalEquity: 60 },
          cashFlow: { operatingCashFlow: 18, capex: -6 },
        };
      }),
      "consolidated",
      "crore",
    );
    const results = analyzeFinancials(data);
    const latest = results[4]!;

    expect(results).toHaveLength(5);
    expect(latest.revenueGrowth).toBeCloseTo((120 / 110 - 1) * 100);
    expect(latest.ebitdaMargin).toBeCloseTo(25);
    expect(latest.ebitMargin).toBeCloseTo(20);
    expect(latest.netProfitMargin).toBeCloseTo(10);
    expect(latest.debtToEquity).toBeCloseTo(1 / 3);
    expect(latest.currentRatio).toBeNull();
    expect(latest.roe).toBeCloseTo(20);
    expect(latest.roce).toBeCloseTo(24 / 80 * 100);
    expect(latest.freeCashFlow).toBe(12);
  });

  it("reports metrics as unavailable when their required statement inputs are missing", () => {
    const results = analyzeFinancials([
      { year: "2023", revenue: 100 },
      { year: "2024", revenue: 120, ebit: 20, netProfit: 12 },
    ]);

    expect(results[1]?.revenueGrowth).toBeCloseTo(20);
    expect(results[1]?.ebitdaMargin).toBeNull();
    expect(results[1]?.ebitMargin).toBeCloseTo(100 / 6);
    expect(results[1]?.debtToEquity).toBeNull();
    expect(results[1]?.currentRatio).toBeNull();
    expect(results[1]?.roe).toBeNull();
    expect(results[1]?.roce).toBeNull();
    expect(results[1]?.freeCashFlow).toBeNull();
  });

  it("rejects periods that do not match the analysis basis or units", () => {
    expect(() => financialYearsFromStatements(
      [{
        period: { ...period(2024), reporting_basis: "standalone" },
        incomeStatement: null,
        balanceSheet: null,
        cashFlow: null,
      }],
      "consolidated",
      "crore",
    )).toThrow(/basis, currency, or units/);
  });

  it("keeps all stored statement values in their analysis unit", () => {
    const [year] = financialYearsFromStatements(
      [{
        period: period(2024),
        incomeStatement: { revenue: 100, ebitda: null, ebit: null, netProfit: null },
        balanceSheet: null,
        cashFlow: null,
      }],
      "consolidated",
      "crore",
    );

    expect(year?.revenue).toBe(100);
    expect(year?.ebitda).toBeNull();
    expect(year?.totalDebt).toBeNull();
  });
});

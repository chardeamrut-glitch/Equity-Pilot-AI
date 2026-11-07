import { describe, expect, it } from "vitest";
import { fyLabel, lastFiveFYs } from "@/lib/config";

describe("Indian financial year", () => {
  it("labels FY2024 as Apr 2023 – Mar 2024", () => {
    expect(fyLabel(2024)).toBe("FY24 (Apr 2023 – Mar 2024)");
  });
  it("in Nov 2026 the latest completed FY is FY2026, five years back to FY2022", () => {
    expect(lastFiveFYs(new Date(2026, 10, 7))).toEqual([2026, 2025, 2024, 2023, 2022]);
  });
  it("in Feb 2026 the latest completed FY is FY2025", () => {
    expect(lastFiveFYs(new Date(2026, 1, 1))[0]).toBe(2025);
  });
});

import { describe, expect, it } from "vitest";
import { parsePdfTextPages } from "@/lib/extraction.server";

describe("text-based PDF parsing", () => {
  it("does not produce financial values when a selected statement page has no aligned figures", () => {
    expect(() => parsePdfTextPages(["Balance sheet\nParticulars"])).toThrow(
      "No financial statement figures could be confidently aligned to financial years.",
    );
  });

  it("does not treat year headings as financial values", () => {
    expect(() => parsePdfTextPages(["Balance sheet\nParticulars 2024 2023"])).toThrow(
      "No financial statement figures could be confidently aligned to financial years.",
    );
  });
});

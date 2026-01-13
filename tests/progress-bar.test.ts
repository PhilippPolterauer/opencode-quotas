import { expect, test, describe } from "bun:test";
import { renderQuotaBarParts } from "../src/ui/progress-bar";

describe("Progress Bar Rendering", () => {
  test("renders basic bar at 50%", () => {
    const parts = renderQuotaBarParts(50, 100, {
      label: "Test",
      unit: "%",
    });

    // Default width is 20, so 50% is 10 chars.
    expect(parts.bar).toContain("██████████░░░░░░░░░░");
    expect(parts.percent).toContain("50%");
    expect(parts.valuePart).toContain("(50/100 %)");
    expect(parts.labelPart).toContain("Test:");
  });

  test("keeps small decimals (no integer rounding)", () => {
    const parts = renderQuotaBarParts(2.3, 50, {
      label: "Dec",
      unit: "%",
    });

    // Previously this rounded 2.3 -> 2, making values look like multiples.
    expect(parts.valuePart).toContain("(2.3/50 %)");
  });

  test("respects custom width", () => {
    const parts = renderQuotaBarParts(5, 10, {
      label: "Small",
      unit: "GB",
      config: { width: 10 },
    });

    expect(parts.bar).toContain("█████░░░░░");
    expect(parts.percent).toContain("50%");
  });

  test("handles unlimited/zero limit", () => {
    const parts = renderQuotaBarParts(10, 0, {
      label: "Unlimited",
      unit: "items",
    });

    // Should be all empty chars
    // Default width 20
    expect(parts.bar).toContain("░".repeat(20));
    expect(parts.percent).toBe("n/a");
    expect(parts.valuePart).toContain("(10/0 items)");
  });

  test("applies color gradients", () => {
    process.env.FORCE_COLOR = "1";
    const config = {
      gradients: [
        { threshold: 0.5, color: "green" as const },
        { threshold: 0.9, color: "yellow" as const },
        { threshold: 1.0, color: "red" as const },
      ],
      color: true,
      filledChar: "█",
      emptyChar: "░",
    };

    const green = renderQuotaBarParts(30, 100, { label: "G", unit: "U", config });
    expect(green.bar).toContain("\x1b[32m"); // Green ANSI code

    const yellow = renderQuotaBarParts(70, 100, { label: "Y", unit: "U", config });
    expect(yellow.bar).toContain("\x1b[33m"); // Yellow ANSI code

    const red = renderQuotaBarParts(95, 100, { label: "R", unit: "U", config });
    expect(red.bar).toContain("\x1b[31m"); // Red ANSI code
    
    delete process.env.FORCE_COLOR;
  });

  test("handles 'available' mode", () => {
    const parts = renderQuotaBarParts(30, 100, {
      label: "Avail",
      unit: "GB",
      config: { show: "available", width: 10 },
    });

    // 100 - 30 = 70 available. 70% of 10 chars is 7.
    expect(parts.bar).toContain("███████░░░");
    expect(parts.percent).toContain("70%");
    expect(parts.valuePart).toContain("(70/100 GB)");
  });
});

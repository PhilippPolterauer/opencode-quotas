import { expect, test, describe } from "bun:test";
import { renderQuotaBar } from "../src/ui/progress-bar";

describe("Progress Bar Rendering", () => {
  test("renders basic bar at 50%", () => {
    const result = renderQuotaBar(50, 100, {
      label: "Test",
      unit: "%",
    });

    // Default width is 24, so 50% is 12 chars.
    // No brackets [], using ▰ and ▱
    expect(result).toContain("▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱");
    expect(result).toContain("50%");
    expect(result).toContain("(50/100 %)");
    expect(result).toContain("Test:");
  });

  test("respects custom width", () => {
    const result = renderQuotaBar(5, 10, {
      label: "Small",
      unit: "GB",
      config: { width: 10 },
    });

    expect(result).toContain("▰▰▰▰▰▱▱▱▱▱");
    expect(result).toContain("50%");
  });

  test("handles unlimited/zero limit", () => {
    const result = renderQuotaBar(10, 0, {
      label: "Unlimited",
      unit: "items",
    });

    // Should be all empty chars
    expect(result).toContain("▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱");
    expect(result).toContain("n/a");
    expect(result).toContain("(10/0 items)");
  });

  test("applies color gradients", () => {
    process.env.FORCE_COLOR = "1";
    const config = {
      gradients: [
        { threshold: 0.5, color: "green" as const },
        { threshold: 0.9, color: "yellow" as const },
        { threshold: 1.0, color: "red" as const },
      ],
    };

    const green = renderQuotaBar(30, 100, { label: "G", unit: "U", config });
    expect(green).toContain("\x1b[32m"); // Green ANSI code

    const yellow = renderQuotaBar(70, 100, { label: "Y", unit: "U", config });
    expect(yellow).toContain("\x1b[33m"); // Yellow ANSI code

    const red = renderQuotaBar(95, 100, { label: "R", unit: "U", config });
    expect(red).toContain("\x1b[31m"); // Red ANSI code
    
    delete process.env.FORCE_COLOR;
  });

  test("handles 'available' mode", () => {
    const result = renderQuotaBar(30, 100, {
      label: "Avail",
      unit: "GB",
      config: { show: "available", width: 10 },
    });

    // 100 - 30 = 70 available. 70% of 10 chars is 7.
    // Expect slanted chars, no brackets
    expect(result).toContain("▰▰▰▰▰▰▰▱▱▱");
    expect(result).toContain("70%");
    expect(result).toContain("(70/100 GB)");
  });
});

import { expect, test, describe } from "bun:test";
import { extractCodexQuota } from "../../src/providers/codex";

describe("Codex Quota Parsing", () => {
  test("returns multiple entries for primary and secondary windows", () => {
    const payload = {
      rate_limit: {
        primary_window: {
          used_percent: 45.5,
          limit_window_seconds: 3600,
          reset_after_seconds: 1200,
        },
        secondary_window: {
          used_percent: 10,
          limit_window_seconds: 86400,
          reset_at: 1736611200,
        },
      },
    };

    const result = extractCodexQuota(payload);
    expect(result).toHaveLength(2);

    expect(result[0].providerName).toBe("Codex Primary");
    expect(result[0].used).toBe(45.5);

    expect(result[1].providerName).toBe("Codex Secondary");
    expect(result[1].used).toBe(10);
  });

  test("parses credit balances", () => {
    const payload = {
      credits: {
        balance: "150.75",
        unlimited: false,
      },
    };

    const result = extractCodexQuota(payload);
    expect(result).toHaveLength(1);
    expect(result[0].providerName).toBe("Codex Credits");
    expect(result[0].used).toBe(150.75);
  });

  test("handles empty or invalid payload", () => {
    expect(extractCodexQuota({})).toEqual([]);
    expect(extractCodexQuota(null)).toEqual([]);
  });
});

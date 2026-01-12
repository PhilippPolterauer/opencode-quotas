import { expect, test, describe } from "bun:test";
import { parseGithubUsage } from "../src/providers/github";

describe("GitHub Copilot Quota Parsing", () => {
  const mockSkuFree = "free_individual_quota";
  const mockSkuOss = "free_engaged_oss_quota";
  const mockSkuPro = "pro_quota";

  test("calculates usage for current month in Free plan", () => {
    const now = new Date();
    const dayStr = now.toISOString().split("T")[0];
    
    const data = [
      {
        day: dayStr,
        total_suggestions_count: 150,
        total_chat_count: 50,
      }
    ];

    const result = parseGithubUsage(data, mockSkuFree);
    expect(result).toHaveLength(1);
    expect(result[0].used).toBe(200);
    expect(result[0].limit).toBe(2000);
    expect(result[0].info).toBe("Free Plan");
  });

  test("handles OSS 'free' plan as Pro equivalent", () => {
    const result = parseGithubUsage([], mockSkuOss);
    expect(result).toHaveLength(1);
    expect(result[0].limit).toBeNull();
    expect(result[0].info).toBe("Pro Plan");
  });

  test("handles Pro plan SKU", () => {
    const result = parseGithubUsage([], mockSkuPro);
    expect(result).toHaveLength(1);
    expect(result[0].limit).toBeNull();
    expect(result[0].info).toBe("Pro Plan");
  });

  test("displays warning when API is deprecated", () => {
    const result = parseGithubUsage([], mockSkuPro, "404");
    expect(result[0].info).toContain("Service Currently Unavailable");
  });

  test("handles empty payload gracefully", () => {
    const result = parseGithubUsage(null, mockSkuFree);
    expect(result).toHaveLength(1);
    expect(result[0].used).toBe(0);
  });
});

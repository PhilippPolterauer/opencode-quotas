import { expect, test, describe, spyOn } from "bun:test";
import { createAntigravityProvider } from "../src/providers/antigravity";
import * as auth from "../src/providers/antigravity/auth";
import * as antigravity from "../src/providers/antigravity";

describe("Antigravity Individual Model Configuration", () => {
  test("renders each model separately when granular groups are provided", async () => {
    // Mock credentials
    spyOn(auth, "getCloudCredentials").mockResolvedValue({
      accessToken: "mock-token",
      email: "test@example.com",
      projectId: "test-project",
    });

    // Mock cloud response with 3 distinct models using labels
    spyOn(antigravity, "fetchCloudQuota").mockResolvedValue({
      account: {},
      timestamp: Date.now(),
      models: [
        {
          modelName: "model-a",
          label: "Gemini Pro",
          quotaInfo: { remainingFraction: 0.8 },
        },
        {
          modelName: "model-b",
          label: "Claude Sonnet",
          quotaInfo: { remainingFraction: 0.5 },
        },
        {
          modelName: "model-c",
          label: "GPT-4o",
          quotaInfo: { remainingFraction: 0.1 },
        },
      ],
    });

    // To show them individually, we define one group per model using their labels
    const individualGroups = [
      { name: "Gemini Pro", patterns: ["gemini pro"] },
      { name: "Claude Sonnet", patterns: ["claude sonnet"] },
      { name: "GPT-4o", patterns: ["gpt-4o"] },
    ];

    const provider = createAntigravityProvider(individualGroups);
    const result = await provider.fetchQuota();

    expect(result).toHaveLength(3);

    const names = result.map((r) => r.providerName);
    expect(names).toContain("Antigravity Gemini Pro");
    expect(names).toContain("Antigravity Claude Sonnet");
    expect(names).toContain("Antigravity GPT-4o");

    const gpt = result.find((r) => r.providerName === "Antigravity GPT-4o");
    expect(gpt?.used).toBe(90); // 1 - 0.1
  });

  test("falls back to default categories when groups is undefined", async () => {
    spyOn(antigravity, "fetchCloudQuota").mockResolvedValue({
      account: {},
      timestamp: Date.now(),
      models: [
        {
          modelName: "gpt-4",
          label: "GPT 4",
          quotaInfo: { remainingFraction: 0.9 },
        },
        {
          modelName: "gemini-pro",
          label: "Gemini Pro",
          quotaInfo: { remainingFraction: 0.7 },
        },
      ],
    });

    const provider = createAntigravityProvider(undefined);
    const result = await provider.fetchQuota();

    // GPT-4 -> Premium, Gemini Pro -> Pro
    expect(result.map((r) => r.providerName)).toContain("Antigravity Premium");
    expect(result.map((r) => r.providerName)).toContain("Antigravity Pro");
  });
});

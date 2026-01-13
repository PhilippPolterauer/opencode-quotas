import { expect, test, describe } from "bun:test";
import { extractCodexQuota } from "../src/providers/codex";

describe("Quota Configuration and Filtering", () => {
  test("assigns stable IDs to Codex quotas", () => {
    const payload = {
      rate_limit: {
        primary_window: { used_percent: 50 },
        secondary_window: { used_percent: 10 },
      },
      credits: { balance: "100" },
    };

    const results = extractCodexQuota(payload);

    expect(results).toHaveLength(3);
    expect(results.find((r) => r.id === "codex-primary")).toBeDefined();
    expect(results.find((r) => r.id === "codex-secondary")).toBeDefined();
    expect(results.find((r) => r.id === "codex-credits")).toBeDefined();
  });

  test("assigns stable IDs to Antigravity categories", async () => {
    // We'll test the builder logic directly or via the mock
    const {
      createAntigravityProvider,
      fetchCloudQuota,
    } = require("../src/providers/antigravity");
    const { getCloudCredentials } = require("../src/providers/antigravity/auth");
    const { spyOn } = require("bun:test");

    const mockFetch = spyOn(
      require("../src/providers/antigravity"),
      "fetchCloudQuota",
    ).mockResolvedValue({
      models: [
        {
          modelName: "flash-1",
          label: "Flash Model",
          quotaInfo: { remainingFraction: 0.5 },
        },
      ],
    });

    spyOn(
      require("../src/providers/antigravity/auth"),
      "getCloudCredentials",
    ).mockResolvedValue({
      accessToken: "token",
      projectId: "pid",
    });

    const provider = createAntigravityProvider();
    const results = await provider.fetchQuota();

    expect(results[0].id).toBe("ag-flash");
  });
});

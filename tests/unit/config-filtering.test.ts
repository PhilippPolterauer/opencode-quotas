import { expect, test, describe, afterEach } from "bun:test";
import { extractCodexQuota } from "../../src/providers/codex";

describe("Quota Configuration and Filtering", () => {
    afterEach(() => {
        const { spyOn } = require("bun:test");
        const antigravity = require("../../src/providers/antigravity");
        const auth = require("../../src/providers/antigravity/auth");

        if (antigravity.fetchCloudQuota.mockRestore) antigravity.fetchCloudQuota.mockRestore();
        if (auth.getCloudCredentials.mockRestore) auth.getCloudCredentials.mockRestore();
    });

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

    test("assigns stable raw IDs to Antigravity models", async () => {
        // Provider now returns flat raw quotas, aggregation happens in service layer
        const {
            createAntigravityProvider,
        } = require("../../src/providers/antigravity");
        const { spyOn } = require("bun:test");

        spyOn(
            require("../../src/providers/antigravity"),
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
            require("../../src/providers/antigravity/auth"),
            "getCloudCredentials",
        ).mockResolvedValue({
            accessToken: "token",
            projectId: "pid",
        });

        const provider = createAntigravityProvider();
        const results = await provider.fetchQuota();

        // Provider now returns raw IDs like "ag-raw-flash-model"
        expect(results[0].id).toBe("ag-raw-flash-model");
        expect(results[0].providerName).toBe("Antigravity Flash Model");
    });
});

import { expect, test, describe, spyOn, afterEach } from "bun:test";
import { createAntigravityProvider } from "../src/providers/antigravity";
import * as auth from "../src/providers/antigravity/auth";
import * as antigravity from "../src/providers/antigravity";

describe("Antigravity Flat Quota Provider", () => {
    afterEach(() => {
        // Restore all spies
        for (const spy of [
            auth.getCloudCredentials,
            antigravity.fetchCloudQuota,
        ]) {
            if ((spy as any).mockRestore) {
                (spy as any).mockRestore();
            }
        }
    });

    test("returns flat list of all models with raw IDs", async () => {
        // Mock credentials
        spyOn(auth, "getCloudCredentials").mockResolvedValue({
            accessToken: "mock-token",
            email: "test@example.com",
            projectId: "test-project",
        });

        // Mock cloud response with 3 distinct models
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

        // Provider now takes only config, no groups
        const provider = createAntigravityProvider();
        const result = await provider.fetchQuota();

        // Provider returns flat list of all models
        expect(result).toHaveLength(3);

        const names = result.map((r) => r.providerName);
        expect(names).toContain("Antigravity Gemini Pro");
        expect(names).toContain("Antigravity Claude Sonnet");
        expect(names).toContain("Antigravity GPT-4o");

        // IDs are raw IDs
        const ids = result.map((r) => r.id);
        expect(ids).toContain("ag-raw-gemini-pro");
        expect(ids).toContain("ag-raw-claude-sonnet");
        expect(ids).toContain("ag-raw-gpt-4o");

        const gpt = result.find((r) => r.providerName === "Antigravity GPT-4o");
        expect(gpt?.used).toBe(90); // 1 - 0.1
    });

    test("returns all models without any grouping", async () => {
        spyOn(auth, "getCloudCredentials").mockResolvedValue({
            accessToken: "mock-token",
            email: "test@example.com",
            projectId: "test-project",
        });

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

        const provider = createAntigravityProvider();
        const result = await provider.fetchQuota();

        // Provider returns flat list - no grouping at provider level
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.providerName)).toContain("Antigravity GPT 4");
        expect(result.map((r) => r.providerName)).toContain("Antigravity Gemini Pro");
        
        // Raw IDs
        expect(result.map((r) => r.id)).toContain("ag-raw-gpt-4");
        expect(result.map((r) => r.id)).toContain("ag-raw-gemini-pro");
    });
});

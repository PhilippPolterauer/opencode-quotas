import { expect, test, describe } from "bun:test";
import { QuotaService } from "../src/services/quota-service";

describe("Model Filtering with filterByCurrentModel", () => {
    const mockQuotas = [
        { id: "ag-flash", providerName: "Antigravity Flash", used: 10, limit: 100, unit: "%" },
        { id: "ag-pro", providerName: "Antigravity Pro", used: 20, limit: 100, unit: "%" },
        { id: "ag-premium", providerName: "Antigravity Premium", used: 30, limit: 100, unit: "%" },
        { id: "codex-smart", providerName: "Codex Usage", used: 40, limit: 100, unit: "%" },
    ];

    test("returns all quotas when filterByCurrentModel is false (default)", () => {
        const service = new QuotaService({ filterByCurrentModel: false, showUnaggregated: true });
        const filtered = service.processQuotas(mockQuotas, {
            providerId: "google",
            modelId: "antigravity-gemini-3-flash"
        });

        expect(filtered).toHaveLength(4);
    });

    test("filters to matching quota when filterByCurrentModel is true", () => {
        const service = new QuotaService({ filterByCurrentModel: true, showUnaggregated: true });
        const filtered = service.processQuotas(mockQuotas, {
            providerId: "google",
            modelId: "antigravity-gemini-3-flash"
        });

        // Should match "flash" token in ag-flash
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("ag-flash");
    });

    test("fuzzy matching handles tokens correctly", () => {
        const service = new QuotaService({ filterByCurrentModel: true, showUnaggregated: true });
        
        const filtered = service.processQuotas(mockQuotas, {
            providerId: "google",
            modelId: "antigravity-gemini-3-pro"
        });

        // Should match "pro" token in ag-pro
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("ag-pro");
    });

    test("scored fuzzy matching prioritizes specific tokens over general ones", () => {
        const service = new QuotaService({ filterByCurrentModel: true, showUnaggregated: true });

        const filtered = service.processQuotas(mockQuotas, {
            providerId: "google",
            modelId: "antigravity-pro"
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("ag-pro");
    });

    test("matches codex using fuzzy tokens", () => {
        const service = new QuotaService({ filterByCurrentModel: true, showUnaggregated: true });

        const filtered = service.processQuotas(mockQuotas, {
            providerId: "github-copilot",
            modelId: "gpt-5-codex"
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("codex-smart");
    });

    test("falls back to provider matching when no token matches", () => {
        const service = new QuotaService({ filterByCurrentModel: true, showUnaggregated: true });
        
        // Use a model ID with no matching tokens
        const filtered = service.processQuotas(mockQuotas, {
            providerId: "antigravity",
            modelId: "unknown-model-xyz"
        });

        // Should fall back to matching provider name
        expect(filtered.length).toBeGreaterThan(0);
        expect(filtered.every(q => q.providerName.toLowerCase().includes("antigravity"))).toBe(true);
    });
});

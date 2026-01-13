import { expect, test, describe } from "bun:test";
import { QuotaService } from "../src/services/quota-service";
import { DEFAULT_CONFIG } from "../src/defaults";

describe("Model Remapping and Filtering", () => {
    const mockQuotas = [
        { id: "ag-flash", providerName: "Antigravity Flash", used: 10, limit: 100, unit: "%" },
        { id: "ag-pro", providerName: "Antigravity Pro", used: 20, limit: 100, unit: "%" },
        { id: "ag-premium", providerName: "Antigravity Premium", used: 30, limit: 100, unit: "%" },
        { id: "codex-smart", providerName: "Codex Usage", used: 40, limit: 100, unit: "%" },
    ];

    test("matches google/antigravity-gemini-3-flash to ag-flash using explicit mapping", () => {
        const service = new QuotaService(DEFAULT_CONFIG);
        const filtered = service.processQuotas(mockQuotas, {
            providerId: "google",
            modelId: "antigravity-gemini-3-flash"
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("ag-flash");
    });

    test("matches google/antigravity-gemini-3-pro to ag-pro using explicit mapping", () => {
        const service = new QuotaService(DEFAULT_CONFIG);
        const filtered = service.processQuotas(mockQuotas, {
            providerId: "google",
            modelId: "antigravity-gemini-3-pro"
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("ag-pro");
    });

    test("fuzzy matching handles tokens correctly when no explicit mapping", () => {
        // Remove explicit mapping to test fuzzy
        const config = { ...DEFAULT_CONFIG, modelMapping: {} };
        const service = new QuotaService(config);
        
        const filtered = service.processQuotas(mockQuotas, {
            providerId: "google",
            modelId: "antigravity-gemini-3-flash"
        });

        // ag-flash should have highest score (matches "antigravity" and "flash")
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("ag-flash");
    });

    test("scored fuzzy matching prioritizes specific tokens over general ones", () => {
        const config = { ...DEFAULT_CONFIG, modelMapping: {}, filterByCurrentModel: true };
        const service = new QuotaService(config);

        const filtered = service.processQuotas(mockQuotas, {
            providerId: "google",
            modelId: "antigravity-pro"
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("ag-pro");
    });

    test("matches codex using fuzzy tokens when no explicit mapping", () => {
        const config = { ...DEFAULT_CONFIG, modelMapping: {}, filterByCurrentModel: true };
        const service = new QuotaService(config);

        const filtered = service.processQuotas(mockQuotas, {
            providerId: "github-copilot",
            modelId: "gpt-5-codex"
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("codex-smart");
    });

    test("shows only current model quota by default due to filterByCurrentModel: true", () => {
        const service = new QuotaService(DEFAULT_CONFIG);
        const filtered = service.processQuotas(mockQuotas, {
            providerId: "google",
            modelId: "antigravity-gemini-3-flash"
        });

        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("ag-flash");
        expect(filtered.find(q => q.id === "ag-pro")).toBeUndefined();
    });
});

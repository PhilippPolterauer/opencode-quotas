import { expect, test, describe } from "bun:test";
import { QuotaService } from "../../src/services/quota-service";
import type { QuotaData } from "../../src/interfaces";

describe("QuotaService - aggregation helpers", () => {
    test("pattern matching respects providerId filter", () => {
        const service = new QuotaService({ showUnaggregated: true });

        const quotas: QuotaData[] = [
            { id: "ag-flash-1", providerName: "Antigravity", used: 10, limit: 100, unit: "u" },
            { id: "codex-flash-1", providerName: "Codex", used: 5, limit: 100, unit: "u" },
        ];

        const group = { id: "g", name: "g", patterns: ["flash"], providerId: "antigravity" } as any;

        const matched: QuotaData[] = (service as any).resolveGroupSources(quotas, group);
        expect(matched).toHaveLength(1);
        expect(matched[0].id).toBe("ag-flash-1");
    });

    test("explicit sources are included even if providerId would otherwise exclude them", () => {
        const service = new QuotaService({ showUnaggregated: true });

        const quotas: QuotaData[] = [
            { id: "external-1", providerName: "OtherProvider", used: 1, limit: 10, unit: "u" },
            { id: "internal-1", providerName: "SameProvider", used: 2, limit: 10, unit: "u" },
        ];

        const group = {
            id: "g",
            name: "g",
            sources: ["external-1"],
            patterns: ["internal"],
            providerId: "sameprovider",
        } as any;

        const matched: QuotaData[] = (service as any).resolveGroupSources(quotas, group);
        const ids = matched.map(m => m.id).sort();
        expect(ids).toEqual(["external-1", "internal-1"].sort());
    });

    test("empty patterns and sources return no matches", () => {
        const service = new QuotaService({ showUnaggregated: true });
        const quotas: QuotaData[] = [
            { id: "q1", providerName: "P1", used: 1, limit: 10, unit: "u" },
        ];

        const group = { id: "g", name: "g" } as any;
        const matched: QuotaData[] = (service as any).resolveGroupSources(quotas, group);
        expect(matched).toHaveLength(0);
    });

    test("resolveGroupSources does not duplicate when source also matches pattern", () => {
        const service = new QuotaService({ showUnaggregated: true });
        const quotas: QuotaData[] = [
            { id: "dup-1", providerName: "P", used: 1, limit: 10, unit: "u" },
            { id: "dup-2", providerName: "P", used: 1, limit: 10, unit: "u" },
        ];

        const group = { id: "g", name: "g", sources: ["dup-1"], patterns: ["dup"] } as any;
        const matched: QuotaData[] = (service as any).resolveGroupSources(quotas, group);
        // dup-1 should appear once, dup-2 should be matched via pattern
        expect(matched.map(m => m.id).sort()).toEqual(["dup-1", "dup-2"].sort());
    });
});

describe("QuotaService - filterByModel fuzzy matching", () => {
    test("selects highest scoring quota based on tokens", () => {
        const service = new QuotaService({ filterByCurrentModel: true, showUnaggregated: true });

        const quotas: QuotaData[] = [
            { id: "q-special-model", providerName: "P", used: 1, limit: 10, unit: "u" }, // score 2
            { id: "q-special", providerName: "P", used: 1, limit: 10, unit: "u" }, // score 1
            { id: "q-other", providerName: "P", used: 1, limit: 10, unit: "u" },
        ];

        const filtered: QuotaData[] = (service as any).filterByModel(quotas, "p", "special-model");
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe("q-special-model");
    });

    test("returns multiple quotas when there's a tie in score", () => {
        const service = new QuotaService({ filterByCurrentModel: true, showUnaggregated: true });

        const quotas: QuotaData[] = [
            { id: "a-special", providerName: "P", used: 1, limit: 10, unit: "u" },
            { id: "b-special", providerName: "P", used: 1, limit: 10, unit: "u" },
            { id: "c-other", providerName: "P", used: 1, limit: 10, unit: "u" },
        ];

        const filtered: QuotaData[] = (service as any).filterByModel(quotas, "p", "special-v2");
        expect(filtered.map(q => q.id).sort()).toEqual(["a-special", "b-special"].sort());
    });

    test("falls back to provider matching when no token matches", () => {
        const service = new QuotaService({ filterByCurrentModel: true, showUnaggregated: true });

        const quotas: QuotaData[] = [
            { id: "codex-q", providerName: "Codex", used: 1, limit: 10, unit: "u" },
            { id: "other-q", providerName: "Other", used: 1, limit: 10, unit: "u" },
        ];

        const filtered: QuotaData[] = (service as any).filterByModel(quotas, "codex", "unknown-model");
        expect(filtered.map(q => q.id)).toEqual(["codex-q"]);
    });
});

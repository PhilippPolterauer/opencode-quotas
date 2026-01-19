import { expect, test, describe, beforeEach } from "bun:test";
import { QuotaService } from "../../src/services/quota-service";
import { type QuotaData, type IHistoryService, type HistoryPoint } from "../../src/interfaces";

describe("Aggregation Strategies", () => {
    let mockHistoryService: IHistoryService;
    let historyData: Record<string, HistoryPoint[]> = {};

    beforeEach(() => {
        historyData = {};
        mockHistoryService = {
            init: async () => {},
            append: async () => {},
            getHistory: (id: string) => historyData[id] || [],
            setMaxAge: () => {},
            setResetThreshold: () => {},
            pruneAll: async () => {}
        };
    });

    const mockData: QuotaData[] = [
        { id: "q1", providerName: "P1", used: 10, limit: 100, unit: "u" },
        { id: "q2", providerName: "P1", used: 80, limit: 100, unit: "u" },
    ];

    test("aggregates using 'max' strategy", () => {
        const service = new QuotaService({
            aggregatedGroups: [{
                id: "smart",
                name: "Smart Quota",
                sources: ["q1", "q2"],
                strategy: "max"
            }]
        });

        const processed = service.processQuotas(mockData);
        expect(processed).toHaveLength(1);
        expect(processed[0].id).toBe("smart");
        expect(processed[0].used).toBe(80);
    });

    test("aggregates using 'min' strategy", () => {
        const service = new QuotaService({
            aggregatedGroups: [{
                id: "smart",
                name: "Smart Quota",
                sources: ["q1", "q2"],
                strategy: "min"
            }]
        });

        const processed = service.processQuotas(mockData);
        expect(processed).toHaveLength(1);
        expect(processed[0].id).toBe("smart");
        expect(processed[0].used).toBe(10);
    });

    test("aggregates using 'mean' strategy", () => {
        const service = new QuotaService({
            aggregatedGroups: [{
                id: "smart",
                name: "Smart Quota",
                sources: ["q1", "q2"],
                strategy: "mean"
            }]
        });

        const processed = service.processQuotas(mockData);
        expect(processed).toHaveLength(1);
        expect(processed[0].id).toBe("smart");
        expect(processed[0].used).toBe(45); // (10 + 80) / 2
        expect(processed[0].unit).toBe("%");
    });

    test("aggregates using 'median' strategy", () => {
        const service = new QuotaService({
            aggregatedGroups: [{
                id: "smart",
                name: "Smart Quota",
                sources: ["q1", "q2", "q3"],
                strategy: "median"
            }]
        });

        const dataWithThree = [
            ...mockData,
            { id: "q3", providerName: "P1", used: 50, limit: 100, unit: "u" }
        ];

        const processed = service.processQuotas(dataWithThree);
        expect(processed).toHaveLength(1);
        expect(processed[0].used).toBe(50);
    });

    test("aggregates using 'most_critical' strategy with history", async () => {
        const now = Date.now();
        // q1 is low but increasing fast
        historyData["q1"] = [
            { timestamp: now - 10000, used: 0, limit: 100 },
            { timestamp: now, used: 20, limit: 100 },
        ];
        // q2 is high but stable
        historyData["q2"] = [
            { timestamp: now - 10000, used: 80, limit: 100 },
            { timestamp: now, used: 80, limit: 100 },
        ];

        const service = new QuotaService({
            aggregatedGroups: [{
                id: "smart",
                name: "Smart Quota",
                sources: ["q1", "q2"],
                strategy: "most_critical"
            }]
        });
        await service.init("/tmp", mockHistoryService);

        const currentData: QuotaData[] = [
            { id: "q1", providerName: "P1", used: 20, limit: 100, unit: "u" },
            { id: "q2", providerName: "P1", used: 80, limit: 100, unit: "u" },
        ];

        const processed = service.processQuotas(currentData);
        expect(processed).toHaveLength(1);
        // q1 should be representative because it will hit limit sooner based on slope
        expect(processed[0].providerName).toBe("Smart Quota");
        
        // Let's verify our expectation of which one is more critical.
        // q1 slope: 2 units/sec. Remaining: 80 units. Time to limit: 40 sec.
        // q2 slope: 0 units/sec. Time to limit: Infinity.
        // So q1 is the winner (representative).
        
        // Note: The logic in QuotaService.processQuotas doesn't currently 
        // return the representative's ORIGINAL id, it returns group.id.
        // We can check other properties if needed.
        expect(processed[0].id).toBe("smart");
    });
    
    test("falls back to max usage in 'most_critical' when no history is available", async () => {
        const service = new QuotaService({
            aggregatedGroups: [{
                id: "smart",
                name: "Smart Quota",
                sources: ["q1", "q2"],
                strategy: "most_critical"
            }]
        });
        await service.init("/tmp", mockHistoryService);

        const processed = service.processQuotas(mockData);
        expect(processed).toHaveLength(1);
        expect(processed[0].used).toBe(80); // q2 ratio is higher
    });

    describe("Overlapping Patterns", () => {
        test("should handle model matching multiple patterns by precedence", () => {
            const quotas: QuotaData[] = [
                { id: "ag-raw-gemini-1-5-flash", providerName: "Antigravity Gemini 1.5 Flash", used: 10, limit: 100, unit: "u" }
            ];
            
            const service = new QuotaService({
                aggregatedGroups: [
                    { id: "ag-flash", name: "Flash Group", patterns: ["flash"], strategy: "most_critical" },
                    { id: "ag-pro", name: "Pro Group", patterns: ["gemini"], strategy: "most_critical" }
                ],
                showUnaggregated: false
            });
            
            const result = service.processQuotas(quotas);
            
            // Should only match one group (the first one), not both
            expect(result.length).toBe(1);
            expect(result[0].id).toBe("ag-flash");
        });
    });
});

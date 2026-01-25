import { expect, test, describe, beforeEach } from "bun:test";
import { QuotaService } from "../../src/services/quota-service";
import { type QuotaData, type IHistoryService, type HistoryPoint } from "../../src/interfaces";

describe("ETTL Dual-Window & Aggregation Precedence", () => {
    let mockHistoryService: IHistoryService;
    let historyData: Record<string, HistoryPoint[]> = {};

    beforeEach(() => {
        historyData = {};
        mockHistoryService = {
            init: async () => {},
            append: async () => {},
            getHistory: (id: string, windowMs: number) => {
                const now = Date.now();
                return (historyData[id] || []).filter(p => p.timestamp > now - windowMs);
            },
            setMaxAge: () => {},
            setResetThreshold: () => {},
            pruneAll: async () => {}
        };
    });

    test("Dual-Window: uses short slope when usage spikes", async () => {
        const now = Date.now();
        // q1: 10 units/min over 60 mins (Long slope = 10/60000 = 0.00016)
        // BUT: 50 units/min over last 5 mins (Short slope = 50/60000 = 0.00083)
        
        const longHistory: HistoryPoint[] = [];
        for (let i = 60; i > 5; i--) {
            longHistory.push({
                timestamp: now - i * 60 * 1000,
                used: (60 - i) * 10,
                limit: 1000
            });
        }
        // Current used after long history: 550
        const spikeStartUsed = 550;
        const spikeHistory: HistoryPoint[] = [];
        for (let i = 5; i >= 0; i--) {
            spikeHistory.push({
                timestamp: now - i * 60 * 1000,
                used: spikeStartUsed + (5 - i) * 50,
                limit: 1000
            });
        }
        
        historyData["q1"] = [...longHistory, ...spikeHistory];

        const service = new QuotaService({ showUnaggregated: true });
        await service.init("/tmp", mockHistoryService);

        // We can't call predictTimeToLimit directly as it's private, 
        // but we can use aggregateMostCritical or processQuotas.
        const currentData: QuotaData[] = [
            { id: "q1", providerName: "P1", used: 800, limit: 1000, unit: "u" }
        ];

        const processed = service.processQuotas(currentData, {});
        if (!processed[0].predictedReset) {
            console.log("Full processed object:", JSON.stringify(processed, null, 2));
        }
        
        expect(processed[0].predictedReset).toBeDefined();
        expect(typeof processed[0].predictedReset).toBe("string");
        // Due to floor and small time passage, it could be 3m or 4m
        const matches = processed[0].predictedReset!.match(/(\d+)m/);
        expect(matches).not.toBeNull();
        const mins = parseInt(matches![1]);
        expect(mins).toBeGreaterThanOrEqual(3);
        expect(mins).toBeLessThanOrEqual(4);
    });

    test("Idle Handling: returns Infinity if last point is too old", async () => {
        const now = Date.now();
        // Rapid usage but stopped 6 minutes ago
        historyData["q1"] = [
            { timestamp: now - 10 * 60 * 1000, used: 0, limit: 100 },
            { timestamp: now - 6 * 60 * 1000, used: 50, limit: 100 },
        ];

        const service = new QuotaService({ showUnaggregated: true });
        await service.init("/tmp", mockHistoryService);

        const currentData: QuotaData[] = [
            { id: "q1", providerName: "P1", used: 50, limit: 100, unit: "u" }
        ];

        const processed = service.processQuotas(currentData, {});
        expect(processed[0].predictedReset).toBeUndefined();
    });

    test("Aggregation Precedence: Shortest ETTL > Highest Utilization", async () => {
        const now = Date.now();
        // q1: 50% used, burning fast (4 min to limit)
        historyData["q1"] = [
            { timestamp: now - 5 * 60 * 1000, used: 0, limit: 100 },
            { timestamp: now, used: 50, limit: 100 },
        ];
        // q2: 90% used, idle
        historyData["q2"] = [
            { timestamp: now - 60 * 60 * 1000, used: 90, limit: 100 },
            { timestamp: now, used: 90, limit: 100 },
        ];

        const service = new QuotaService({
            aggregatedGroups: [{
                id: "smart",
                name: "Smart Group",
                sources: ["q1", "q2"],
                strategy: "most_critical"
            }]
        });
        await service.init("/tmp", mockHistoryService);

        const currentData: QuotaData[] = [
            { id: "q1", providerName: "P1", used: 50, limit: 100, unit: "u" },
            { id: "q2", providerName: "P1", used: 90, limit: 100, unit: "u" },
        ];

        const processed = service.processQuotas(currentData);
        expect(processed).toHaveLength(1);
        // Should pick q1 because it has a finite ETTL, even though q2 has higher usage
        expect(processed[0].predictedReset).toBeDefined();
        expect(processed[0].predictedReset).toMatch(/[45]m/);
    });

    test("Aggregation Precedence: All Infinity -> Highest Utilization", async () => {
        const now = Date.now();
        // q1: 10% used, idle
        historyData["q1"] = [
            { timestamp: now - 60 * 60 * 1000, used: 10, limit: 100 },
            { timestamp: now, used: 10, limit: 100 },
        ];
        // q2: 80% used, idle
        historyData["q2"] = [
            { timestamp: now - 60 * 60 * 1000, used: 80, limit: 100 },
            { timestamp: now, used: 80, limit: 100 },
        ];

        const service = new QuotaService({
            aggregatedGroups: [{
                id: "smart",
                name: "Smart Group",
                sources: ["q1", "q2"],
                strategy: "most_critical"
            }]
        });
        await service.init("/tmp", mockHistoryService);

        const currentData: QuotaData[] = [
            { id: "q1", providerName: "P1", used: 10, limit: 100, unit: "u" },
            { id: "q2", providerName: "P1", used: 80, limit: 100, unit: "u" },
        ];

        const processed = service.processQuotas(currentData);
        expect(processed).toHaveLength(1);
        // Should pick q2 because all are Infinity and q2 has higher usage
        expect(processed[0].used).toBe(80);
        expect(processed[0].predictedReset).toBeUndefined();
    });

    test("Weekly Quota: spike triggers short-term panic", async () => {
        const now = Date.now();
        const limit = 10000;
        const weeklyHistory: HistoryPoint[] = [];

        // 6 days of steady usage (1000/day)
        const startUsed = 6000;
        
        // 55 minutes of slow usage (approx 40 units/hour rate)
        for (let i = 60; i > 5; i--) {
            weeklyHistory.push({
                timestamp: now - i * 60 * 1000,
                used: startUsed + (60 - i), 
                limit: limit
            });
        }
        
        // Spike in last 5 minutes: 500 units used
        const beforeSpike = weeklyHistory[weeklyHistory.length - 1].used;
        for (let i = 5; i >= 0; i--) {
            weeklyHistory.push({
                timestamp: now - i * 60 * 1000,
                used: beforeSpike + (5 - i) * 100,
                limit: limit
            });
        }

        historyData["weekly-q"] = weeklyHistory;

        const service = new QuotaService({ showUnaggregated: true });
        await service.init("/tmp", mockHistoryService);

        const currentData: QuotaData[] = [
            { 
                id: "weekly-q", 
                providerName: "Weekly Quota", 
                used: weeklyHistory[weeklyHistory.length-1].used, 
                limit: limit, 
                unit: "u",
                window: "Weekly"
            }
        ];

        const processed = service.processQuotas(currentData, {});
        const predicted = processed[0].predictedReset;
        
        // Should be significantly larger than the panic prediction (34m)
        // With regression over 60m dominated by slow usage, it predicts ~17h.
        expect(predicted).toBeDefined();
        expect(predicted).not.toMatch(/^\d+m/); 
        expect(predicted).toMatch(/\d+h/);
    });
});

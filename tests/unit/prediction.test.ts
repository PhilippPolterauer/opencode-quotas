import { expect, test, describe, beforeEach } from "bun:test";
import { QuotaService } from "../../src/services/quota-service";
import { type QuotaData, type IHistoryService, type HistoryPoint } from "../../src/interfaces";

describe("ETTL Prediction (Unit)", () => {
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

    test("Scenario A: Steady State - ensure ETTL is accurate", async () => {
        const now = Date.now();
        // 10 units per minute steady usage
        const history: HistoryPoint[] = [];
        for (let i = 30; i >= 0; i--) {
            history.push({
                timestamp: now - i * 60 * 1000,
                used: (30 - i) * 10,
                limit: 1000
            });
        }
        historyData["q1"] = history;

        const service = new QuotaService({ showUnaggregated: true });
        await service.init("/tmp", mockHistoryService);

        const currentData: QuotaData[] = [
            { id: "q1", providerName: "P1", used: 300, limit: 1000, unit: "u" }
        ];

        const processed = service.processQuotas(currentData);
        // Remaining: 700. Rate: 10/min. Time: 70 min.
        // Expecting "1h 10m" but allowing "1h 9m" due to millisecond jitter in tests
        expect(processed[0].predictedReset).toMatch(/1h (9|10)m/);
    });

    test("Scenario B: Burst - Verify ETTL reflects high usage rate (short window)", async () => {
        const now = Date.now();
        // 50 mins of 2 units/min (Low)
        // 10 mins of 50 units/min (High)
        
        const history: HistoryPoint[] = [];
        for (let i = 60; i > 10; i--) {
            history.push({
                timestamp: now - i * 60 * 1000,
                used: (60 - i) * 2,
                limit: 1000
            });
        }
        const usedAtBurstStart = (60 - 11) * 2; // 98
        for (let i = 10; i >= 0; i--) {
            history.push({
                timestamp: now - i * 60 * 1000,
                used: usedAtBurstStart + (10 - i) * 50,
                limit: 1000
            });
        }
        historyData["q1"] = history;

        const service = new QuotaService({ showUnaggregated: true });
        await service.init("/tmp", mockHistoryService);

        const currentData: QuotaData[] = [
            { id: "q1", providerName: "P1", used: usedAtBurstStart + 500, limit: 1000, unit: "u" }
        ];

        const processed = service.processQuotas(currentData);
        // Burst rate is 50/min. Remaining: ~400. Time: ~8 min.
        // Long rate is (600/60) = 10/min. Time: ~40 min.
        // Dual window should pick ~8 min.
        
        const matches = processed[0].predictedReset!.match(/(\d+)m/);
        expect(matches).not.toBeNull();
        const mins = parseInt(matches![1]);
        expect(mins).toBeLessThanOrEqual(10);
    });

    test("Scenario C: Idle - Verify ETTL is Infinity if usage stopped", async () => {
        const now = Date.now();
        // Rapid usage stopped 10 mins ago
        historyData["q1"] = [
            { timestamp: now - 20 * 60 * 1000, used: 0, limit: 100 },
            { timestamp: now - 10 * 60 * 1000, used: 80, limit: 100 },
        ];

        const service = new QuotaService({ showUnaggregated: true });
        await service.init("/tmp", mockHistoryService);

        const currentData: QuotaData[] = [
            { id: "q1", providerName: "P1", used: 80, limit: 100, unit: "u" }
        ];

        const processed = service.processQuotas(currentData);
        expect(processed[0].predictedReset).toBeUndefined();
    });
});

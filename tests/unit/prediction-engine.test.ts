import { expect, test, describe, beforeEach } from "bun:test";
import { LinearRegressionPredictionEngine, NullPredictionEngine } from "../../src/services/prediction-engine";
import { type IHistoryService, type HistoryPoint } from "../../src/interfaces";

describe("LinearRegressionPredictionEngine", () => {
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
            pruneAll: async () => {}
        };
    });

    describe("predictTimeToLimit", () => {
        test("returns Infinity when no history data is available", () => {
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine.predictTimeToLimit("unknown")).toBe(Infinity);
        });

        test("returns Infinity when only one history point exists", () => {
            const now = Date.now();
            historyData["q1"] = [
                { timestamp: now, used: 50, limit: 100 }
            ];
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine.predictTimeToLimit("q1")).toBe(Infinity);
        });

        test("returns Infinity when usage is stable (zero slope)", () => {
            const now = Date.now();
            historyData["q1"] = [
                { timestamp: now - 60 * 60 * 1000, used: 50, limit: 100 },
                { timestamp: now, used: 50, limit: 100 }
            ];
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine.predictTimeToLimit("q1")).toBe(Infinity);
        });

        test("returns Infinity when usage is decreasing (negative slope)", () => {
            const now = Date.now();
            historyData["q1"] = [
                { timestamp: now - 10 * 60 * 1000, used: 80, limit: 100 },
                { timestamp: now, used: 50, limit: 100 }
            ];
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine.predictTimeToLimit("q1")).toBe(Infinity);
        });

        test("returns Infinity when last point is older than idle timeout", () => {
            const now = Date.now();
            historyData["q1"] = [
                { timestamp: now - 20 * 60 * 1000, used: 0, limit: 100 },
                { timestamp: now - 10 * 60 * 1000, used: 50, limit: 100 } // 10 min old
            ];
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine.predictTimeToLimit("q1")).toBe(Infinity);
        });

        test("returns 0 when usage already exceeds limit", () => {
            const now = Date.now();
            historyData["q1"] = [
                { timestamp: now - 1000, used: 90, limit: 100 },
                { timestamp: now, used: 105, limit: 100 }
            ];
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine.predictTimeToLimit("q1")).toBe(0);
        });

        test("returns Infinity when limit is null (unlimited)", () => {
            const now = Date.now();
            historyData["q1"] = [
                { timestamp: now - 1000, used: 50, limit: null },
                { timestamp: now, used: 60, limit: null }
            ];
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine.predictTimeToLimit("q1")).toBe(Infinity);
        });

        test("returns Infinity when limit is zero or negative (treated as unlimited)", () => {
            const now = Date.now();
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            
            historyData["q0"] = [
                { timestamp: now - 1000, used: 50, limit: 0 },
                { timestamp: now, used: 60, limit: 0 }
            ];
            expect(engine.predictTimeToLimit("q0")).toBe(Infinity);

            historyData["q-1"] = [
                { timestamp: now - 1000, used: 50, limit: -1 },
                { timestamp: now, used: 60, limit: -1 }
            ];
            expect(engine.predictTimeToLimit("q-1")).toBe(Infinity);
        });

        test("predicts time correctly for steady usage", () => {
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

            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            const time = engine.predictTimeToLimit("q1");
            
            // Remaining: 700 units, Rate: 10/min = 10/60000ms
            // Expected: 70 minutes = 4,200,000ms (with some tolerance)
            expect(time).toBeGreaterThan(60 * 60 * 1000); // > 60 min
            expect(time).toBeLessThan(80 * 60 * 1000);    // < 80 min
        });

        test("uses short window when detecting usage spike", () => {
            const now = Date.now();
            // 50 mins of slow usage (2 units/min), then 10 mins of fast (50 units/min)
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

            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            const time = engine.predictTimeToLimit("q1");
            
            // Burst rate is ~50/min. Remaining: ~400. Should be ~8 min
            // The dual-window approach should pick the higher slope
            expect(time).toBeLessThan(15 * 60 * 1000); // < 15 min (burst-aware)
        });

        test("respects custom shortWindowMinutes config", () => {
            const now = Date.now();
            historyData["q1"] = [
                { timestamp: now - 10 * 60 * 1000, used: 0, limit: 100 },
                { timestamp: now, used: 50, limit: 100 }
            ];

            const engine = new LinearRegressionPredictionEngine(mockHistoryService, {
                predictionShortWindowMinutes: 15
            });
            
            // Should use 15 min short window
            const time = engine.predictTimeToLimit("q1");
            expect(time).toBeGreaterThan(0);
            expect(time).toBeLessThan(Infinity);
        });

        test("respects custom idleTimeoutMs config", () => {
            const now = Date.now();
            // Last point is 3 minutes old
            historyData["q1"] = [
                { timestamp: now - 10 * 60 * 1000, used: 0, limit: 100 },
                { timestamp: now - 3 * 60 * 1000, used: 50, limit: 100 }
            ];

            // Default timeout is 5 min, so this should work
            const engine1 = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine1.predictTimeToLimit("q1")).toBeLessThan(Infinity);

            // With 2 min timeout, should return Infinity
            const engine2 = new LinearRegressionPredictionEngine(mockHistoryService, {
                idleTimeoutMs: 2 * 60 * 1000
            });
            expect(engine2.predictTimeToLimit("q1")).toBe(Infinity);
        });
    });

    describe("calculateSlope", () => {
        test("returns 0 for empty history", () => {
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine.calculateSlope([])).toBe(0);
        });

        test("returns 0 for single point", () => {
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            expect(engine.calculateSlope([
                { timestamp: 1000, used: 50, limit: 100 }
            ])).toBe(0);
        });

        test("calculates positive slope correctly", () => {
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            // 10 units per second increase
            const slope = engine.calculateSlope([
                { timestamp: 0, used: 0, limit: 100 },
                { timestamp: 1000, used: 10, limit: 100 },
                { timestamp: 2000, used: 20, limit: 100 }
            ]);
            expect(slope).toBeCloseTo(0.01, 5); // 10 units / 1000ms = 0.01
        });

        test("calculates negative slope correctly", () => {
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            const slope = engine.calculateSlope([
                { timestamp: 0, used: 100, limit: 100 },
                { timestamp: 1000, used: 90, limit: 100 },
                { timestamp: 2000, used: 80, limit: 100 }
            ]);
            expect(slope).toBeCloseTo(-0.01, 5);
        });

        test("returns 0 when all timestamps are the same", () => {
            const engine = new LinearRegressionPredictionEngine(mockHistoryService);
            const slope = engine.calculateSlope([
                { timestamp: 1000, used: 50, limit: 100 },
                { timestamp: 1000, used: 60, limit: 100 }
            ]);
            expect(slope).toBe(0);
        });
    });
});

describe("NullPredictionEngine", () => {
    test("always returns Infinity", () => {
        const engine = new NullPredictionEngine();
        expect(engine.predictTimeToLimit("any-id")).toBe(Infinity);
        expect(engine.predictTimeToLimit("another-id", 120)).toBe(Infinity);
        expect(engine.predictTimeToLimit("third-id", 60, 10)).toBe(Infinity);
    });
});

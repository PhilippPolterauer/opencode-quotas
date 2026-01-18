import { expect, test, describe } from "bun:test";
import { AggregationService } from "../../src/services/aggregation-service";
import { NullPredictionEngine } from "../../src/services/prediction-engine";
import { type QuotaData, type IPredictionEngine } from "../../src/interfaces";

describe("AggregationService", () => {
    const mockQuotas: QuotaData[] = [
        { id: "q1", providerName: "P1", used: 10, limit: 100, unit: "u" },
        { id: "q2", providerName: "P2", used: 80, limit: 100, unit: "u" },
        { id: "q3", providerName: "P3", used: 50, limit: 100, unit: "u" },
    ];

    describe("aggregateMax", () => {
        test("selects quota with highest usage ratio", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const result = service.aggregateMax(mockQuotas);
            expect(result.id).toBe("q2");
            expect(result.used).toBe(80);
        });

        test("handles quotas with null limits", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const quotasWithNull: QuotaData[] = [
                { id: "q1", providerName: "P1", used: 50, limit: null, unit: "u" },
                { id: "q2", providerName: "P2", used: 30, limit: 100, unit: "u" },
            ];
            const result = service.aggregateMax(quotasWithNull);
            // q1 has ratio 0 (null limit), q2 has ratio 0.3
            expect(result.id).toBe("q2");
        });

        test("handles quotas with zero or negative limits (treated as unlimited)", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const quotas: QuotaData[] = [
                { id: "q1", providerName: "P1", used: 100, limit: 0, unit: "u" },
                { id: "q2", providerName: "P2", used: 100, limit: -1, unit: "u" },
                { id: "q3", providerName: "P3", used: 10, limit: 100, unit: "u" },
            ];
            const result = service.aggregateMax(quotas);
            // q1 and q2 have ratio 0, q3 has 0.1
            expect(result.id).toBe("q3");
        });

        test("returns last when all ratios equal (reduce behavior)", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const equalQuotas: QuotaData[] = [
                { id: "q1", providerName: "P1", used: 50, limit: 100, unit: "u" },
                { id: "q2", providerName: "P2", used: 50, limit: 100, unit: "u" },
            ];
            const result = service.aggregateMax(equalQuotas);
            // reduce returns the accumulator when equal, so stays with first element
            // but since aRatio > bRatio is false when equal, b is not returned
            // Actually, when equal, aRatio > bRatio is false, so we return a (first)
            // Wait, let's trace: reduce((a, b) => aRatio > bRatio ? a : b)
            // q1 vs q2: 0.5 > 0.5 = false, so return b (q2)
            expect(result.id).toBe("q2");
        });
    });

    describe("aggregateMin", () => {
        test("selects quota with lowest usage ratio", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const result = service.aggregateMin(mockQuotas);
            expect(result.id).toBe("q1");
            expect(result.used).toBe(10);
        });

        test("handles quotas with null limits", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const quotasWithNull: QuotaData[] = [
                { id: "q1", providerName: "P1", used: 50, limit: null, unit: "u" },
                { id: "q2", providerName: "P2", used: 30, limit: 100, unit: "u" },
            ];
            const result = service.aggregateMin(quotasWithNull);
            // q1 has ratio 0 (null limit), q2 has ratio 0.3
            expect(result.id).toBe("q1");
        });
    });

    describe("aggregateAverage (mean)", () => {
        test("calculates mean of usage ratios", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const result = service.aggregateAverage(
                mockQuotas, 
                "Average Group", 
                "avg-group", 
                "mean"
            );
            
            // Ratios: 0.1, 0.8, 0.5 -> Mean: (0.1 + 0.8 + 0.5) / 3 = 0.4666...
            expect(result.id).toBe("avg-group");
            expect(result.providerName).toBe("Average Group");
            expect(result.used).toBe(47); // Math.round(46.66...)
            expect(result.limit).toBe(100);
            expect(result.unit).toBe("%");
            expect(result.info).toBe("Aggregated");
        });

        test("handles single quota", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const singleQuota: QuotaData[] = [
                { id: "q1", providerName: "P1", used: 30, limit: 100, unit: "u" },
            ];
            const result = service.aggregateAverage(
                singleQuota, 
                "Single", 
                "single", 
                "mean"
            );
            expect(result.used).toBe(30);
        });
    });

    describe("aggregateAverage (median)", () => {
        test("calculates median of usage ratios for odd count", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const result = service.aggregateAverage(
                mockQuotas, 
                "Median Group", 
                "med-group", 
                "median"
            );
            
            // Ratios sorted: 0.1, 0.5, 0.8 -> Median: 0.5
            expect(result.used).toBe(50);
        });

        test("calculates median for even count (takes floor middle)", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const evenQuotas: QuotaData[] = [
                { id: "q1", providerName: "P1", used: 10, limit: 100, unit: "u" },
                { id: "q2", providerName: "P2", used: 30, limit: 100, unit: "u" },
                { id: "q3", providerName: "P3", used: 60, limit: 100, unit: "u" },
                { id: "q4", providerName: "P4", used: 80, limit: 100, unit: "u" },
            ];
            const result = service.aggregateAverage(
                evenQuotas, 
                "Median", 
                "med", 
                "median"
            );
            // Ratios sorted: 0.1, 0.3, 0.6, 0.8 -> floor(4/2) = 2 -> 0.6
            expect(result.used).toBe(60);
        });
    });

    describe("aggregateMostCritical", () => {
        test("falls back to max when prediction engine returns Infinity", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const result = service.aggregateMostCritical(mockQuotas);
            
            // NullPredictionEngine always returns Infinity, so should fall back to max
            expect(result).not.toBeNull();
            expect(result!.used).toBe(80);
        });

        test("returns null for empty array", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const result = service.aggregateMostCritical([]);
            expect(result).toBeNull();
        });

        test("selects quota with shortest time-to-limit", () => {
            // Create a mock prediction engine that returns specific times
            const mockPredictionEngine: IPredictionEngine = {
                predictTimeToLimit: (quotaId: string): number => {
                    if (quotaId === "q1") return 1000;      // 1 second (most critical)
                    if (quotaId === "q2") return 5000;      // 5 seconds
                    if (quotaId === "q3") return Infinity;  // Never
                    return Infinity;
                }
            };

            const service = new AggregationService(mockPredictionEngine);
            const result = service.aggregateMostCritical(mockQuotas);
            
            expect(result).not.toBeNull();
            expect(result!.id).toBe("q1");
            expect(result!.predictedReset).toContain("predicted");
        });

        test("passes window parameters to prediction engine", () => {
            let receivedWindow: number | undefined;
            let receivedShortWindow: number | undefined;

            const mockPredictionEngine: IPredictionEngine = {
                predictTimeToLimit: (
                    quotaId: string, 
                    windowMinutes?: number, 
                    shortWindowMinutes?: number
                ): number => {
                    receivedWindow = windowMinutes;
                    receivedShortWindow = shortWindowMinutes;
                    return Infinity;
                }
            };

            const service = new AggregationService(mockPredictionEngine);
            service.aggregateMostCritical(mockQuotas, 120, 15);
            
            expect(receivedWindow).toBe(120);
            expect(receivedShortWindow).toBe(15);
        });

        test("adds predicted reset time to representative quota", () => {
            const mockPredictionEngine: IPredictionEngine = {
                predictTimeToLimit: (): number => 10 * 60 * 1000 // 10 minutes
            };

            const service = new AggregationService(mockPredictionEngine);
            const result = service.aggregateMostCritical(mockQuotas.slice(0, 1));
            
            expect(result).not.toBeNull();
            expect(result!.predictedReset).toBe("in 10m (predicted)");
        });

        test("does not add predicted reset when all quotas have Infinity time", () => {
            const service = new AggregationService(new NullPredictionEngine());
            const result = service.aggregateMostCritical(mockQuotas);
            
            // Falls back to max, no predictedReset should be set from aggregation
            // (it might have one from the original quota, but not from "in X (predicted)" format)
            expect(result).not.toBeNull();
            // The result is the original quota (q2), which doesn't have predictedReset
            expect(result!.predictedReset).toBeUndefined();
        });
    });
});

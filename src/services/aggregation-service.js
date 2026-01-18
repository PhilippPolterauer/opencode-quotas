import { formatDurationMs } from "../utils/time";
/**
 * Service for aggregating multiple quota sources into a single representative quota.
 *
 * Supports multiple aggregation strategies:
 * - most_critical: Selects the quota with shortest predicted time-to-limit
 * - max: Selects the quota with highest usage ratio
 * - min: Selects the quota with lowest usage ratio
 * - mean: Creates a synthetic quota with average usage ratio
 * - median: Creates a synthetic quota with median usage ratio
 */
export class AggregationService {
    predictionEngine;
    constructor(predictionEngine) {
        this.predictionEngine = predictionEngine;
    }
    /**
     * Aggregates quotas using the most critical (shortest time-to-limit) strategy.
     * Falls back to max usage ratio if no predictions are available.
     */
    aggregateMostCritical(quotas, windowMinutes = 60, shortWindowMinutes) {
        if (quotas.length === 0)
            return null;
        let minTime = Infinity;
        let representative = null;
        for (const q of quotas) {
            const time = this.predictionEngine.predictTimeToLimit(q.id, windowMinutes, shortWindowMinutes);
            if (time < minTime) {
                minTime = time;
                representative = q;
            }
        }
        // Fallback to max usage if no prediction is possible
        if (!representative) {
            return this.aggregateMax(quotas);
        }
        if (minTime !== Infinity) {
            return {
                ...representative,
                predictedReset: `in ${formatDurationMs(minTime)} (predicted)`
            };
        }
        return representative;
    }
    /**
     * Aggregates quotas by selecting the one with highest usage ratio.
     */
    aggregateMax(quotas) {
        return quotas.reduce((a, b) => {
            const aRatio = a.limit !== null && a.limit > 0 ? a.used / a.limit : 0;
            const bRatio = b.limit !== null && b.limit > 0 ? b.used / b.limit : 0;
            return aRatio > bRatio ? a : b;
        });
    }
    /**
     * Aggregates quotas by selecting the one with lowest usage ratio.
     */
    aggregateMin(quotas) {
        return quotas.reduce((a, b) => {
            const aRatio = a.limit !== null && a.limit > 0 ? a.used / a.limit : 0;
            const bRatio = b.limit !== null && b.limit > 0 ? b.used / b.limit : 0;
            return aRatio < bRatio ? a : b;
        });
    }
    /**
     * Aggregates quotas by averaging their usage ratios.
     * Creates a synthetic quota with percentage-based representation.
     */
    aggregateAverage(quotas, name, id, strategy) {
        const ratios = quotas.map(q => q.limit !== null && q.limit > 0 ? q.used / q.limit : 0);
        let avgRatio = 0;
        if (strategy === "mean") {
            avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        }
        else {
            ratios.sort((a, b) => a - b);
            avgRatio = ratios[Math.floor(ratios.length / 2)];
        }
        return {
            id: id,
            providerName: name,
            used: Math.round(avgRatio * 100),
            limit: 100,
            unit: "%",
            info: "Aggregated"
        };
    }
}

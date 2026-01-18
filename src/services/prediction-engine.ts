import { type IPredictionEngine, type IHistoryService, type HistoryPoint } from "../interfaces";

/**
 * Configuration options for the prediction engine.
 */
export interface PredictionEngineConfig {
    /**
     * Default short time window for regression to capture spikes (minutes).
     * Defaults to 5.
     */
    predictionShortWindowMinutes?: number;
    
    /**
     * Idle timeout in milliseconds. If the last data point is older than this,
     * the prediction returns Infinity. Defaults to 5 minutes.
     */
    idleTimeoutMs?: number;
}

/**
 * Prediction engine using dual-window linear regression.
 * 
 * This implementation uses two time windows to calculate usage slopes:
 * - Long window: Captures overall trend (default: 60 minutes)
 * - Short window: Captures recent spikes (default: 5 minutes)
 * 
 * The maximum of the two slopes is used for conservative estimation.
 */
export class LinearRegressionPredictionEngine implements IPredictionEngine {
    private readonly historyService: IHistoryService;
    private readonly config: Required<PredictionEngineConfig>;

    constructor(historyService: IHistoryService, config?: PredictionEngineConfig) {
        this.historyService = historyService;
        this.config = {
            predictionShortWindowMinutes: config?.predictionShortWindowMinutes ?? 5,
            idleTimeoutMs: config?.idleTimeoutMs ?? 5 * 60 * 1000,
        };
    }

    /**
     * Predicts time to limit in milliseconds using a dual-window linear regression approach.
     * Returns Infinity if usage is decreasing, stable, or idle.
     */
    predictTimeToLimit(
        quotaId: string, 
        windowMinutes: number = 60, 
        shortWindowMinutes?: number
    ): number {
        const longWindowMs = windowMinutes * 60 * 1000;
        const shortWindowMin = shortWindowMinutes ?? this.config.predictionShortWindowMinutes;
        const shortWindowMs = shortWindowMin * 60 * 1000;

        const history = this.historyService.getHistory(quotaId, longWindowMs);
        if (history.length < 2) return Infinity;

        // Idle Handling: If the last history point is older than the idle timeout, 
        // assume usage has stopped.
        const lastPoint = history[history.length - 1];
        const now = Date.now();
        if (now - lastPoint.timestamp > this.config.idleTimeoutMs) {
            return Infinity;
        }

        // Long Slope
        const mLong = this.calculateSlope(history);

        // Short Slope: most recent data in short window or last 15% of points
        const shortHistory = history.filter(p => p.timestamp > now - shortWindowMs);
        
        // Ensure we have enough points in short history, or take the last 15%
        let effectiveShortHistory = shortHistory;
        if (effectiveShortHistory.length < 2) {
            const fifteenPercentCount = Math.max(2, Math.ceil(history.length * 0.15));
            effectiveShortHistory = history.slice(-fifteenPercentCount);
        }

        const mShort = this.calculateSlope(effectiveShortHistory);

        // Conservative Estimation: use the maximum slope
        const m = Math.max(mLong, mShort);
        
        if (m <= 0) return Infinity;
        if (lastPoint.limit === null || lastPoint.limit <= 0) return Infinity;

        const remaining = lastPoint.limit - lastPoint.used;
        if (remaining <= 0) return 0;

        const msFromLastPoint = remaining / m;
        const elapsedSinceLastPoint = now - lastPoint.timestamp;
        
        return Math.max(0, msFromLastPoint - elapsedSinceLastPoint);
    }

    /**
     * Calculates the slope (usage per ms) using linear regression for the given history points.
     */
    calculateSlope(history: HistoryPoint[]): number {
        if (history.length < 2) return 0;

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = history.length;
        const firstTimestamp = history[0].timestamp;

        for (const p of history) {
            const x = p.timestamp - firstTimestamp;
            const y = p.used;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }

        const denominator = (n * sumX2 - sumX * sumX);
        if (denominator === 0) return 0;

        return (n * sumXY - sumX * sumY) / denominator;
    }
}

/**
 * A null prediction engine that always returns Infinity.
 * Used when no history service is available.
 */
export class NullPredictionEngine implements IPredictionEngine {
    predictTimeToLimit(
        _quotaId: string, 
        _windowMinutes: number = 60, 
        _shortWindowMinutes?: number
    ): number {
        return Infinity;
    }
}

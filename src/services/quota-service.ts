import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../defaults";
import { type QuotaConfig, type QuotaData, type IQuotaProvider, type IHistoryService } from "../interfaces";
import { getQuotaRegistry } from "../registry";
import { createAntigravityProvider } from "../providers/antigravity";
import { createCodexProvider } from "../providers/codex";
import { formatDurationMs } from "../utils/time";
import { logger } from "../logger";

export class QuotaService {
    private config: QuotaConfig;
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;
    private historyService?: IHistoryService;

    constructor(initialConfig?: Partial<QuotaConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...initialConfig };
        // Deep clone specific nested objects to avoid mutation of the constant
        if (DEFAULT_CONFIG.progressBar) {
            this.config.progressBar = { ...DEFAULT_CONFIG.progressBar, ...initialConfig?.progressBar };
        }
        if (DEFAULT_CONFIG.groups) {
             this.config.groups = { ...DEFAULT_CONFIG.groups, ...initialConfig?.groups };
        }
        if (DEFAULT_CONFIG.aggregatedGroups) {
            this.config.aggregatedGroups = [ ...DEFAULT_CONFIG.aggregatedGroups, ...(initialConfig?.aggregatedGroups || []) ];
        }
    }

    async init(directory: string, historyService?: IHistoryService): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            this.historyService = historyService;

            // Load config from disk
            try {
                const envConfigPath = process.env.OPENCODE_QUOTAS_CONFIG_PATH;
                const configPath = envConfigPath || join(directory, ".opencode", "quotas.json");
                const rawConfig = await readFile(configPath, "utf-8");
                const userConfig = JSON.parse(rawConfig);
                
                // Merge user config
                if (userConfig.debug !== undefined) {
                    this.config.debug = userConfig.debug;
                    logger.setDebug(!!this.config.debug);
                }

                logger.debug(
                    "init:config_loaded",
                    { configPath, debug: this.config.debug },
                );
                if (userConfig.footer !== undefined) {
                    this.config.footer = userConfig.footer;
                }
                if (userConfig.progressBar && userConfig.progressBar.color !== undefined) {
                     if (!this.config.progressBar) this.config.progressBar = {};
                     this.config.progressBar.color = userConfig.progressBar.color;
                }
                if (userConfig.table) {
                    this.config.table = userConfig.table;
                }
                if (userConfig.groups) {
                    this.config.groups = userConfig.groups;
                }
                if (userConfig.disabled) {
                    this.config.disabled = userConfig.disabled;
                }
                if (userConfig.modelMapping) {
                    this.config.modelMapping = userConfig.modelMapping;
                }
                if (userConfig.aggregatedGroups) {
                    this.config.aggregatedGroups = userConfig.aggregatedGroups;
                }
                if (userConfig.historyMaxAgeHours !== undefined) {
                    this.config.historyMaxAgeHours = userConfig.historyMaxAgeHours;
                }
                if (userConfig.pollingInterval !== undefined) {
                    this.config.pollingInterval = userConfig.pollingInterval;
                }
                if (userConfig.predictionShortWindowMinutes !== undefined) {
                    this.config.predictionShortWindowMinutes = userConfig.predictionShortWindowMinutes;
                }

            } catch (e) {
                // Ignore missing config or parse errors
                logger.error(
                    "init:config_load_failed",
                    { error: e },
                );
            }

            if (this.historyService && this.config.historyMaxAgeHours !== undefined) {
                this.historyService.setMaxAge(this.config.historyMaxAgeHours);
            }

            const registry = getQuotaRegistry();

            // Register Antigravity
            try {
                const agGroups = this.config.groups?.antigravity;
                registry.register(
                    createAntigravityProvider(agGroups, {
                        debug: !!this.config.debug,
                    }),
                );
                logger.debug("init:provider_registered", { id: "antigravity" });
            } catch (e) {
                logger.error("init:provider_failed", { id: "antigravity", error: e });
                console.warn("[QuotaService] Failed to initialize Antigravity provider:", e);
            }

            // Register Codex
            try {
                registry.register(createCodexProvider());
                logger.debug("init:provider_registered", { id: "codex" });
            } catch (e) {
                logger.error("init:provider_failed", { id: "codex", error: e });
                console.warn("[QuotaService] Failed to initialize Codex provider:", e);
            }

            this.initialized = true;
        })();
        
        return this.initPromise;
    }

    getConfig(): QuotaConfig {
        return this.config;
    }

    getProviders(): IQuotaProvider[] {
        return getQuotaRegistry().getAll();
    }

    async getQuotas(context?: { providerId?: string; modelId?: string }): Promise<QuotaData[]> {
        const providers = this.getProviders();

        logger.debug(
            "quota_service:get_quotas_start",
            { providerCount: providers.length, ids: providers.map((p) => p.id) },
        );
        
        if (providers.length === 0) return [];

        const results = await Promise.all(
            providers.map(async (p: IQuotaProvider) => {
                const startedAt = Date.now();
                try {
                    logger.debug(
                        "quota_service:provider_fetch_start",
                        { id: p.id },
                    );
                    const result = await p.fetchQuota();
                    logger.debug(
                        "quota_service:provider_fetch_ok",
                        { id: p.id, count: result.length, durationMs: Date.now() - startedAt },
                    );
                    return result;
                } catch (e) {
                    logger.error(
                        "quota_service:provider_fetch_error",
                        { id: p.id, durationMs: Date.now() - startedAt, error: e },
                    );
                    console.error(`Provider ${p.id} failed:`, e);
                    return [];
                }
            })
        );

        const processed = this.processQuotas(results.flat(), context);
        logger.debug(
            "quota_service:get_quotas_end",
            { totalCount: processed.length },
        );
        return processed;
    }

    processQuotas(data: QuotaData[], context?: { providerId?: string; modelId?: string }): QuotaData[] {
        let results = [...data];

        // 1. Enrich with predictions (before aggregation so sources have it too)
        results = results.map(q => {
            const time = this.predictTimeToLimit(q.id, 60);
            if (time !== Infinity) {
                return {
                    ...q,
                    predictedReset: `${formatDurationMs(time)} (predicted)`
                };
            }
            return q;
        });

        // 2. Apply Aggregation
        results = this.applyAggregation(results);

        // 3. Filter (Disabled & Model Mapping). If requested, perform model-strict filtering.
        results = this.filterQuotas(results, context);

        // 4. Sort
        results = this.sortQuotas(results);

        return results;
    }

    private applyAggregation(quotas: QuotaData[]): QuotaData[] {
        if (!this.config.aggregatedGroups || this.config.aggregatedGroups.length === 0) {
            return quotas;
        }

        let results = [...quotas];

        for (const group of this.config.aggregatedGroups) {
            const sourceQuotas = results.filter(q => group.sources.includes(q.id));
            if (sourceQuotas.length === 0) continue;

            const strategy = group.strategy || "most_critical";
            let representative: QuotaData | null = null;

            if (strategy === "most_critical") {
                representative = this.aggregateMostCritical(
                    sourceQuotas, 
                    group.predictionWindowMinutes,
                    group.predictionShortWindowMinutes
                );
            } else if (strategy === "max") {

                representative = this.aggregateMax(sourceQuotas);
            } else if (strategy === "min") {
                representative = this.aggregateMin(sourceQuotas);
            } else if (strategy === "mean" || strategy === "median") {
                representative = this.aggregateAverage(sourceQuotas, group.name, group.id, strategy);
            }

            if (representative) {
                // Create a copy for display
                const displayQuota = { 
                    ...representative, 
                    id: group.id, 
                    providerName: group.name 
                };

                // Remove sources and add representative
                const sourceIds = new Set(group.sources);
                results = results.filter(q => !sourceIds.has(q.id));
                results.push(displayQuota);
            }
        }
        return results;
    }

    private aggregateMostCritical(quotas: QuotaData[], windowMinutes: number = 60, shortWindowMinutes?: number): QuotaData | null {
        let minTime = Infinity;
        let representative: QuotaData | null = null;

        for (const q of quotas) {
            const time = this.predictTimeToLimit(q.id, windowMinutes, shortWindowMinutes);
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

    private aggregateMax(quotas: QuotaData[]): QuotaData {
        return quotas.reduce((a, b) => {
            const aRatio = a.limit ? a.used / a.limit : 0;
            const bRatio = b.limit ? b.used / b.limit : 0;
            return aRatio > bRatio ? a : b;
        });
    }

    private aggregateMin(quotas: QuotaData[]): QuotaData {
        return quotas.reduce((a, b) => {
            const aRatio = a.limit ? a.used / a.limit : 0;
            const bRatio = b.limit ? b.used / b.limit : 0;
            return aRatio < bRatio ? a : b;
        });
    }

    private aggregateAverage(quotas: QuotaData[], name: string, id: string, strategy: "mean" | "median"): QuotaData {
        const ratios = quotas.map(q => q.limit ? q.used / q.limit : 0);
        let avgRatio = 0;
        if (strategy === "mean") {
            avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        } else {
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

    private filterQuotas(quotas: QuotaData[], context?: { providerId?: string; modelId?: string }): QuotaData[] {
        let results = [...quotas];

        // Filter out disabled quotas
        const disabledIds = new Set(this.config.disabled || []);
        results = results.filter((data) => !disabledIds.has(data.id));

        // If requested, apply model-aware filtering
        if (this.config.filterByCurrentModel && context && context.providerId && context.modelId) {
            const providerLower = context.providerId.toLowerCase();
            const modelIdLower = context.modelId.toLowerCase();

            // 1) Explicit mapping
            const currentModelKey = `${context.providerId}:${context.modelId}`;
            if (this.config.modelMapping && this.config.modelMapping[currentModelKey]) {
                const relevantIds = new Set(this.config.modelMapping[currentModelKey]);
                results = results.filter(data => relevantIds.has(data.id));
                return results;
            }

            // 2) Fuzzy token match: split model id to tokens and check if any token appears in quota id or providerName
            const tokens = modelIdLower.split(/[^a-z0-9]+/).filter(Boolean);
            const fuzzyMatches = results.filter(q => {
                const id = q.id.toLowerCase();
                const name = q.providerName.toLowerCase();
                return tokens.some(t => id.includes(t) || name.includes(t));
            });

            if (fuzzyMatches.length > 0) {
                results = fuzzyMatches;
                return results;
            }

            // 3) Provider fallback: show only quotas for same provider
            const matchesProvider = results.filter(q => q.providerName.toLowerCase().includes(providerLower));
            if (matchesProvider.length > 0) {
                results = matchesProvider;
            } else {
                // No matches at all; return empty to indicate strict filtering
                results = [];
            }

            return results;
        }

        // Model mapping filtering (existing behavior when filterByCurrentModel is false)
        if (context && context.providerId && context.modelId) {
             const currentModelKey = `${context.providerId}:${context.modelId}`;
             if (this.config.modelMapping && this.config.modelMapping[currentModelKey]) {
                const relevantIds = new Set(this.config.modelMapping[currentModelKey]);
                results = results.filter(data => relevantIds.has(data.id));
            } else if (this.config.modelMapping) {
                 // Fallback: match by provider ID
                 const providerLower = context.providerId.toLowerCase();
                 const matchesProvider = results.filter(q => 
                    q.providerName.toLowerCase().includes(providerLower)
                 );
                 
                 if (matchesProvider.length > 0) {
                     results = matchesProvider;
                 }
            }
        }
        return results;
    }

    private sortQuotas(quotas: QuotaData[]): QuotaData[] {
        return quotas.sort((a, b) => a.providerName.localeCompare(b.providerName));
    }

    /**
     * Calculates the slope (usage per ms) using linear regression for the given history points.
     */
    private calculateSlope(history: { timestamp: number; used: number }[]): number {
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

    /**
     * Predicts time to limit in milliseconds using a dual-window linear regression approach.
     * Returns Infinity if usage is decreasing, stable, or idle.
     */
    private predictTimeToLimit(quotaId: string, windowMinutes: number = 60, shortWindowMinutes?: number): number {
        if (!this.historyService) return Infinity;

        const longWindowMs = windowMinutes * 60 * 1000;
        const shortWindowMin = shortWindowMinutes ?? this.config.predictionShortWindowMinutes ?? 5;
        const shortWindowMs = shortWindowMin * 60 * 1000;

        const history = this.historyService.getHistory(quotaId, longWindowMs);
        if (history.length < 2) return Infinity;

        // Idle Handling: If the last history point is older than 5 minutes, assume usage has stopped.
        const lastPoint = history[history.length - 1];
        const now = Date.now();
        if (now - lastPoint.timestamp > 5 * 60 * 1000) {
            return Infinity;
        }

        // Long Slope
        const mLong = this.calculateSlope(history);

        // Short Slope: most recent 15% of data points or last 5 minutes (whichever contains sufficient data).
        // For simplicity and following the 5-min instruction:
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
        if (lastPoint.limit === null) return Infinity;

        const remaining = lastPoint.limit - lastPoint.used;
        if (remaining <= 0) return 0;

        const msFromLastPoint = remaining / m;
        const elapsedSinceLastPoint = now - lastPoint.timestamp;
        
        return Math.max(0, msFromLastPoint - elapsedSinceLastPoint);
    }
}

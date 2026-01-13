import { DEFAULT_CONFIG } from "../defaults";
import { 
    type QuotaConfig, 
    type QuotaData, 
    type IQuotaProvider, 
    type IHistoryService,
    type IPredictionEngine,
    type IAggregationService
} from "../interfaces";
import { getQuotaRegistry } from "../registry";
import { createAntigravityProvider } from "../providers/antigravity";
import { createCodexProvider } from "../providers/codex";
import { formatDurationMs } from "../utils/time";
import { logger } from "../logger";
import { LinearRegressionPredictionEngine, NullPredictionEngine } from "./prediction-engine";
import { AggregationService } from "./aggregation-service";
import { ConfigLoader } from "./config-loader";

export class QuotaService {
    private config: QuotaConfig;
    private initialized: boolean = false;
    private initPromise: Promise<void> | null = null;
    private historyService?: IHistoryService;
    private predictionEngine: IPredictionEngine;
    private aggregationService: IAggregationService;

    constructor(initialConfig?: Partial<QuotaConfig>) {
        this.config = ConfigLoader.createConfig(initialConfig);
        
        // Initialize with null prediction engine until init() is called
        this.predictionEngine = new NullPredictionEngine();
        this.aggregationService = new AggregationService(this.predictionEngine);
    }

    async init(directory: string, historyService?: IHistoryService): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            this.historyService = historyService;

            // Load config from disk
            this.config = await ConfigLoader.loadFromDisk(directory, this.config);

            if (this.historyService && this.config.historyMaxAgeHours !== undefined) {
                this.historyService.setMaxAge(this.config.historyMaxAgeHours);
            }

            // Initialize prediction engine with history service
            if (this.historyService) {
                this.predictionEngine = new LinearRegressionPredictionEngine(
                    this.historyService,
                    { predictionShortWindowMinutes: this.config.predictionShortWindowMinutes }
                );
            }
            // Re-initialize aggregation service with the new prediction engine
            this.aggregationService = new AggregationService(this.predictionEngine);

            // Register providers
            await this.registerProviders();

            this.initialized = true;
        })();
        
        return this.initPromise;
    }

    private async registerProviders(): Promise<void> {
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
    }

    getConfig(): QuotaConfig {
        return this.config;
    }

    getProviders(): IQuotaProvider[] {
        return getQuotaRegistry().getAll();
    }

    /**
     * Returns the prediction engine used by this service.
     * Useful for testing or for other services that need prediction capabilities.
     */
    getPredictionEngine(): IPredictionEngine {
        return this.predictionEngine;
    }

    /**
     * Returns the aggregation service used by this service.
     * Useful for testing or for other services that need aggregation capabilities.
     */
    getAggregationService(): IAggregationService {
        return this.aggregationService;
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
            const time = this.predictionEngine.predictTimeToLimit(q.id, 60);
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
                representative = this.aggregationService.aggregateMostCritical(
                    sourceQuotas, 
                    group.predictionWindowMinutes,
                    group.predictionShortWindowMinutes
                );
            } else if (strategy === "max") {
                representative = this.aggregationService.aggregateMax(sourceQuotas);
            } else if (strategy === "min") {
                representative = this.aggregationService.aggregateMin(sourceQuotas);
            } else if (strategy === "mean" || strategy === "median") {
                representative = this.aggregationService.aggregateAverage(
                    sourceQuotas, 
                    group.name, 
                    group.id, 
                    strategy
                );
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

    private filterQuotas(quotas: QuotaData[], context?: { providerId?: string; modelId?: string }): QuotaData[] {
        let results = [...quotas];

        // Filter out disabled quotas
        const disabledIds = new Set(this.config.disabled || []);
        results = results.filter((data) => !disabledIds.has(data.id));

        // If requested, apply model-aware filtering
        if (this.config.filterByCurrentModel && context && context.providerId && context.modelId) {
            return this.filterByModel(results, context.providerId, context.modelId);
        }

        // Model mapping filtering (existing behavior when filterByCurrentModel is false)
        if (context && context.providerId && context.modelId) {
             const currentModelKey = `${context.providerId}/${context.modelId}`;
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

    private filterByModel(quotas: QuotaData[], providerId: string, modelId: string): QuotaData[] {
        const providerLower = providerId.toLowerCase();
        const modelIdLower = modelId.toLowerCase();
        const currentModelKey = `${providerId}/${modelId}`;

        // 1) Explicit mapping
        if (this.config.modelMapping && this.config.modelMapping[currentModelKey]) {
            const relevantIds = new Set(this.config.modelMapping[currentModelKey]);
            return quotas.filter(data => relevantIds.has(data.id));
        }

        // 2) Fuzzy token match with scoring
        const tokens = modelIdLower.split(/[^a-z0-9]+/).filter(Boolean);
        const scoredMatches = quotas
            .map(q => {
                const id = q.id.toLowerCase();
                const name = q.providerName.toLowerCase();
                const score = tokens.reduce((acc, t) => acc + (id.includes(t) || name.includes(t) ? 1 : 0), 0);
                return { q, score };
            })
            .filter(m => m.score > 0)
            .sort((a, b) => b.score - a.score);

        if (scoredMatches.length > 0) {
            const maxScore = scoredMatches[0].score;
            return scoredMatches.filter(m => m.score === maxScore).map(m => m.q);
        }

        // 3) Provider fallback
        const matchesProvider = quotas.filter(q => 
            q.providerName.toLowerCase().includes(providerLower)
        );
        return matchesProvider.length > 0 ? matchesProvider : [];
    }

    private sortQuotas(quotas: QuotaData[]): QuotaData[] {
        return quotas.sort((a, b) => a.providerName.localeCompare(b.providerName));
    }
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../defaults";
import { type QuotaConfig, type QuotaData, type IQuotaProvider, type IHistoryService } from "../interfaces";
import { getQuotaRegistry } from "../registry";
import { createAntigravityProvider } from "../providers/antigravity";
import { createCodexProvider } from "../providers/codex";
import { formatDurationMs } from "../utils/time";

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
                }
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

            } catch (e) {
                // Ignore missing config or parse errors
            }

            if (this.historyService && this.config.historyMaxAgeHours !== undefined) {
                this.historyService.setMaxAge(this.config.historyMaxAgeHours);
            }

            const registry = getQuotaRegistry();

            // Register Antigravity
            try {
                const agGroups = this.config.groups?.antigravity;
                registry.register(createAntigravityProvider(agGroups));
            } catch (e) {
                console.warn("[QuotaService] Failed to initialize Antigravity provider:", e);
            }

            // Register Codex
            try {
                registry.register(createCodexProvider());
            } catch (e) {
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
        
        if (providers.length === 0) return [];

        const results = await Promise.all(
            providers.map(async (p: IQuotaProvider) => {
                try {
                    return await p.fetchQuota();
                } catch (e) {
                    console.error(`Provider ${p.id} failed:`, e);
                    return [];
                }
            })
        );

        return this.processQuotas(results.flat(), context);
    }

    processQuotas(data: QuotaData[], context?: { providerId?: string; modelId?: string }): QuotaData[] {
        let results = [...data];

        // 1. Apply Aggregation
        results = this.applyAggregation(results);

        // 2. Filter (Disabled & Model Mapping)
        results = this.filterQuotas(results, context);

        // 3. Sort
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
                representative = this.aggregateMostCritical(sourceQuotas, group.predictionWindowMinutes);
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

    private aggregateMostCritical(quotas: QuotaData[], windowMinutes: number = 60): QuotaData | null {
        let minTime = Infinity;
        let representative: QuotaData | null = null;

        for (const q of quotas) {
            const time = this.predictTimeToLimit(q.id, windowMinutes);
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

        // Model mapping filtering
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
     * Predicts time to limit in milliseconds using linear regression.
     * Returns Infinity if usage is decreasing or stable at 0.
     */
    private predictTimeToLimit(quotaId: string, windowMinutes: number = 60): number {
        if (!this.historyService) return Infinity;

        const windowMs = windowMinutes * 60 * 1000;
        let history = this.historyService.getHistory(quotaId, windowMs);

        // Fallback: If 1-hour history is not possible (insufficient data or gaps),
        // use the oldest time point available.
        const currentSpan = history.length >= 2 
            ? history[history.length - 1].timestamp - history[0].timestamp
            : 0;
            
        // If we have less than 2 points, OR the span is significantly less than the requested window
        // (e.g. < 90%), try to fetch the full history to find older points.
        if (history.length < 2 || currentSpan < windowMs * 0.9) {
            // Fetch everything (up to ~30 days, essentially unlimited relative to cache size)
            const fullHistory = this.historyService.getHistory(quotaId, 30 * 24 * 60 * 60 * 1000);
            
            // Only switch if we actually found more useful data
            // (either more points, or an older start time)
            if (fullHistory.length > history.length) {
                history = fullHistory;
            } else if (fullHistory.length > 0 && history.length > 0 && 
                       fullHistory[0].timestamp < history[0].timestamp) {
                history = fullHistory;
            }
        }

        if (history.length < 2) return Infinity;

        // Simple linear regression: y = mx + b
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
        if (denominator === 0) return Infinity;

        const m = (n * sumXY - sumX * sumY) / denominator; // Slope (usage per ms)
        
        if (m <= 0) return Infinity; // Usage is not increasing

        const lastPoint = history[history.length - 1];
        if (lastPoint.limit === null) return Infinity;

        const remaining = lastPoint.limit - lastPoint.used;
        if (remaining <= 0) return 0; // Already hit limit

        return remaining / m; // ms until limit
    }
}

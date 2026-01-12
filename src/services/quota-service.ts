import { readFileSync } from "node:fs";
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

        this.historyService = historyService;

        // Load config from disk
        try {
            const envConfigPath = process.env.OPENCODE_QUOTAS_CONFIG_PATH;
            const configPath = envConfigPath || join(directory, ".opencode", "quotas.json");
            const rawConfig = readFileSync(configPath, "utf-8");
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
        let flatResults = [...data];

        // Apply Aggregation Groups
        if (this.config.aggregatedGroups && this.config.aggregatedGroups.length > 0) {
            for (const group of this.config.aggregatedGroups) {
                const sourceQuotas = flatResults.filter(q => group.sources.includes(q.id));
                if (sourceQuotas.length === 0) continue;

                const strategy = group.strategy || "most_critical";
                let representative: QuotaData | null = null;

                if (strategy === "most_critical") {
                    let minTime = Infinity;
                    for (const q of sourceQuotas) {
                        const time = this.predictTimeToLimit(q.id, group.predictionWindowMinutes || 60);
                        if (time < minTime) {
                            minTime = time;
                            representative = q;
                        }
                    }
                    // Fallback to max usage if no prediction is possible
                    if (!representative) {
                        representative = sourceQuotas.reduce((a, b) => {
                            const aRatio = a.limit ? a.used / a.limit : 0;
                            const bRatio = b.limit ? b.used / b.limit : 0;
                            return aRatio > bRatio ? a : b;
                        });
                    } else if (minTime !== Infinity) {
                        // Store prediction in the representative
                        representative = {
                            ...representative,
                            predictedReset: `in ${formatDurationMs(minTime)} (predicted)`
                        };
                    }
                } else if (strategy === "max") {
                    representative = sourceQuotas.reduce((a, b) => {
                        const aRatio = a.limit ? a.used / a.limit : 0;
                        const bRatio = b.limit ? b.used / b.limit : 0;
                        return aRatio > bRatio ? a : b;
                    });
                } else if (strategy === "min") {
                    representative = sourceQuotas.reduce((a, b) => {
                        const aRatio = a.limit ? a.used / a.limit : 0;
                        const bRatio = b.limit ? b.used / b.limit : 0;
                        return aRatio < bRatio ? a : b;
                    });
                } else if (strategy === "mean" || strategy === "median") {
                    const ratios = sourceQuotas.map(q => q.limit ? q.used / q.limit : 0);
                    let avgRatio = 0;
                    if (strategy === "mean") {
                        avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
                    } else {
                        ratios.sort((a, b) => a - b);
                        avgRatio = ratios[Math.floor(ratios.length / 2)];
                    }
                    
                    representative = {
                        id: group.id,
                        providerName: group.name,
                        used: Math.round(avgRatio * 100),
                        limit: 100,
                        unit: "%",
                        info: "Aggregated"
                    };
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
                    flatResults = flatResults.filter(q => !sourceIds.has(q.id));
                    flatResults.push(displayQuota);
                }
            }
        }

        // Filter out disabled quotas
        const disabledIds = new Set(this.config.disabled || []);
        flatResults = flatResults.filter((data) => !disabledIds.has(data.id));

        // Model mapping filtering
        if (context && context.providerId && context.modelId) {
             const currentModelKey = `${context.providerId}:${context.modelId}`;
             if (this.config.modelMapping && this.config.modelMapping[currentModelKey]) {
                const relevantIds = new Set(this.config.modelMapping[currentModelKey]);
                flatResults = flatResults.filter(data => relevantIds.has(data.id));
            } else if (this.config.modelMapping) {
                 // Fallback: match by provider ID
                 const providerLower = context.providerId.toLowerCase();
                 const matchesProvider = flatResults.filter(q => 
                    q.providerName.toLowerCase().includes(providerLower)
                 );
                 
                 if (matchesProvider.length > 0) {
                     flatResults = matchesProvider;
                 }
            }
        }

        // Sort
        flatResults.sort((a, b) => a.providerName.localeCompare(b.providerName));

        return flatResults;
    }

    /**
     * Predicts time to limit in milliseconds using linear regression.
     * Returns Infinity if usage is decreasing or stable at 0.
     */
    private predictTimeToLimit(quotaId: string, windowMinutes: number = 60): number {
        if (!this.historyService) return Infinity;

        const history = this.historyService.getHistory(quotaId, windowMinutes * 60 * 1000);
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

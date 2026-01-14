import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../defaults";
import { type QuotaConfig } from "../interfaces";
import { logger } from "../logger";

import { validatePollingInterval } from "../utils/validation";

/**
 * Configuration loading and merging service.
 * Handles reading config from disk and merging with defaults.
 */
export class ConfigLoader {
    /**
     * Creates a new configuration by merging defaults with initial config.
     */
    static createConfig(initialConfig?: Partial<QuotaConfig>): QuotaConfig {
        const config: QuotaConfig = { ...DEFAULT_CONFIG, ...initialConfig };
        
        // Deep clone specific nested objects to avoid mutation of the constant
        if (DEFAULT_CONFIG.progressBar) {
            config.progressBar = { ...DEFAULT_CONFIG.progressBar, ...initialConfig?.progressBar };
        }
        // Aggregated groups: if provided in the initial config, replace defaults;
        // otherwise clone the defaults to avoid mutating the constant.
        if (initialConfig?.aggregatedGroups !== undefined) {
            config.aggregatedGroups = initialConfig.aggregatedGroups.map(g => ({ ...g }));
        } else if (DEFAULT_CONFIG.aggregatedGroups) {
            config.aggregatedGroups = DEFAULT_CONFIG.aggregatedGroups.map(g => ({ ...g }));
        }
        
        return config;
    }

    /**
     * Loads and merges user configuration from disk into the provided config.
     * Returns the updated config.
     */
    static async loadFromDisk(
        directory: string, 
        config: QuotaConfig
    ): Promise<QuotaConfig> {
        const result = { ...config };
        
        try {
            const envConfigPath = process.env.OPENCODE_QUOTAS_CONFIG_PATH;
            const configPath = envConfigPath || join(directory, ".opencode", "quotas.json");
            const rawConfig = await readFile(configPath, "utf-8");
            const userConfig = JSON.parse(rawConfig);
            
            ConfigLoader.mergeUserConfig(result, userConfig);
            
            logger.debug(
                "init:config_loaded",
                { configPath, debug: result.debug },
            );

        } catch (e) {
            // Ignore missing config or parse errors
            logger.error(
                "init:config_load_failed",
                { error: e },
            );
        }

        // Validate and normalize config values
        await ConfigLoader.validateConfig(result);
        
        return result;
    }

    /**
     * Merges user configuration into the target config.
     */
    private static mergeUserConfig(target: QuotaConfig, userConfig: Partial<QuotaConfig>): void {
        if (userConfig.debug !== undefined) {
            target.debug = userConfig.debug;
            logger.setDebug(!!target.debug);
        }
        if (userConfig.footer !== undefined) {
            target.footer = userConfig.footer;
        }
        if (userConfig.showFooterTitle !== undefined) {
            target.showFooterTitle = userConfig.showFooterTitle;
        }
        if (userConfig.progressBar) {
            target.progressBar = { ...target.progressBar, ...userConfig.progressBar };
        }
        if (userConfig.table) {
            target.table = { ...target.table, ...userConfig.table };
        }
        if (userConfig.disabled) {
            target.disabled = [...userConfig.disabled];
        }
        if (userConfig.filterByCurrentModel !== undefined) {
            target.filterByCurrentModel = userConfig.filterByCurrentModel;
        }
        if (userConfig.showUnaggregated !== undefined) {
            target.showUnaggregated = userConfig.showUnaggregated;
        }
        if (userConfig.aggregatedGroups) {
            target.aggregatedGroups = userConfig.aggregatedGroups.map(g => ({ ...g }));
        }
        if (userConfig.historyMaxAgeHours !== undefined) {
            target.historyMaxAgeHours = userConfig.historyMaxAgeHours;
        }
        if (userConfig.predictionShortWindowMinutes !== undefined) {
            target.predictionShortWindowMinutes = userConfig.predictionShortWindowMinutes;
        }
        if (userConfig.pollingInterval !== undefined) {
            target.pollingInterval = userConfig.pollingInterval;
        }
    }

    /**
     * Validates and normalizes configuration values.
     */
    private static async validateConfig(config: QuotaConfig): Promise<void> {
        // Handle pollingInterval from user config
        const validated = validatePollingInterval(config.pollingInterval as unknown);
        if (validated === null) {
            console.warn('[QuotaService] pollingInterval is invalid, using default');
            config.pollingInterval = DEFAULT_CONFIG.pollingInterval;
        } else if (validated < 10_000) {
            console.warn('[QuotaService] pollingInterval below 10s is not recommended');
            config.pollingInterval = Math.max(validated, 1_000);
        } else {
            config.pollingInterval = validated;
        }
    }
}

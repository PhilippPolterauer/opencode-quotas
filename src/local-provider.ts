import {
    type LanguageModelV3,
    type LanguageModelV3GenerateResult,
    type LanguageModelV3StreamResult,
} from "@ai-sdk/provider";
import { getQuotaRegistry } from "./registry";
import { renderQuotaBar } from "./ui/progress-bar";
import { type QuotaData, type QuotaConfig } from "./interfaces";
import { defaultConfig } from "./defaults";

export class LocalQuotaModel implements LanguageModelV3 {
    readonly specificationVersion = "v3";
    readonly provider = "opencode-quotas";
    readonly modelId = "execute";

    constructor(private config: QuotaConfig) {}

    readonly supportedUrls = {};

    async doGenerate(): Promise<LanguageModelV3GenerateResult> {
        const text = await this.getQuotaText();
        return {
            content: [{ type: "text", text }],
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
                inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 0, text: 0, reasoning: 0 },
            },
            warnings: [],
        };
    }

    async doStream(): Promise<LanguageModelV3StreamResult> {
        const text = await this.getQuotaText();

        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue({ type: "text-delta", id: "0", delta: text });
                controller.enqueue({
                    type: "finish",
                    finishReason: { unified: "stop", raw: "stop" },
                    usage: {
                        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
                        outputTokens: { total: 0, text: 0, reasoning: 0 },
                    },
                });
                controller.close();
            },
        });

        return { stream };
    }

    private async getQuotaText(): Promise<string> {
        const registry = getQuotaRegistry();
        const providers = registry.getAll();

        if (providers.length === 0) {
            return "No quota providers registered.";
        }

        const results = await Promise.all(
            providers.map(async (p) => {
                try {
                    return await p.fetchQuota();
                } catch (e) {
                    return [];
                }
            }),
        );

        const flatResults: QuotaData[] = results.flat();
        if (flatResults.length === 0) {
            return "No quota data available.";
        }

        // Filter results
        const disabledIds = new Set(this.config.disabled || []);
        const filteredResults = flatResults.filter(
            (data) => !disabledIds.has(data.id),
        );

        if (filteredResults.length === 0) {
            return "All quota data is disabled by configuration.";
        }

        // Standardized bar config for consistency
        const barConfig = {
            gradients: [
                { threshold: 0.5, color: "green" as const },
                { threshold: 0.8, color: "yellow" as const },
                { threshold: 1.0, color: "red" as const },
            ],
        };

        // Calculate max label length for alignment
        const maxLabelLen = Math.max(...filteredResults.map(d => d.providerName.length));

        const lines = ["### 📊 System Quotas\n"];

        filteredResults.forEach((data) => {
            // Pad the provider name for alignment
            const paddedName = data.providerName.padEnd(maxLabelLen);
            // Add brackets to match footer style
            const label = `[${paddedName}]`;

            if (data.limit !== null && data.limit > 0) {
                lines.push(
                    renderQuotaBar(data.used, data.limit, {
                        label: label,
                        unit: data.unit,
                        config: barConfig,
                    }),
                );
            } else {
                lines.push(
                    `${label}: ${data.used} ${data.unit} (Unlimited)`,
                );
            }
            if (data.details) lines.push(`  └ ${data.details}`);
        });

        return lines.join("\n");
    }
}

/**
 * Factory function to create the provider instance.
 * This is the entry point used by OpenCode's plugin system via `api.npm`.
 */
export function createOpencodeQuotasProvider(options: any = {}) {
    // Merge provided options with default config if needed, 
    // but for now we rely on the shared defaults or passed config.
    const config = options.config || defaultConfig;
    
    return {
        languageModel(modelId: string) {
            return new LocalQuotaModel(config);
        }
    };
}

export default createOpencodeQuotasProvider;

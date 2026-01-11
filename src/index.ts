import { type Plugin, type Hooks } from "@opencode-ai/plugin";
import { getQuotaRegistry } from "./registry";
import { createAntigravityProvider } from "./providers/antigravity";
import { createCodexProvider } from "./providers/codex";
import { renderQuotaBar } from "./ui/progress-bar";
import { type IQuotaProvider, type QuotaData } from "./interfaces";
import { defaultConfig } from "./defaults";

/**
 * QuotaHub Plugin for OpenCode.ai
 */
export const QuotaHubPlugin: Plugin = async ({ client, $, directory }) => {
    const registry = getQuotaRegistry();

    // Register Antigravity Provider with user-defined or default groups
    try {
        const agGroups = defaultConfig.groups?.antigravity;
        registry.register(createAntigravityProvider(agGroups));
    } catch (e) {
        console.warn("[QuotaHub] Failed to initialize Antigravity provider:", e);
    }

    // Register Codex Provider
    try {
        registry.register(createCodexProvider());
    } catch (e) {
        console.warn("[QuotaHub] Failed to initialize Codex provider:", e);
    }

    const hooks: Hooks = {
        /**
         * Register the /quotas command and the local provider.
         */
        config: async (config: any) => {
            // Register command
            config.command = {
                ...config.command,
                quotas: {
                    template: "Display current system quotas",
                    description: "Fetch and display quotas for all providers",
                    model: "opencodeQuotas:execute", // provider:model format
                },
            };

            // Register the custom provider
            config.provider = config.provider || {};
            config.provider['opencodeQuotas'] = {
                name: "OpenCode Quotas",
                api: {
                    // Point to the compiled local provider file
                    npm: `file://${directory}/dist/src/local-provider.js`
                },
                models: {
                    "execute": {
                        name: "Quota Executor",
                        id: "execute"
                    }
                }
            };
        },

        /**
         * The platform calls this hook after a text generation is complete.
         * We use it to append quota information to the end of the message.
         */
        "experimental.text.complete": async (
            input: {
                sessionID: string;
                messageID: string;
                partID: string;
            },
            output: {
                text: string;
            },
        ): Promise<void> => {
            if (defaultConfig.footer === false) return;

            const providers = registry.getAll();
            if (providers.length === 0) return;

            // Fetch quotas from all registered providers in parallel
            const results = await Promise.all(
                providers.map(async (p: IQuotaProvider) => {
                    try {
                        return await p.fetchQuota();
                    } catch (e) {
                        console.debug(`[QuotaHub] Provider ${p.id} fetch failed:`, e);
                        return [];
                    }
                }),
            );

            const flatResults: QuotaData[] = results.flat();
            if (flatResults.length === 0) return;

            // Filter out disabled quotas
            const disabledIds = new Set(defaultConfig.disabled || []);
            const filteredResults = flatResults.filter(
                (data) => !disabledIds.has(data.id),
            );

            if (filteredResults.length === 0) return;

            // Sort results by provider name for a stable UI
            filteredResults.sort((a, b) =>
                a.providerName.localeCompare(b.providerName),
            );

            // Calculate max label length for alignment
            const maxLabelLen = Math.max(...filteredResults.map(d => d.providerName.length));
            const bracketPadding = 2; // "[]"

            // Generate the visual representation for each quota
            const lines = filteredResults.map((data: QuotaData) => {
                const paddedName = data.providerName.padEnd(maxLabelLen);
                const label = `[${paddedName}]`;

                if (data.limit !== null && data.limit > 0) {
                    return renderQuotaBar(data.used, data.limit, {
                        label,
                        unit: data.unit,
                        details: data.details,
                        config: defaultConfig.progressBar,
                    });
                } else {
                    return (
                        label +
                        `: ${data.used} ${data.unit} (Unlimited)` +
                        (data.details ? ` | ${data.details}` : "")
                    );
                }
            });

            // Append to message text
            output.text += "\n\n" + lines.join("\n");
        },
    };

    return hooks;
};

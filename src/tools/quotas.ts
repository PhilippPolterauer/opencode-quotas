import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import { type QuotaService } from "../services/quota-service";
import { type QuotaConfig } from "../interfaces";
import { renderQuotaTable } from "../ui/quota-table";
import { logger } from "../logger";

/**
 * Creates a tool definition for fetching and displaying quota information.
 * This tool always performs a fresh fetch of quotas from all providers.
 * 
 * @returns A ToolDefinition that can be registered under Hooks.tool
 */
export function createQuotaTool(
    quotaService: QuotaService,
    getConfig: () => QuotaConfig
): ToolDefinition {
    return tool({
        description:
            "Fetch and display the current API quota usage across all configured providers (Antigravity, Codex, etc.). " +
            "Always returns fresh, up-to-date quota information. " +
            "Use this tool when you need to check remaining API capacity, quota limits, or usage statistics.",
        args: {
            providerId: tool.schema
                .string()
                .optional()
                .describe(
                    "Optional: Filter results to show only quotas from a specific provider (e.g., 'antigravity', 'codex')"
                ),
            modelId: tool.schema
                .string()
                .optional()
                .describe(
                    "Optional: Filter results to show only quotas relevant to a specific model"
                ),
        },
        async execute(args) {
            const config = getConfig();
            
            logger.debug("tool:quotas:execute", {
                providerId: args.providerId,
                modelId: args.modelId,
            });

            try {
                // Always fetch fresh quotas
                const quotas = await quotaService.getQuotas({
                    providerId: args.providerId,
                    modelId: args.modelId,
                });

                logger.debug("tool:quotas:fetched", {
                    count: quotas.length,
                });

                if (quotas.length === 0) {
                    return "No quota information available. This could mean:\n" +
                        "- No quota providers are configured\n" +
                        "- The filter criteria matched no quotas\n" +
                        "- There was an error fetching quota data";
                }

                // Render the quota table
                const lines = renderQuotaTable(quotas, {
                    progressBarConfig: config.progressBar,
                    tableConfig: config.table,
                }).map((l) => l.line);

                const showMode = config.progressBar?.show ?? "used";
                const modeLabel = showMode === "available" ? "(Remaining)" : "(Used)";

                return `**Quota Status ${modeLabel}**\n\n` + lines.join("\n");
            } catch (error) {
                logger.error("tool:quotas:error", { error });
                return `Error fetching quotas: ${error instanceof Error ? error.message : String(error)}`;
            }
        },
    });
}

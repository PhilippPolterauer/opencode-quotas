import { type Plugin, type Hooks } from "@opencode-ai/plugin";
import { type AssistantMessage, type UserMessage } from "@opencode-ai/sdk";
import { QuotaService } from "./services/quota-service";
import { HistoryService } from "./services/history-service";
import { renderQuotaTable } from "./ui/quota-table";
import { type QuotaData } from "./interfaces";
import { QuotaCache } from "./quota-cache";
import {
    PLUGIN_FOOTER_SIGNATURE,
    REASONING_PATTERNS,
    SKIP_REASONS,
} from "./constants";
import { logger } from "./logger";
import { getPluginState } from "./plugin-state";
import { createQuotaTool } from "./tools/quotas";

/**
 * Extended message type with additional fields that may be present at runtime.
 * Uses Omit to override required fields that we know may be optional.
 */
type ExtendedAssistantMessage = Omit<AssistantMessage, "parentID"> & {
    type?: string;
    mode?: string;
    parentID?: string;
    modelID?: string;
    providerID?: string;
    tokens?: {
        input?: number;
        output?: number;
        reasoning?: number;
        cache?: { read?: number; write?: number };
    };
};

/**
 * QuotaHub Plugin for OpenCode.ai
 */
export const QuotaHubPlugin: Plugin = async ({ client, $, directory }) => {
    const state = getPluginState();
    const historyService = new HistoryService();
    const quotaService = new QuotaService();

    let quotaCache: QuotaCache | undefined;
    let initPromise: Promise<void> | undefined;

    // Dedicated initialization function
    const ensureInit = async (): Promise<void> => {
        if (initPromise) return initPromise;

        initPromise = (async () => {
            try {
                await historyService.init();
                await quotaService.init(directory, historyService);

                const config = quotaService.getConfig();
                const providers = quotaService.getProviders();
                logger.debug("init:providers", {
                    ids: providers.map((p) => p.id),
                    count: providers.length,
                });
                quotaCache = new QuotaCache(providers, {
                    refreshIntervalMs: config.pollingInterval ?? 60_000,
                    historyService,
                    debug: !!config.debug,
                });
                quotaCache.start();
                logger.debug("init:complete");
            } catch (e) {
                console.error("Failed to initialize QuotaHubPlugin:", e);
                // Keep the promise but it failed. Future calls will see it as failed.
                throw e;
            }
        })();

        return initPromise;
    };

    // Trigger background initialization
    ensureInit().catch(() => {});

    const hooks: Hooks = {
        /**
         * The platform calls this hook after a text generation is complete.
         * We use it to append quota information to the end of the final assistant message.
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
            // Ensure initialization is complete before processing
            await ensureInit().catch((e) => {
                logger.error("init:error", { error: e });
            });
            if (!quotaCache) {
                const config = quotaService.getConfig();
                if (config.debug)
                    logger.debug("hook:no_cache", {
                        messageID: input.messageID,
                    });
                return;
            }

            const cache = quotaCache;
            const config = quotaService.getConfig();
            const debugLog = (msg: string, data?: any) => {
                if (config.debug) logger.debug(msg, data);
            };

            if (config.footer === false) {
                debugLog("skip:footer_disabled", {
                    messageID: input.messageID,
                });
                return;
            }

            // Log hook invocation
            debugLog("hook:experimental.text.complete", {
                input,
                processed: state.isProcessed(input.messageID),
            });

            // Fast path check
            if (state.isProcessed(input.messageID)) {
                debugLog("skip:already_processed", {
                    messageID: input.messageID,
                });
                return;
            }

            // Secondary safeguard: check if footer already present
            if (output.text.includes(PLUGIN_FOOTER_SIGNATURE)) {
                debugLog(SKIP_REASONS.FOOTER_PRESENT, {
                    messageID: input.messageID,
                });
                state.markProcessed(input.messageID);
                return;
            }

            debugLog("lock:acquire_start", { messageID: input.messageID });
            // Acquire lock for this message
            const release = await state.acquireLock(input.messageID);
            debugLog("lock:acquired", { messageID: input.messageID });

            try {
                // After acquiring lock, re-check if processed
                if (state.isProcessed(input.messageID)) {
                    debugLog("skip:already_processed_after_lock", {
                        messageID: input.messageID,
                    });
                    return;
                }

                // Double-check text content in case another process injected it while we waited for lock
                if (output.text.includes(PLUGIN_FOOTER_SIGNATURE)) {
                    debugLog("skip:footer_present_after_lock", {
                        messageID: input.messageID,
                    });
                    state.markProcessed(input.messageID);
                    return;
                }

                // Fetch message to check role
                const { data: result } = await client.session.message({
                    path: {
                        id: input.sessionID,
                        messageID: input.messageID,
                    },
                });

                if (!result || result.info.role !== "assistant") {
                    debugLog("skip:not_assistant", {
                        messageID: input.messageID,
                        role: result?.info?.role,
                    });
                    state.markProcessed(input.messageID);
                    return;
                }

                const assistantMsg = result.info as ExtendedAssistantMessage;

                // Mark as processed as soon as we've identified it's an assistant message
                // We do this before the quota check to avoid race conditions if no quotas are found.
                state.markProcessed(input.messageID);

                // Log message details
                debugLog("message:details", {
                    id: input.messageID,
                    mode: assistantMsg.mode,
                    tokens: assistantMsg.tokens,
                    type: assistantMsg.type,
                    modelID: assistantMsg.modelID,
                    providerID: assistantMsg.providerID,
                });

                // Skip if it's a subagent mode (thinking step), unless it's a whitelisted agent (plan/build)
                if (assistantMsg.mode === "subagent") {
                    let allowed = false;
                    if (assistantMsg.parentID) {
                        try {
                            const { data: parentResult } =
                                await client.session.message({
                                    path: {
                                        id: input.sessionID,
                                        messageID: assistantMsg.parentID,
                                    },
                                });

                            if (parentResult?.info?.role === "user") {
                                const userMsg =
                                    parentResult.info as UserMessage;
                                // Allow plan and build agents even in subagent mode
                                if (["plan", "build"].includes(userMsg.agent)) {
                                    allowed = true;
                                    debugLog("allow:subagent_exception", {
                                        agent: userMsg.agent,
                                    });
                                }
                            }
                        } catch (e) {
                            debugLog("error:check_parent_agent", e);
                        }
                    }

                    if (!allowed) {
                        debugLog(SKIP_REASONS.SUBAGENT);
                        return;
                    }
                }

                // Skip reasoning messages (explicit mode or type)
                if (
                    assistantMsg.mode === "reasoning" ||
                    assistantMsg.type === "reasoning"
                ) {
                    debugLog(SKIP_REASONS.REASONING);
                    return;
                }

                // Skip if it appears to be a reasoning-only message based on tokens
                const reasoningTokens = assistantMsg.tokens?.reasoning ?? 0;
                const outputTokens = assistantMsg.tokens?.output ?? 0;
                if (
                    assistantMsg.tokens &&
                    reasoningTokens > 0 &&
                    (outputTokens === 0 || outputTokens === reasoningTokens)
                ) {
                    debugLog(SKIP_REASONS.REASONING, assistantMsg.tokens);
                    return;
                }

                // Heuristic: Check if text starts with "Thinking:" or similar
                const trimmedText = output.text.trim();
                for (const pattern of REASONING_PATTERNS) {
                    if (pattern.test(trimmedText)) {
                        debugLog(SKIP_REASONS.REASONING, {
                            pattern: pattern.toString(),
                        });
                        return;
                    }
                }

                const snapshot = cache.getSnapshot();
                const rawResults: QuotaData[] = snapshot.data;
                debugLog("cache:snapshot", {
                    fetchedAt: snapshot.fetchedAt?.toISOString(),
                    totalCount: rawResults.length,
                    hasError: !!snapshot.lastError,
                });
                if (rawResults.length === 0) {
                    debugLog("skip:no_cached_quotas", {
                        fetchedAt: snapshot.fetchedAt?.toISOString(),
                        lastError: snapshot.lastError,
                    });
                    return;
                }

                // Process (filter, sort) using the shared service
                const filteredResults = quotaService.processQuotas(rawResults, {
                    providerId: assistantMsg.providerID,
                    modelId: assistantMsg.modelID,
                });

                debugLog("quotas:processed", {
                    before: rawResults.length,
                    after: filteredResults.length,
                    providerId: assistantMsg.providerID,
                    modelId: assistantMsg.modelID,
                });

                if (filteredResults.length === 0) {
                    debugLog("skip:all_quotas_filtered", {
                        providerId: assistantMsg.providerID,
                        modelId: assistantMsg.modelID,
                    });
                    return;
                }

                const lines = renderQuotaTable(filteredResults, {
                    progressBarConfig: config.progressBar,
                    tableConfig: config.table,
                }).map((l) => l.line);

                // Append to message text
                const showMode = config.progressBar?.show ?? "used";
                const modeLabel =
                    showMode === "available" ? "(Remaining)" : "(Used)";
                // Build visible header only if enabled in config
                const showTitle = config.showFooterTitle !== false;
                const titleText = showTitle
                    ? `${PLUGIN_FOOTER_SIGNATURE} ${modeLabel}_\n`
                    : "";

                // Append table lines (no invisible marker)
                output.text += "\n\n" + titleText + lines.join("\n");
                debugLog("inject:footer", {
                    messageID: input.messageID,
                    lines: lines.length,
                });
            } finally {
                debugLog("lock:release", { messageID: input.messageID });
                release();
            }
        },
    };

    // Create the quota tool that can be called by the LLM
    const quotaTool = createQuotaTool(quotaService, () =>
        quotaService.getConfig(),
    );

    return hooks;
};

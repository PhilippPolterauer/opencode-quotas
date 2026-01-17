import { QuotaService } from "./services/quota-service";
import { HistoryService } from "./services/history-service";
import { renderQuotaTable } from "./ui/quota-table";
import { QuotaCache } from "./quota-cache";
import { PLUGIN_FOOTER_SIGNATURE, REASONING_PATTERNS, SKIP_REASONS, } from "./constants";
import { logger } from "./logger";
import { getPluginState } from "./plugin-state";
/**
 * QuotaHub Plugin for OpenCode.ai
 */
export const QuotaHubPlugin = async ({ client, $, directory, serverUrl, }) => {
    const state = getPluginState();
    const historyService = new HistoryService();
    const quotaService = new QuotaService();
    let quotaCache;
    let initPromise;
    // Dedicated initialization function
    const ensureInit = async () => {
        if (initPromise)
            return initPromise;
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
            }
            catch (e) {
                console.error("Failed to initialize QuotaHubPlugin:", e);
                // Keep the promise but it failed. Future calls will see it as failed.
                throw e;
            }
        })();
        return initPromise;
    };
    // Trigger background initialization
    ensureInit().catch(() => { });
    const makeDebugLog = (config) => {
        return (msg, data) => {
            if (config.debug)
                logger.debug(msg, data);
        };
    };
    const buildFooterText = (assistantMsg, config, cache, debugLog) => {
        const snapshot = cache.getSnapshot();
        const rawResults = snapshot.data;
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
            return null;
        }
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
            return null;
        }
        const lines = renderQuotaTable(filteredResults, {
            progressBarConfig: config.progressBar,
            tableConfig: config.table,
        }).map((l) => l.line);
        const showMode = config.progressBar?.show ?? "used";
        const modeLabel = showMode === "available" ? "(Remaining)" : "(Used)";
        const showTitle = config.showFooterTitle !== false;
        const titleText = showTitle
            ? `${PLUGIN_FOOTER_SIGNATURE} ${modeLabel}_\n`
            : "";
        return {
            text: "\n\n" + titleText + lines.join("\n"),
            lineCount: lines.length,
        };
    };
    const findLatestTextPart = (parts) => {
        for (let i = parts.length - 1; i >= 0; i -= 1) {
            const part = parts[i];
            if (part?.type === "text" && !part.ignored) {
                return part;
            }
        }
        return null;
    };
    const updateTextPart = async (sessionID, messageID, partID, part) => {
        const url = new URL(`/session/${sessionID}/message/${messageID}/part/${partID}`, serverUrl);
        const headers = {
            "Content-Type": "application/json",
        };
        if (directory) {
            headers["x-opencode-directory"] = directory;
        }
        const response = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ part }),
        });
        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            logger.error("part:update_failed", {
                sessionID,
                messageID,
                partID,
                status: response.status,
                error: errorText,
            });
        }
    };
    const hooks = {
        event: async ({ event }) => {
            if (event.type !== "session.idle")
                return;
            await ensureInit().catch((e) => {
                logger.error("init:error", { error: e });
            });
            if (!quotaCache) {
                const config = quotaService.getConfig();
                if (config.debug)
                    logger.debug("hook:no_cache", {
                        sessionID: event.properties.sessionID,
                    });
                return;
            }
            const cache = quotaCache;
            const config = quotaService.getConfig();
            const debugLog = makeDebugLog(config);
            const sessionID = event.properties.sessionID;
            if (config.footer === false) {
                debugLog("skip:footer_disabled", {
                    sessionID,
                });
                return;
            }
            const pending = state.getPending(sessionID);
            if (!pending) {
                debugLog("idle:no_pending", { sessionID });
                return;
            }
            if (state.isProcessed(pending.messageID)) {
                debugLog("idle:already_processed", {
                    messageID: pending.messageID,
                });
                state.clearPending(sessionID);
                return;
            }
            const release = await state.acquireLock(pending.messageID);
            debugLog("lock:acquired_idle", {
                messageID: pending.messageID,
            });
            try {
                if (state.isProcessed(pending.messageID)) {
                    debugLog("idle:already_processed_after_lock", {
                        messageID: pending.messageID,
                    });
                    state.clearPending(sessionID);
                    return;
                }
                const { data: messages } = await client.session.messages({
                    path: { id: sessionID },
                    query: { limit: 1 },
                });
                const latest = messages?.[0];
                if (!latest) {
                    debugLog("idle:no_latest_message", { sessionID });
                    state.clearPending(sessionID);
                    return;
                }
                if (latest.info.role !== "assistant") {
                    debugLog("idle:latest_not_assistant", {
                        sessionID,
                        role: latest.info.role,
                    });
                    state.clearPending(sessionID);
                    return;
                }
                if (latest.info.id !== pending.messageID) {
                    debugLog("idle:pending_stale", {
                        sessionID,
                        pendingMessageID: pending.messageID,
                        latestMessageID: latest.info.id,
                    });
                    state.clearPending(sessionID);
                    return;
                }
                const assistantMsg = latest.info;
                const textPart = findLatestTextPart(latest.parts);
                if (!textPart) {
                    debugLog("idle:no_text_part", {
                        messageID: latest.info.id,
                    });
                    state.clearPending(sessionID);
                    return;
                }
                if (textPart.text.includes(PLUGIN_FOOTER_SIGNATURE)) {
                    debugLog(SKIP_REASONS.FOOTER_PRESENT, {
                        messageID: latest.info.id,
                    });
                    state.markProcessed(pending.messageID);
                    state.clearPending(sessionID);
                    return;
                }
                const footer = buildFooterText(assistantMsg, config, cache, debugLog);
                if (!footer) {
                    state.clearPending(sessionID);
                    return;
                }
                await updateTextPart(sessionID, latest.info.id, textPart.id, {
                    ...textPart,
                    text: textPart.text + footer.text,
                });
                state.markProcessed(pending.messageID);
                state.clearPending(sessionID);
                debugLog("inject:footer", {
                    messageID: latest.info.id,
                    lines: footer.lineCount,
                    source: "session.idle",
                });
            }
            catch (e) {
                logger.error("idle:inject_failed", {
                    sessionID,
                    error: e,
                });
            }
            finally {
                debugLog("lock:release_idle", {
                    messageID: pending.messageID,
                });
                release();
            }
        },
        /**
         * The platform calls this hook after a text generation is complete.
         * We use it to queue quota injection for the session idle event.
         */
        "experimental.text.complete": async (input, output) => {
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
            const debugLog = makeDebugLog(config);
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
                pending: state.isPending(input.messageID),
            });
            // Fast path check
            if (state.isProcessed(input.messageID)) {
                debugLog("skip:already_processed", {
                    messageID: input.messageID,
                });
                return;
            }
            if (state.isPending(input.messageID)) {
                debugLog("skip:already_pending", {
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
                if (state.isPending(input.messageID)) {
                    debugLog("skip:already_pending_after_lock", {
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
                const assistantMsg = result.info;
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
                            const { data: parentResult } = await client.session.message({
                                path: {
                                    id: input.sessionID,
                                    messageID: assistantMsg.parentID,
                                },
                            });
                            if (parentResult?.info?.role === "user") {
                                const userMsg = parentResult.info;
                                // Allow plan and build agents even in subagent mode
                                if (["plan", "build"].includes(userMsg.agent)) {
                                    allowed = true;
                                    debugLog("allow:subagent_exception", {
                                        agent: userMsg.agent,
                                    });
                                }
                            }
                        }
                        catch (e) {
                            debugLog("error:check_parent_agent", e);
                        }
                    }
                    if (!allowed) {
                        debugLog(SKIP_REASONS.SUBAGENT);
                        return;
                    }
                }
                // Skip reasoning messages (explicit mode or type)
                if (assistantMsg.mode === "reasoning" ||
                    assistantMsg.type === "reasoning") {
                    debugLog(SKIP_REASONS.REASONING);
                    return;
                }
                // Skip if it appears to be a reasoning-only message based on tokens
                const reasoningTokens = assistantMsg.tokens?.reasoning ?? 0;
                const outputTokens = assistantMsg.tokens?.output ?? 0;
                if (assistantMsg.tokens &&
                    reasoningTokens > 0 &&
                    (outputTokens === 0 || outputTokens === reasoningTokens)) {
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
                const footer = buildFooterText(assistantMsg, config, cache, debugLog);
                if (!footer) {
                    // No footer to inject for this message; mark as processed to avoid redundant
                    // repeated checks by concurrent callers.
                    state.markProcessed(input.messageID);
                    return;
                }
                state.setPending(input.sessionID, input.messageID, input.partID);
                debugLog("pending:queued", {
                    messageID: input.messageID,
                    partID: input.partID,
                    sessionID: input.sessionID,
                    lines: footer.lineCount,
                });
            }
            finally {
                debugLog("lock:release", { messageID: input.messageID });
                release();
            }
        },
    };
    return hooks;
};
export default QuotaHubPlugin;

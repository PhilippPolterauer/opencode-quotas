import { type Plugin, type Hooks } from "@opencode-ai/plugin";
import { type AssistantMessage } from "@opencode-ai/sdk";
import { QuotaService } from "./services/quota-service";
import { HistoryService } from "./services/history-service";
import { renderQuotaTable } from "./ui/quota-table";
import { type QuotaData } from "./interfaces";
import { QuotaCache } from "./quota-cache";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { inspect } from "node:util";

// Global deduplication state to prevent double injection across plugin instances
const processedMessages = new Set<string>();
const processingLocks = new Map<string, Promise<void>>();

// Helper for debugging
function logToDebugFile(msg: string, data: any, enabled: boolean) {
    if (!enabled) return;
    try {
        const logPath = join(homedir(), ".local", "share", "opencode", "quotas-debug.log");
        const timestamp = new Date().toISOString();
        const payload = data ? ` ${inspect(data, { depth: null, colors: false, breakLength: Infinity })}` : "";
        appendFileSync(logPath, `[${timestamp}] ${msg}${payload}\n`);
    } catch {
        // ignore logging errors
    }
}

/**
 * QuotaHub Plugin for OpenCode.ai
 */
export const QuotaHubPlugin: Plugin = async ({ client, $, directory }) => {
    const historyService = new HistoryService();
    // Do not await init here to avoid blocking plugin startup
    // await historyService.init();

    const quotaService = new QuotaService();
    // await quotaService.init(directory, historyService);

    // Initial config (defaults)
    let config = quotaService.getConfig();
    const debugLog = (msg: string, data?: any) => logToDebugFile(msg, data, !!config.debug);

    let quotaCache: QuotaCache | undefined;

    // Background initialization
    const initPromise = (async () => {
        try {
            await historyService.init();
            await quotaService.init(directory, historyService);
            
            // Refresh config after init
            config = quotaService.getConfig();
            
            const providers = quotaService.getProviders();
            quotaCache = new QuotaCache(providers, {
                refreshIntervalMs: 60_000,
                historyService,
            });
            quotaCache.start();
            debugLog("init:complete");
        } catch (e) {
            console.error("Failed to initialize QuotaHubPlugin:", e);
        }
    })();

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
            if (!quotaCache) {
                await initPromise;
            }
            if (!quotaCache) return;
            const cache = quotaCache; // Capture valid reference

            if (config.footer === false) return;
            
            // Log hook invocation
            debugLog("hook:experimental.text.complete", { 
                input, 
                processed: processedMessages.has(input.messageID) 
            });

            // Fast path check
            if (processedMessages.has(input.messageID)) return;
            
            // Secondary safeguard: check if footer already present
            if (output.text.includes("**Opencode Quotas")) {
                 debugLog("skip:footer_present", { messageID: input.messageID });
                 processedMessages.add(input.messageID);
                 return;
            }

            // Wait for any existing processing to finish
            while (processingLocks.has(input.messageID)) {
                await processingLocks.get(input.messageID);
                // After waking up, check if another process handled it
                if (processedMessages.has(input.messageID)) return;
                // Double-check text content in case another process injected it
                if (output.text.includes("**Opencode Quotas")) {
                    processedMessages.add(input.messageID);
                    return;
                }
            }

            // Create a processing task
            const processTask = async () => {
                // Fetch message to check role
                const { data: result } = await client.session.message({
                    path: {
                        id: input.sessionID,
                        messageID: input.messageID,
                    },
                });

                if (!result || result.info.role !== "assistant") {
                    processedMessages.add(input.messageID);
                    return;
                }

                const assistantMsg = result.info as AssistantMessage;
                
                // Log message details
                debugLog("message:details", {
                    id: input.messageID,
                    mode: assistantMsg.mode,
                    tokens: assistantMsg.tokens,
                    type: (assistantMsg as any).type,
                    modelID: assistantMsg.modelID,
                    providerID: assistantMsg.providerID
                });

                // Skip if it's a subagent mode (thinking step)
                if (assistantMsg.mode === "subagent") {
                    debugLog("skip:subagent");
                    processedMessages.add(input.messageID);
                    return;
                }

                // Skip reasoning messages (explicit mode or type)
                if (
                    assistantMsg.mode === "reasoning" ||
                    (assistantMsg as any).type === "reasoning"
                ) {
                    debugLog("skip:reasoning_mode");
                    processedMessages.add(input.messageID);
                    return;
                }

                // Skip if it appears to be a reasoning-only message based on tokens
                // Heuristic: If output tokens are 0 but reasoning tokens exist, or equal.
                if (
                    assistantMsg.tokens &&
                    assistantMsg.tokens.reasoning > 0 &&
                    (assistantMsg.tokens.output === 0 ||
                        assistantMsg.tokens.output === assistantMsg.tokens.reasoning)
                ) {
                    debugLog("skip:reasoning_tokens", assistantMsg.tokens);
                    processedMessages.add(input.messageID);
                    return;
                }
                
                // Heuristic: Check if text starts with "Thinking:" which indicates a reasoning block
                // that might not be tagged correctly in metadata.
                if (output.text.trim().match(/^Thinking:/i)) {
                    debugLog("skip:thinking_text_heuristic");
                    processedMessages.add(input.messageID);
                    return;
                }

                // Mark as processed to prevent double-printing
                processedMessages.add(input.messageID);

                const snapshot = cache.getSnapshot();
                const rawResults: QuotaData[] = snapshot.data;
                if (rawResults.length === 0) return;

                // Process (filter, sort) using the shared service
                const filteredResults = quotaService.processQuotas(rawResults, {
                    providerId: assistantMsg.providerID,
                    modelId: assistantMsg.modelID,
                });

                if (filteredResults.length === 0) return;

                const lines = renderQuotaTable(filteredResults, {
                    progressBarConfig: config.progressBar,
                    tableConfig: config.table,
                }).map((l) => l.line);

                // Append to message text
                const showMode = config.progressBar?.show ?? "used";
                const modeLabel = showMode === "available" ? "(Remaining)" : "(Used)";
                const footerHeader = `**Opencode Quotas ${modeLabel}**`;
                
                // Final safety check before modification
                if (output.text.includes("**Opencode Quotas")) return;

                const quotedLines = lines;
                
                output.text += "\n\n" + `${footerHeader}\n` + quotedLines.join("\n");
            };

            // Register and execute the task
            let resolveLock: () => void = () => {};
            const lockPromise = new Promise<void>((resolve) => {
                resolveLock = resolve;
            });

            // Double-check locking to handle any potential race conditions
            if (processingLocks.has(input.messageID)) {
                await processingLocks.get(input.messageID);
                if (processedMessages.has(input.messageID)) return;
            }

            processingLocks.set(input.messageID, lockPromise);

            try {
                await processTask();
            } finally {
                resolveLock();
                processingLocks.delete(input.messageID);
            }
        },
    };

    return hooks;
};


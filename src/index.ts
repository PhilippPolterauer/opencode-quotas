import { type Plugin, type Hooks } from "@opencode-ai/plugin";
import { type AssistantMessage } from "@opencode-ai/sdk";
import { getQuotaRegistry } from "./registry";
import { createAntigravityProvider } from "./providers/antigravity";
import { createCodexProvider } from "./providers/codex";
import { renderQuotaTable } from "./ui/quota-table";
import { type QuotaData } from "./interfaces";
import { DEFAULT_CONFIG } from "./defaults";
import { QuotaCache } from "./quota-cache";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Helper for debugging
function logToDebugFile(msg: string, data: any, enabled: boolean) {
    if (!enabled) return;
    try {
        const logPath = join(homedir(), ".local", "share", "opencode", "quotas-debug.log");
        const timestamp = new Date().toISOString();
        const payload = data ? ` ${JSON.stringify(data)}` : "";
        appendFileSync(logPath, `[${timestamp}] ${msg}${payload}\n`);
    } catch {
        // ignore logging errors
    }
}

/**
 * QuotaHub Plugin for OpenCode.ai
 */
export const QuotaHubPlugin: Plugin = async ({ client, $, directory }) => {
    // Start with the default configuration
    const config = { ...DEFAULT_CONFIG };
    // Deep clone specific nested objects to avoid mutation of the constant
    if (DEFAULT_CONFIG.progressBar) {
        config.progressBar = { ...DEFAULT_CONFIG.progressBar };
    }
    if (DEFAULT_CONFIG.groups) {
        config.groups = { ...DEFAULT_CONFIG.groups };
    }

    // Attempt to load .opencode/quotas.json from the project directory
    try {
        const configPath = join(directory, ".opencode", "quotas.json");
        const rawConfig = readFileSync(configPath, "utf-8");
        const userConfig = JSON.parse(rawConfig);
        
        // Merge user config
        if (userConfig.debug !== undefined) {
            config.debug = userConfig.debug;
        }
        if (userConfig.footer !== undefined) {
            config.footer = userConfig.footer;
        }
        if (userConfig.progressBar && userConfig.progressBar.noColor !== undefined) {
             if (!config.progressBar) config.progressBar = {};
             config.progressBar.noColor = userConfig.progressBar.noColor;
        }
        // Merge other fields if necessary
    } catch (e) {
        // Ignore missing config or parse errors
    }

    const debugLog = (msg: string, data?: any) => logToDebugFile(msg, data, !!config.debug);

    const registry = getQuotaRegistry();
    const processedMessages = new Set<string>();

    // Register Antigravity Provider with user-defined or default groups
    try {
        const agGroups = config.groups?.antigravity;
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

    const providers = registry.getAll();
    const quotaCache = new QuotaCache(providers, {
        refreshIntervalMs: 60_000,
    });
    quotaCache.start();

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
            if (config.footer === false) return;
            
            // Log hook invocation
            debugLog("hook:experimental.text.complete", { 
                input, 
                processed: processedMessages.has(input.messageID) 
            });

            if (processedMessages.has(input.messageID)) return;

            // Fetch message to check role
            const { data: result } = await client.session.message({
                path: {
                    id: input.sessionID,
                    messageID: input.messageID,
                },
            });

            if (!result || result.info.role !== "assistant") {
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
                return;
            }

            // Skip reasoning messages (explicit mode or type)
            if (
                assistantMsg.mode === "reasoning" ||
                (assistantMsg as any).type === "reasoning"
            ) {
                debugLog("skip:reasoning_mode");
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
                return;
            }
            
            // Heuristic: Check if text starts with "Thinking:" which indicates a reasoning block
            // that might not be tagged correctly in metadata.
            if (output.text.trim().match(/^Thinking:/i)) {
                debugLog("skip:thinking_text_heuristic");
                return;
            }

            // Mark as processed to prevent double-printing
            processedMessages.add(input.messageID);

            const snapshot = quotaCache.getSnapshot();
            const flatResults: QuotaData[] = snapshot.data;
            if (flatResults.length === 0) return;

            // Filter out disabled quotas
            const disabledIds = new Set(config.disabled || []);
            let filteredResults = flatResults.filter(
                (data) => !disabledIds.has(data.id),
            );

            // Filter by model mapping if available
            const currentModelKey = `${assistantMsg.providerID}:${assistantMsg.modelID}`;
            
            debugLog("filtering:model", { currentModelKey });

            if (config.modelMapping && config.modelMapping[currentModelKey]) {
                const relevantIds = new Set(config.modelMapping[currentModelKey]);
                filteredResults = filteredResults.filter(data => relevantIds.has(data.id));
                debugLog("filtering:applied", { count: filteredResults.length });
            } else if (config.modelMapping) {
                 // Fallback: match by provider ID
                 const providerLower = assistantMsg.providerID.toLowerCase();
                 const matchesProvider = filteredResults.filter(q => 
                    q.providerName.toLowerCase().includes(providerLower)
                 );
                 
                 if (matchesProvider.length > 0) {
                     filteredResults = matchesProvider;
                     debugLog("filtering:provider_fallback", { count: filteredResults.length });
                 }
            }

            if (filteredResults.length === 0) return;

            // Sort results by provider name for a stable UI
            filteredResults.sort((a, b) =>
                a.providerName.localeCompare(b.providerName),
            );

            const lines = renderQuotaTable(filteredResults, {
                progressBarConfig: config.progressBar,
            }).map((l) => l.line);

            const tableOutput = lines.join("\n");
            
            // Construct Collapsible HTML Block
            const html = `
<details data-component="collapsible">
  <summary data-slot="collapsible-trigger" style="outline: none; list-style: none; cursor: pointer;">
    <div data-component="tool-trigger">
      <div data-slot="basic-tool-tool-trigger-content">
        <div data-slot="basic-tool-tool-info">
          <div data-slot="basic-tool-tool-info-structured">
            <div data-slot="basic-tool-tool-info-main">
              <span data-slot="basic-tool-tool-title">System Quotas</span>
            </div>
          </div>
        </div>
      </div>
      <div data-slot="collapsible-arrow">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(0deg); transition: transform 0.2s;">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  </summary>
  <div data-slot="collapsible-content">
    <div data-component="tool-output" data-scrollable>
<pre style="margin: 0; font-family: var(--font-family-mono);">
${tableOutput}
</pre>
    </div>
  </div>
</details>
`;

            // Append to message text
            output.text += "\n\n" + html;
        },
    };

    return hooks;
};

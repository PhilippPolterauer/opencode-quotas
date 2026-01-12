#!/usr/bin/env bun
import { getQuotaRegistry } from "./registry";
import { createAntigravityProvider } from "./providers/antigravity";
import { createCodexProvider } from "./providers/codex";
import { renderQuotaTable } from "./ui/quota-table";
import { DEFAULT_CONFIG } from "./defaults";
import { type IQuotaProvider, type QuotaData } from "./interfaces";

async function main() {
    if (process.argv.includes("--no-color")) {
        process.env.OPENCODE_QUOTAS_NO_COLOR = "1";
    }
    const registry = getQuotaRegistry();

    // Register Antigravity Provider
    try {
        const agGroups = DEFAULT_CONFIG.groups?.antigravity;
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
    if (providers.length === 0) {
        console.log("No providers registered.");
        return;
    }

    console.log("Fetching quotas...");

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

    const flatResults: QuotaData[] = results.flat();
    
    // Filter out disabled quotas
    const disabledIds = new Set(DEFAULT_CONFIG.disabled || []);
    const filteredResults = flatResults.filter(
        (data) => !disabledIds.has(data.id),
    );

    if (filteredResults.length === 0) {
        console.log("No active quotas found.");
        return;
    }

    // Sort results by provider name
    filteredResults.sort((a, b) =>
        a.providerName.localeCompare(b.providerName),
    );

    console.log(""); // Empty line
    console.log("📊 OpenCode Quotas");
    console.log("------------------");

    renderQuotaTable(filteredResults, {
        progressBarConfig: DEFAULT_CONFIG.progressBar,
    }).forEach((row) => {
        console.log(row.line);
    });
    console.log(""); // Empty line
}

main().catch(console.error);

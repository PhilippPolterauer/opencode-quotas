import { type QuotaConfig } from "./interfaces";

// Default configuration for quota rendering and grouping
export const DEFAULT_CONFIG: QuotaConfig = {
    displayMode: "simple",
    footer: true,
    showFooterTitle: true,
    debug: false,
    progressBar: {
        color: true,
        gradients: [
            { threshold: 0.5, color: "green" },
            { threshold: 0.8, color: "yellow" },
            { threshold: 1.0, color: "red" },
        ],
    },
    table: {
        header: true,
    },
    modelMapping: {
        // Example mapping: "provider:model": ["quota-id"]
        "antigravity:gemini-flash": ["ag-flash"],
        "antigravity:gemini-pro": ["ag-pro"],
        "antigravity:gpt-4": ["ag-premium"],
    },
    groups: {
        antigravity: [
            { name: "Flash", patterns: ["flash"] },
            { name: "Pro", patterns: ["pro", "gemini"] },
            { name: "Premium", patterns: ["claude", "gpt", "o1"] },
        ],
    },
    aggregatedGroups: [
        {
            id: "codex-smart",
            name: "Codex Usage",
            sources: ["codex-primary", "codex-secondary"],
            strategy: "most_critical",
        },
    ],
    historyMaxAgeHours: 24,
    pollingInterval: 60_000,
};

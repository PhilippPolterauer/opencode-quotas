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
        // Example mapping: "provider/model": ["quota-id"]
        "google/antigravity-gemini-3-flash": ["ag-flash"],
        "google/antigravity-gemini-3-pro": ["ag-pro"],
        "google/antigravity-claude-sonnet-4-5": ["ag-premium"],
        "google/antigravity-claude-sonnet-4-5-thinking": ["ag-premium"],
        "google/antigravity-claude-opus-4-5-thinking": ["ag-premium"],
        "antigravity/gemini-flash": ["ag-flash"],
        "antigravity/gemini-pro": ["ag-pro"],
        "antigravity/gpt-4": ["ag-premium"],
    },
    filterByCurrentModel: true,
    aggregatedGroups: [
        {
            id: "ag-flash",
            name: "Antigravity Flash",
            patterns: ["flash"],
            providerId: "antigravity",
            strategy: "most_critical",
        },
        {
            id: "ag-pro",
            name: "Antigravity Pro",
            patterns: ["pro", "gemini"],
            providerId: "antigravity",
            strategy: "most_critical",
        },
        {
            id: "ag-premium",
            name: "Antigravity Premium",
            patterns: ["claude", "gpt", "o1"],
            providerId: "antigravity",
            strategy: "most_critical",
        },
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

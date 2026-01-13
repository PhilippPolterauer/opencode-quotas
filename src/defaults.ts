import { type QuotaConfig } from "./interfaces";

// Default configuration for quota rendering and grouping
export const DEFAULT_CONFIG: QuotaConfig = {
    displayMode: "simple",
    footer: true,
    showFooterTitle: true,
    debug: false,
    progressBar: {
        color: false,
        gradients: [
            { threshold: 0.5, color: "green" },
            { threshold: 0.8, color: "yellow" },
            { threshold: 1.0, color: "red" },
        ],
    },
    table: {
        header: true,
    },
    filterByCurrentModel: false,
    showUnaggregated: false,
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

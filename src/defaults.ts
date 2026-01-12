import { type QuotaConfig } from "./interfaces";

// Default configuration for quota rendering and grouping
export const DEFAULT_CONFIG: QuotaConfig = {
    displayMode: "simple",
    footer: true,
    debug: false,
    progressBar: {
        noColor: true,
        gradients: [
            { threshold: 0.5, color: "green" },
            { threshold: 0.8, color: "yellow" },
            { threshold: 1.0, color: "red" },
        ],
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
};

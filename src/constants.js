export const PLUGIN_FOOTER_SIGNATURE = "_Opencode Quotas";
// Heuristic patterns for detecting reasoning/thinking blocks
export const REASONING_PATTERNS = [
    /^<thinking>/i,
    /^<antThinking>/i,
    /^(Thinking|Reasoning|Analysis):\s*(\n|$)/i
];
// File paths
export const DEBUG_LOG_FILENAME = "quotas-debug.log";
export const SKIP_REASONS = {
    REASONING: "skip:reasoning",
    SUBAGENT: "skip:subagent",
    FOOTER_PRESENT: "skip:footer_present",
};

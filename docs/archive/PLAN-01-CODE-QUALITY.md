# Plan: Code Quality & Constants Centralization

## Objective
Eliminate hardcoded strings ("magic strings") and fragile heuristics by centralizing them in a single definition file. This ensures consistency across the plugin (e.g., footer detection vs. injection) and simplifies maintenance.

## New Files
- `src/constants.ts`

## Changes

### 1. Create `src/constants.ts`
Define the following constants:
```typescript
export const PLUGIN_FOOTER_SIGNATURE = "**Opencode Quotas";

// Heuristic patterns for detecting reasoning/thinking blocks
export const REASONING_PATTERNS = [
    /^<thinking>/i,
    /^<antThinking>/i,
    /^(Thinking|Reasoning|Analysis):\s*(\n|$)/i
];

// File paths
export const DEBUG_LOG_FILENAME = "quotas-debug.log";
```

### 2. Refactor `src/index.ts`
- Import `PLUGIN_FOOTER_SIGNATURE`, `REASONING_PATTERNS`.
- Replace string literal `**Opencode Quotas` with `PLUGIN_FOOTER_SIGNATURE` in:
    - `experimental.text.complete` hook (detection logic).
    - Footer construction logic.
- Replace manual regex/string checks for thinking blocks with a loop over `REASONING_PATTERNS`.

### 3. Refactor `src/ui/quota-table.ts`
- If the footer header is constructed here, update it to use the constant. (Currently, it seems constructed in `index.ts`, but we will double-check).

### 4. Centralize Skip Conditions (Debugging)
To help debug why quota injection is skipped (e.g., "skip:reasoning"), move the skip reason strings to `src/constants.ts`.
```typescript
export const SKIP_REASONS = {
    REASONING: "skip:reasoning",
    SUBAGENT: "skip:subagent",
    FOOTER_PRESENT: "skip:footer_present",
};
```

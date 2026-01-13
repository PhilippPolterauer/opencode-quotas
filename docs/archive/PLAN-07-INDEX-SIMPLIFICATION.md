# Plan: Index Simplification

## Objective
Clean up the main plugin entry point (`src/index.ts`) by extracting verbose message filtering logic.

## Motivation
`src/index.ts` currently contains ~80 lines of procedural logic just to decide *if* a message should be processed. This checks for:
- Subagent/Parent relationships
- Reasoning modes/types
- Token usage heuristics
- Regex patterns for "Thinking" blocks

This makes the core concurrency and locking logic hard to read.

## Tasks

### 1. Create `src/utils/message-filters.ts`
- Create a helper function `shouldSkipMessage`.
- Move the following logic there:
    - Subagent checks (requires `client` and `sessionID`).
    - Explicit reasoning checks.
    - Token heuristic checks.
    - Regex pattern checks.
- It should accept a logging function callback to preserve the existing `debugLog` behavior.

### 2. Refactor `src/index.ts`
- Import `shouldSkipMessage`.
- Replace the verbose block with:
    ```typescript
    if (await shouldSkipMessage(client, input.sessionID, assistantMsg, output.text, debugLog)) {
        state.markProcessed(input.messageID);
        return;
    }
    ```

## Verification
- Verify that `tests/integration/concurrency.test.ts` still passes.

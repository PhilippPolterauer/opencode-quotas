# Plan: Architecture & Concurrency Fixes

## Objective
Fix race conditions during plugin initialization and eliminate global state that prevents multi-instance support. Implement a robust locking mechanism to replace the current spin-lock.

## New Files
- `src/plugin-state.ts`

## Changes

### 1. Create `src/plugin-state.ts`
Encapsulate the concurrency state logic.
```typescript
export class PluginState {
    private processedMessages = new Set<string>();
    private locks = new Map<string, Promise<void>>();

    // Check if message is already handled
    isProcessed(messageId: string): boolean { ... }

    // Mark message as handled
    markProcessed(messageId: string): void { ... }

    // Acquire lock: returns a Promise that resolves when the lock is acquired.
    // If a lock exists, it awaits the existing one before establishing a new one.
    async acquireLock(messageId: string): Promise<() => void> { ... }
}
```

### 2. Refactor `src/index.ts`
- **Remove Globals**: Delete top-level `processedMessages` and `processingLocks`.
- **Initialization**:
    - Remove the Fire-and-Forget IIFE (`(async () => { ... })();`).
    - Create a dedicated `ensureInit()` function that returns the shared `initPromise`.
    - In the hook, call `await ensureInit()` to guarantee services are ready before processing.
- **Hook Logic**:
    - Instantiate `const state = new PluginState()` inside the plugin factory function (closure scope).
    - Replace the `while` loop spin-lock with `await state.acquireLock(input.messageID)`.

## Verification
- Verify that `historyService` is fully hydrated before `quotaService` attempts to use it.

### Debugging Quota Injection Issues
If the quota footer is not appearing at the end of conversations, check the `quotas-debug.log` (default: `~/.local/share/opencode/quotas-debug.log`).
- **skip:reasoning**: The message was detected as a thinking/reasoning block.
- **skip:subagent**: The message was from a subagent and the parent wasn't "plan" or "build".
- **skip:footer_present**: The footer was already injected.


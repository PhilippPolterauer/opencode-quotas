# ISSUE-004: Memory Leak in PluginState

**Severity**: High  
**Category**: Performance / Memory Management  
**File(s)**: `src/plugin-state.ts`

## Problem Description

The `PluginState` class maintains a `Set<string>` of processed message IDs that grows indefinitely:

```typescript
export class PluginState {
    private processedMessages = new Set<string>();
    private locks = new Map<string, Promise<void>>();
    // ...
    markProcessed(messageId: string): void {
        this.processedMessages.add(messageId);
    }
}
```

There is **no eviction strategy**. In a long-running OpenCode session:
- Every assistant message adds an entry
- Heavy users may generate 100+ messages per hour
- After 24 hours of continuous use: potentially thousands of entries

## Impact

- **Memory Growth**: Unbounded memory consumption in long sessions
- **Degraded Performance**: Large Sets have lookup overhead
- **Potential Crash**: In extreme cases, may contribute to OOM

## Root Cause

The deduplication logic was implemented without considering session duration. The original assumption may have been that sessions are short-lived.

## Proposed Solution

### Option A: LRU Cache with Size Limit (Recommended)

Replace the Set with a bounded cache:

```typescript
export class PluginState {
    private static readonly MAX_TRACKED_MESSAGES = 1000;
    private processedMessages: string[] = [];
    private processedSet = new Set<string>();
    private locks = new Map<string, Promise<void>>();

    isProcessed(messageId: string): boolean {
        return this.processedSet.has(messageId);
    }

    markProcessed(messageId: string): void {
        if (this.processedSet.has(messageId)) return;
        
        this.processedSet.add(messageId);
        this.processedMessages.push(messageId);
        
        // Evict oldest entries when limit reached
        while (this.processedMessages.length > PluginState.MAX_TRACKED_MESSAGES) {
            const oldest = this.processedMessages.shift();
            if (oldest) this.processedSet.delete(oldest);
        }
    }
}
```

### Option B: Time-Based Expiration

Track timestamps and evict entries older than N minutes:

```typescript
private processedMessages = new Map<string, number>(); // messageId -> timestamp

markProcessed(messageId: string): void {
    this.processedMessages.set(messageId, Date.now());
    this.cleanup();
}

private cleanup(): void {
    const cutoff = Date.now() - (30 * 60 * 1000); // 30 minutes
    for (const [id, ts] of this.processedMessages) {
        if (ts < cutoff) this.processedMessages.delete(id);
    }
}
```

### Recommendation

**Option A** is simpler and guarantees bounded memory. Since message IDs are UUIDs (no temporal ordering), Option B provides little benefit.

## Implementation Steps

1. [ ] Update `PluginState` to use bounded cache (Option A)
2. [ ] Add constant `MAX_TRACKED_MESSAGES` (recommend 1000)
3. [ ] Update `isProcessed()` to use Set lookup (O(1))
4. [ ] Update `markProcessed()` to evict oldest when full
5. [ ] Add unit test for eviction behavior
6. [ ] Run `npm run typecheck && bun test`

## Testing Strategy

- Test that marking 1001 messages evicts the first one
- Test that `isProcessed()` returns true for recent messages
- Test that `isProcessed()` returns false for evicted messages
- Performance test: marking 10,000 messages should not degrade

## Edge Cases

- **Duplicate Hook Calls**: The PLUGIN_MARKER check in `index.ts:125` provides a secondary safeguard
- **Evicted Message Reprocessed**: Low risk since the marker in text will prevent re-injection

## Estimated Effort

- **Implementation**: 30 minutes
- **Testing**: 30 minutes
- **Total**: ~1 hour

## Success Criteria

- `processedMessages` never exceeds `MAX_TRACKED_MESSAGES`
- Memory usage stabilizes during long sessions
- No duplicate footer injections observed
- All tests pass

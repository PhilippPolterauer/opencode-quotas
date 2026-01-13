# ISSUE-010: Race Condition in QuotaCache

**Severity**: Medium  
**Category**: Concurrency / Correctness  
**File(s)**: `src/quota-cache.ts:61-145`

## Problem Description

The `QuotaCache.refresh()` method has a potential race condition between checking `inFlight` and setting it:

```typescript
public async refresh(): Promise<void> {
    logger.debug("cache:refresh_start", { inFlight: !!this.inFlight });
    
    if (this.inFlight) {          // Check (T1 reads null)
        return this.inFlight;      // 
    }                              // T2 also reads null here (race window)

    this.inFlight = (async () => { // Set (T1 sets promise)
        // ... async work ...      // T2 also creates a separate promise
    })();

    return this.inFlight;
}
```

In a high-concurrency scenario:
1. Thread T1 checks `inFlight`, sees `null`
2. Thread T2 checks `inFlight`, sees `null` (before T1 sets it)
3. Both threads create separate promises
4. Both make duplicate API requests

## Impact

- **Duplicate Requests**: Two identical API calls instead of one
- **Inconsistent State**: Two different responses may be stored
- **Wasted Resources**: Network and API quota consumed unnecessarily

## Likelihood

**Low** in normal usage since:
- JavaScript is single-threaded
- The race window is very small
- Polling happens every 60s (after ISSUE-009 fix)

But possible if:
- Multiple `refresh()` calls are made synchronously
- `start()` and manual `refresh()` called simultaneously

## Root Cause

The check-then-set pattern is not atomic. While JavaScript is single-threaded, the code between check and set could yield to other code.

## Proposed Solution

### Synchronous Assignment Before Async

```typescript
public async refresh(): Promise<void> {
    // If already in flight, return the existing promise
    if (this.inFlight) {
        logger.debug("cache:refresh_coalesced", { inFlight: true });
        return this.inFlight;
    }

    // Immediately create and store the promise before any await
    const refreshPromise = this.doRefresh();
    this.inFlight = refreshPromise;
    
    return refreshPromise;
}

private async doRefresh(): Promise<void> {
    logger.debug("cache:refresh_start", { 
        providerCount: this.providers.length,
        refreshIntervalMs: this.options.refreshIntervalMs,
    });
    
    try {
        const results = await Promise.all(
            this.providers.map(async (p) => {
                // ... existing provider fetch logic ...
            })
        );

        this.state = {
            data: results.flat(),
            fetchedAt: new Date(),
            lastError: null,
        };

        if (this.options.historyService) {
            void this.options.historyService.append(this.state.data);
        }
    } catch (e) {
        this.state = {
            ...this.state,
            lastError: e,
        };
    } finally {
        this.inFlight = null;
    }
}
```

The key change is that `this.inFlight = refreshPromise` happens **synchronously** before any `await`, eliminating the race window.

## Alternative: Mutex Pattern

For more complex scenarios, a proper mutex could be used:

```typescript
private refreshLock = Promise.resolve();

public async refresh(): Promise<void> {
    this.refreshLock = this.refreshLock.then(() => this.doRefresh());
    return this.refreshLock;
}
```

## Implementation Steps

1. [ ] Refactor `refresh()` to separate promise creation from async work
2. [ ] Ensure `this.inFlight` is set synchronously
3. [ ] Add debug logging for coalesced requests
4. [ ] Run `npm run typecheck && bun test`
5. [ ] Run concurrency test: `bun test tests/integration/concurrency.test.ts`

## Testing Strategy

- Existing concurrency tests should pass
- Add test: call `refresh()` 100 times in a loop, verify only one actual fetch
- Verify API mocks are called exactly once per polling cycle

## Estimated Effort

- **Implementation**: 30 minutes
- **Testing**: 30 minutes
- **Total**: ~1 hour

## Success Criteria

- No duplicate API requests during concurrent `refresh()` calls
- Existing functionality preserved
- All tests pass
- Race condition eliminated

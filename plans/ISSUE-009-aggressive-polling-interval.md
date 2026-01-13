# ISSUE-009: Aggressive Default Polling Interval

**Severity**: High  
**Category**: Configuration / Performance  
**File(s)**: `src/defaults.ts:42`

## Problem Description

The default polling interval is set to **1 second** (1000ms):

```typescript
// defaults.ts line 42
pollingInterval: 1_000,
```

This is extremely aggressive for quota checking:
- Quotas rarely change more than a few times per hour
- 1 request/second = 3,600 requests/hour to external APIs
- Rate limiting from Antigravity/Codex APIs likely

Compare to the AGENTS.md documentation which states:
> "The plugin polls at a configurable interval (default 1 min)"

**The code doesn't match the documentation!**

## Impact

- **API Rate Limiting**: May trigger rate limits on Antigravity/Codex
- **Network Overhead**: Unnecessary bandwidth usage
- **Battery Drain**: Frequent network requests on laptops
- **CPU Usage**: Constant JSON parsing and processing
- **Documentation Mismatch**: Users expect 60s, get 1s

## Root Cause

Likely a debugging value that was never reset to production default. The constant `60_000` is referenced in documentation and comments but the actual value is `1_000`.

## Proposed Solution

### Fix Default Value

Change `src/defaults.ts:42`:

```typescript
// Before
pollingInterval: 1_000,

// After
pollingInterval: 60_000,  // 1 minute (60 seconds * 1000 ms)
```

### Add Validation

In `quota-service.ts`, add validation for user-configured values:

```typescript
if (userConfig.pollingInterval !== undefined) {
    const interval = Number(userConfig.pollingInterval);
    if (interval < 10_000) {
        console.warn("[QuotaService] pollingInterval below 10s is not recommended");
    }
    if (interval < 1_000) {
        console.warn("[QuotaService] pollingInterval below 1s is ignored, using 1s minimum");
        this.config.pollingInterval = 1_000;
    } else {
        this.config.pollingInterval = interval;
    }
}
```

## Implementation Steps

1. [ ] Change `pollingInterval: 1_000` to `pollingInterval: 60_000` in `defaults.ts`
2. [ ] Add minimum interval validation in `quota-service.ts`
3. [ ] Update any tests that depend on the 1s interval
4. [ ] Run `npm run typecheck && bun test`
5. [ ] Verify documentation matches code

## Risk Assessment

**Low Risk** - This change:
- Reduces network requests by 60x
- Matches documented behavior
- Is configurable by users if faster polling is needed

## Testing Strategy

- Run all tests (some may timeout if they depend on 1s polling)
- Manual test to verify cache refreshes approximately every minute
- Verify user config can override to faster intervals if desired

## Related Configuration

The cache options are passed from `QuotaService` to `QuotaCache`:
```typescript
quotaCache = new QuotaCache(providers, {
    refreshIntervalMs: config.pollingInterval ?? 60_000,  // Line 57 index.ts
    // ...
});
```

So fixing `defaults.ts` will fix both the default and the fallback.

## Estimated Effort

- **Implementation**: 10 minutes
- **Testing**: 20 minutes
- **Total**: ~30 minutes

## Success Criteria

- Default polling interval is 60 seconds (60,000 ms)
- Documentation matches implementation
- Network request frequency is reasonable
- All tests pass

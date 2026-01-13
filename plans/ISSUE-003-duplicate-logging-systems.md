# ISSUE-003: Duplicate Logging Systems

**Severity**: Medium  
**Category**: Code Quality / Technical Debt  
**File(s)**: 
- `src/logger.ts`
- `src/utils/debug.ts`

## Problem Description

There are two overlapping logging mechanisms:

### 1. Logger Singleton (`src/logger.ts`)
```typescript
export class Logger {
    private static instance: Logger;
    private debugEnabled: boolean = false;
    // ...
    public debug(msg: string, data?: any): void { ... }
    public info(msg: string, data?: any): void { ... }
    public error(msg: string, data?: any): void { ... }
}
export const logger = Logger.getInstance();
```

### 2. Legacy Debug Function (`src/utils/debug.ts`)
```typescript
/**
 * @deprecated Use logger directly instead
 */
export function logToDebugFile(msg: string, data: any, enabled: boolean) {
    if (enabled) {
        logger.debug(msg, data);
    }
}
```

The legacy function is marked `@deprecated` but is still actively used in `src/providers/codex.ts` (12 call sites).

## Impact

- **Inconsistency**: Two different APIs for the same functionality
- **Confusion**: New contributors may not know which to use
- **Redundant Code**: The wrapper function adds no value over `logger.debug()`
- **Extra Parameter**: `logToDebugFile` requires an `enabled` boolean which is redundant since `logger.setDebug()` controls this

## Root Cause

The logging was refactored from a standalone function to a singleton class, but the legacy function was kept for backward compatibility and never fully migrated.

## Proposed Solution

### Remove `logToDebugFile` and Use Logger Directly

**Before** (codex.ts):
```typescript
logToDebugFile(
    "provider:codex:fetch_start",
    { authPath: AUTH_PATH },
    process.env.OPENCODE_QUOTAS_DEBUG === "1",
);
```

**After** (codex.ts):
```typescript
logger.debug("provider:codex:fetch_start", { authPath: AUTH_PATH });
```

The debug check is handled internally by `Logger.debug()` based on `debugEnabled`.

## Implementation Steps

1. [ ] In `src/providers/codex.ts`, replace all `logToDebugFile()` calls with `logger.debug()`
2. [ ] Remove the `process.env.OPENCODE_QUOTAS_DEBUG === "1"` check from each call site
3. [ ] Update `src/index.ts` or `quota-service.ts` to call `logger.setDebug()` based on:
   - `config.debug` from quotas.json
   - `process.env.OPENCODE_QUOTAS_DEBUG === "1"` as a fallback
4. [ ] Delete `src/utils/debug.ts` entirely
5. [ ] Remove unused import from `codex.ts`
6. [ ] Run `npm run typecheck && bun test`

## Environment Variable Handling

Ensure the logger respects the environment variable early in initialization:

```typescript
// In logger.ts constructor or getInstance()
if (process.env.OPENCODE_QUOTAS_DEBUG === "1") {
    this.debugEnabled = true;
}
```

Or in `QuotaService.init()`:
```typescript
if (process.env.OPENCODE_QUOTAS_DEBUG === "1") {
    logger.setDebug(true);
}
```

## Testing Strategy

- Verify debug logs are still written when `debug: true` in config
- Verify debug logs are written when `OPENCODE_QUOTAS_DEBUG=1`
- Verify no debug logs when both are false/unset
- All existing tests should pass

## Estimated Effort

- **Refactoring codex.ts**: 15 minutes
- **Deleting debug.ts**: 5 minutes
- **Environment variable handling**: 15 minutes
- **Testing**: 15 minutes
- **Total**: ~1 hour

## Success Criteria

- `src/utils/debug.ts` is deleted
- All logging goes through `logger` singleton
- Environment variable `OPENCODE_QUOTAS_DEBUG=1` still works
- No references to `logToDebugFile` remain in codebase

# ISSUE-007: Silent Errors in HistoryService

**Severity**: Medium  
**Category**: Error Handling / Observability  
**File(s)**: `src/services/history-service.ts:28-32, 109-111`

## Problem Description

The `HistoryService` silently swallows errors in multiple places:

### 1. Initialization (lines 28-32)
```typescript
} catch (e) {
    // If debug log was available we would use it, but console.warn is fine for now
    // as this service is often initialized before QuotaService config is loaded.
    this.data = {};  // Silent fallback to empty
}
```

### 2. Saving (lines 109-111)
```typescript
} catch (e) {
    // Silently fail to avoid crashing the main process
}
```

While avoiding crashes is good, completely silent failures make debugging impossible. Users may wonder why ETTL predictions aren't working without realizing history isn't being saved.

## Impact

- **Silent Failures**: Disk full, permission errors, or invalid JSON go unnoticed
- **No Debugging Clues**: Users can't diagnose why predictions aren't working
- **Data Loss**: History may not persist, losing prediction accuracy

## Root Cause

Defensive programming taken too far. The comment acknowledges "debug log was available we would use it" but doesn't actually use it.

## Proposed Solution

### Use Logger for Error Reporting

The `logger` singleton is available and can be imported:

```typescript
import { logger } from "../logger";

async init(): Promise<void> {
    try {
        // ...existing code...
    } catch (e) {
        logger.error("history-service:init_failed", { 
            path: this.historyPath, 
            error: e 
        });
        this.data = {};  // Still fallback, but now we logged it
    }
}

private save(): void {
    if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
        try {
            await writeFile(this.historyPath, JSON.stringify(this.data, null, 2), "utf-8");
        } catch (e) {
            logger.error("history-service:save_failed", { 
                path: this.historyPath, 
                error: e 
            });
            // Still don't crash, but at least we logged it
        }
        this.saveTimeout = null;
    }, 5000);
}
```

## Implementation Steps

1. [ ] Add `import { logger } from "../logger";` to `history-service.ts`
2. [ ] Add `logger.error()` call in the `init()` catch block
3. [ ] Add `logger.error()` call in the `save()` catch block
4. [ ] Optionally add `logger.debug()` for successful operations
5. [ ] Run `npm run typecheck && bun test`

## Additional Improvements

Consider adding a health check method:

```typescript
public getStatus(): { healthy: boolean; lastError?: unknown } {
    return {
        healthy: Object.keys(this.data).length > 0 || this.lastSaveSucceeded,
        lastError: this.lastSaveError,
    };
}
```

This could be exposed via the CLI or status API.

## Testing Strategy

- Mock `writeFile` to throw an error
- Verify the error is logged
- Verify the service doesn't crash
- Verify the service still functions (returns empty history)

## Estimated Effort

- **Implementation**: 20 minutes
- **Testing**: 15 minutes
- **Total**: ~35 minutes

## Success Criteria

- Errors are logged to `quotas-debug.log` when `debug: true`
- Errors are logged regardless of debug mode (using `logger.error`)
- Service still doesn't crash on errors
- Users can diagnose history save failures via logs

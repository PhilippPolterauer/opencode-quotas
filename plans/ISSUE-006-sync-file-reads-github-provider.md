# ISSUE-006: Synchronous File Reads in GitHub Provider

**Severity**: Medium  
**Category**: Performance / Best Practices  
**File(s)**: `src/providers/github.ts:1, 18-27`

## Problem Description

The GitHub provider uses synchronous file reading:

```typescript
import { readFileSync } from "node:fs";  // Line 1

function readAuthFile(): AuthFile | null {
    for (const path of [AUTH_PATH_LOCAL, AUTH_PATH_CONFIG]) {
        try {
            const raw = readFileSync(path, "utf8");  // Line 21 - SYNC!
            return JSON.parse(raw) as AuthFile;
        } catch {
            continue;
        }
    }
    return null;
}
```

This blocks the event loop during file I/O, which:
- Delays all other async operations
- Creates poor user experience if disk is slow
- Is inconsistent with other providers that use async reads

## Impact

- **Blocked Event Loop**: File reads block all JavaScript execution
- **Inconsistency**: Codex provider uses `readFile` (async), GitHub uses `readFileSync`
- **Scalability**: Won't scale well if auth file grows or disk is slow

## Root Cause

Copy-paste from a synchronous example without considering the async context.

## Proposed Solution

### Convert to Async

```typescript
import { readFile } from "node:fs/promises";  // Async version

async function readAuthFile(): Promise<AuthFile | null> {
    for (const path of [AUTH_PATH_LOCAL, AUTH_PATH_CONFIG]) {
        try {
            const raw = await readFile(path, "utf8");
            return JSON.parse(raw) as AuthFile;
        } catch {
            continue;
        }
    }
    return null;
}
```

Update the caller in `fetchQuota()`:

```typescript
async fetchQuota(): Promise<QuotaData[]> {
    const auth = await readAuthFile();  // Add await
    if (!auth) {
        throw new Error("Opencode auth.json not found");
    }
    // ...
}
```

## Implementation Steps

1. [ ] Change import from `readFileSync` to `readFile` from `node:fs/promises`
2. [ ] Make `readAuthFile()` async, return `Promise<AuthFile | null>`
3. [ ] Add `await` at the call site in `fetchQuota()`
4. [ ] Run `npm run typecheck && bun test`
5. [ ] Test the GitHub provider manually if credentials are available

## Consistency Check

After this fix, all providers will use async file reads:

| Provider | File Read Method |
|----------|------------------|
| Codex | `readFile` (async) |
| Antigravity | `readFile` (async) |
| GitHub | `readFile` (async) - after fix |

## Testing Strategy

- Run `bun test tests/github-provider.test.ts`
- Mock the file system to test both success and failure paths
- Verify the function signature change doesn't break consumers

## Estimated Effort

- **Implementation**: 15 minutes
- **Testing**: 15 minutes
- **Total**: ~30 minutes

## Success Criteria

- No `readFileSync` calls remain in the codebase
- GitHub provider works identically to before
- All tests pass
- Event loop is not blocked during auth file reads

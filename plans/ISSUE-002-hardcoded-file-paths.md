# ISSUE-002: Hardcoded File Paths

**Severity**: High  
**Category**: Cross-Platform Compatibility  
**File(s)**: 
- `src/providers/codex.ts:7`
- `src/providers/antigravity/auth.ts:46-47`
- `src/providers/github.ts:6-7`
- `src/services/history-service.ts:14`
- `src/logger.ts:13`

## Problem Description

Multiple files hardcode paths using Linux/Unix conventions:

```typescript
// codex.ts
const AUTH_PATH = join(homedir(), ".local", "share", "opencode", "auth.json");

// auth.ts
join(homedir(), ".config", "opencode", "antigravity-accounts.json");

// history-service.ts
join(homedir(), ".local", "share", "opencode", "quota-history.json");

// logger.ts
join(homedir(), ".local", "share", "opencode", DEBUG_LOG_FILENAME);
```

These paths follow the XDG Base Directory Specification which is not honored on Windows or macOS.

## Impact

- **Windows**: Files will be created in `C:\Users\<user>\.local\share\opencode\` which is non-standard
- **macOS**: Files should be in `~/Library/Application Support/` not `~/.local/share/`
- **Confusion**: Users may struggle to find config/data files on non-Linux systems

## Root Cause

Paths were written for a Linux-first development environment without abstraction for OS differences.

## Proposed Solution

### Create Path Utility Module

Create `src/utils/paths.ts`:

```typescript
import { homedir, platform } from "node:os";
import { join } from "node:path";

export function getDataDirectory(): string {
    const home = homedir();
    
    switch (platform()) {
        case "win32":
            return process.env.APPDATA 
                ? join(process.env.APPDATA, "opencode")
                : join(home, "AppData", "Roaming", "opencode");
        case "darwin":
            return join(home, "Library", "Application Support", "opencode");
        default:
            // Linux and others: XDG_DATA_HOME or fallback
            return process.env.XDG_DATA_HOME
                ? join(process.env.XDG_DATA_HOME, "opencode")
                : join(home, ".local", "share", "opencode");
    }
}

export function getConfigDirectory(): string {
    const home = homedir();
    
    switch (platform()) {
        case "win32":
            return process.env.APPDATA 
                ? join(process.env.APPDATA, "opencode")
                : join(home, "AppData", "Roaming", "opencode");
        case "darwin":
            return join(home, "Library", "Application Support", "opencode");
        default:
            // Linux: XDG_CONFIG_HOME or fallback
            return process.env.XDG_CONFIG_HOME
                ? join(process.env.XDG_CONFIG_HOME, "opencode")
                : join(home, ".config", "opencode");
    }
}

// Convenience exports
export const AUTH_FILE = () => join(getDataDirectory(), "auth.json");
export const HISTORY_FILE = () => join(getDataDirectory(), "quota-history.json");
export const DEBUG_LOG_FILE = () => join(getDataDirectory(), "quotas-debug.log");
export const ANTIGRAVITY_ACCOUNTS_FILE = () => join(getConfigDirectory(), "antigravity-accounts.json");
```

## Implementation Steps

1. [ ] Create `src/utils/paths.ts` with platform-aware path functions
2. [ ] Update `src/providers/codex.ts` to use `AUTH_FILE()`
3. [ ] Update `src/providers/antigravity/auth.ts` to use `ANTIGRAVITY_ACCOUNTS_FILE()`
4. [ ] Update `src/providers/github.ts` to use `AUTH_FILE()` and `getConfigDirectory()`
5. [ ] Update `src/services/history-service.ts` to use `HISTORY_FILE()`
6. [ ] Update `src/logger.ts` to use `DEBUG_LOG_FILE()`
7. [ ] Add unit tests for path functions across platforms (mock `platform()`)
8. [ ] Run `npm run typecheck && bun test`
9. [ ] Test manually on Windows/macOS if available

## Testing Strategy

- Mock `node:os` `platform()` function to test all branches
- Verify environment variable overrides work (`XDG_DATA_HOME`, `APPDATA`)
- Existing tests should continue to pass

## Estimated Effort

- **Path utility creation**: 30 minutes
- **Refactoring all consumers**: 1 hour
- **Testing**: 1 hour
- **Total**: ~2.5 hours

## Success Criteria

- All paths use the new utility functions
- Paths are correct for Linux, macOS, and Windows
- XDG environment variables are respected on Linux
- No hardcoded `.local/share` or `.config` strings remain in provider files

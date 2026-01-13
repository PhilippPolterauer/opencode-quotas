# ISSUE-008: GitHub Provider Not Registered

**Severity**: High  
**Category**: Missing Feature / Dead Code  
**File(s)**: 
- `src/providers/github.ts` (exists but unused)
- `src/services/quota-service.ts` (doesn't register it)

## Problem Description

A complete GitHub Copilot provider exists (`src/providers/github.ts`, 161 lines) but is **never registered** in the system:

```typescript
// quota-service.ts lines 99-122
// Register Antigravity
try {
    registry.register(createAntigravityProvider(...));
} catch (e) { ... }

// Register Codex
try {
    registry.register(createCodexProvider());
} catch (e) { ... }

// GitHub Provider: NOT REGISTERED!
```

The GitHub provider file shows sophisticated logic:
- SKU parsing for free/pro detection
- Monthly usage aggregation
- API deprecation handling

But none of this code ever executes.

## Impact

- **Dead Code**: 161 lines that serve no purpose
- **Missing Feature**: GitHub Copilot quotas not shown to users
- **User Confusion**: Users may expect GitHub quota support based on file existence
- **Wasted Effort**: Development time was spent on unused code

## Root Cause

The provider was developed but either:
1. Never integrated due to GitHub API limitations (noted in comments: "endpoint is often deprecated")
2. Registration was accidentally removed during refactoring

## Proposed Solution

### Option A: Register the Provider (Recommended)

Add GitHub provider registration in `quota-service.ts`:

```typescript
// Register GitHub Copilot
try {
    registry.register(createGithubProvider());
    logger.debug("init:provider_registered", { id: "github-copilot" });
} catch (e) {
    logger.error("init:provider_failed", { id: "github-copilot", error: e });
    console.warn("[QuotaService] Failed to initialize GitHub provider:", e);
}
```

Add import:
```typescript
import { createGithubProvider } from "../providers/github";
```

### Option B: Remove Dead Code

If the GitHub provider is intentionally disabled due to API issues:
1. Delete `src/providers/github.ts`
2. Delete `tests/github-provider.test.ts`
3. Document why GitHub isn't supported in README

### Recommendation

**Option A** is preferred because:
- The code handles API deprecation gracefully (returns warning in `info` field)
- Provider failures don't crash the plugin (try/catch)
- Users with valid GitHub auth get useful quota information
- SKU-based pro/free detection still works

## Implementation Steps (Option A)

1. [ ] Add import for `createGithubProvider` in `quota-service.ts`
2. [ ] Add registration block after Codex registration
3. [ ] Add to defaults.ts groups if needed:
   ```typescript
   groups: {
       "github": [
           { name: "Copilot", patterns: ["copilot"] }
       ]
   }
   ```
4. [ ] Run `npm run typecheck && bun test`
5. [ ] Test manually with GitHub auth configured

## Testing Strategy

- Run existing `bun test tests/github-provider.test.ts`
- Verify provider is listed when calling `quotaService.getProviders()`
- Test with mock GitHub auth to verify quota display
- Test with missing auth to verify graceful failure

## API Deprecation Handling

The provider already handles deprecated APIs:
```typescript
if (response.status === 404) {
    apiWarning = "404";
}
// ...
if (apiWarning) {
    infoParts.push("Service Currently Unavailable (API Deprecated)");
}
```

This means even if the GitHub API returns 404, the plugin won't crash.

## Estimated Effort

- **Option A**: 30 minutes
- **Option B**: 20 minutes

## Success Criteria

- GitHub Copilot quotas appear in the table (when auth is configured)
- Graceful degradation when GitHub API is unavailable
- All tests pass
- No crashes during initialization

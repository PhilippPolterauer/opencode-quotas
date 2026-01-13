# ISSUE-012: Exposed OAuth Client Secret

**Severity**: Low (with explanation)  
**Category**: Security / Best Practices  
**File(s)**: `src/providers/antigravity/auth.ts:8-10`

## Problem Description

OAuth client credentials are hardcoded in the source code:

```typescript
const ANTIGRAVITY_CLIENT_ID =
    "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const ANTIGRAVITY_CLIENT_SECRET = "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";
```

At first glance, this appears to be a serious security vulnerability.

## Why This Is Low Severity

The code includes a comment explaining the situation:

```typescript
// Note: Hardcoded Client ID and Secret are standard for Google's "Installed Application" 
// OAuth flow (Public Clients). Security relies on the user's refresh_token stored
// locally in ~/.config/opencode/antigravity-accounts.json, not this secret.
```

This is correct. According to [Google's OAuth2 documentation](https://developers.google.com/identity/protocols/oauth2/native-app):

> **Native applications** should use the **Installed Application** flow, which does not require the client secret to be kept confidential.

The security model for native apps relies on:
1. The refresh token (stored locally, never shared)
2. The authorization code (one-time use, exchanged for tokens)

**Not** the client secret, which is effectively public.

## Impact

- **Low Security Risk**: This is standard practice for native/CLI apps
- **Code Quality Issue**: Secrets in source code trigger security scanners
- **Perception Problem**: May alarm security reviewers unfamiliar with OAuth native app flows

## Proposed Solution

### Option A: Move to Config File (Recommended)

Instead of hardcoding, read from a config file that's bundled with the distribution:

```typescript
// Create src/providers/antigravity/oauth-config.json
{
    "clientId": "1071006060591-...",
    "clientSecret": "GOCSPX-...",
    "note": "Public client credentials for Installed Application OAuth flow"
}
```

```typescript
// auth.ts
import oauthConfig from "./oauth-config.json" assert { type: "json" };

const ANTIGRAVITY_CLIENT_ID = oauthConfig.clientId;
const ANTIGRAVITY_CLIENT_SECRET = oauthConfig.clientSecret;
```

Benefits:
- Secrets not directly in .ts files
- Can be excluded from certain scans
- Clearly separated as configuration

### Option B: Environment Variable with Fallback

```typescript
const ANTIGRAVITY_CLIENT_ID = process.env.ANTIGRAVITY_CLIENT_ID 
    ?? "1071006060591-...";
const ANTIGRAVITY_CLIENT_SECRET = process.env.ANTIGRAVITY_CLIENT_SECRET 
    ?? "GOCSPX-...";
```

Benefits:
- Allows users to provide their own Google Cloud project credentials
- Default still works for most users

### Option C: Accept and Document (Minimal)

Keep the code as-is but:
1. Add to README explaining this is intentional
2. Add `.gitleaksignore` or similar to suppress scanner warnings
3. Ensure the comment is prominent

```typescript
/**
 * PUBLIC OAUTH CREDENTIALS - INTENTIONALLY COMMITTED
 * 
 * These are "Installed Application" credentials for Google's Native App OAuth flow.
 * Per Google's documentation, the client_secret for native applications is NOT
 * considered confidential. Security relies solely on the user's refresh_token.
 * 
 * See: https://developers.google.com/identity/protocols/oauth2/native-app
 */
const ANTIGRAVITY_CLIENT_ID = "...";
```

## Implementation Steps (Option A)

1. [ ] Create `src/providers/antigravity/oauth-config.json`
2. [ ] Move credentials to JSON file
3. [ ] Update imports in `auth.ts`
4. [ ] Add JSON file to `files` in `package.json` if not already included
5. [ ] Run `npm run typecheck && bun test`

## Estimated Effort

- **Option A**: 30 minutes
- **Option B**: 20 minutes
- **Option C**: 10 minutes

## Recommendation

**Option C** (Accept and Document) is actually the most honest approach. Moving secrets to a JSON file doesn't improve security - the values are still shipped with the package. It just adds complexity.

The best fix is to:
1. Expand the existing comment to be more detailed
2. Add a security note to the README
3. Suppress automated scanner warnings

## Success Criteria

- Security scanners don't flag false positives (if suppressed)
- Documentation explains the security model
- No actual security regression
- Developers understand why this is acceptable

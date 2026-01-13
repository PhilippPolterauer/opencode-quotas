# Plan: Security & Testing

## Objective
Understand the security model, confirm the hardcoded secret is standard practice, and establish a testing baseline for the new logic.

## Investigation Result: Hardcoded Secret
After searching for official documentation and the official auth plugin (`shekohex/opencode-google-antigravity-auth`), it is confirmed that the hardcoded `ANTIGRAVITY_CLIENT_SECRET` is **intentional and correct** for Google's "Installed Application" OAuth flow.

1.  **Public Client**: Desktop/Mobile apps are considered "public clients". They cannot keep secrets confidential.
2.  **Security Model**: The security relies on the user's `refresh_token` (stored in `antigravity-accounts.json`), NOT the client secret.
3.  **Refresh Flow**: The secret is used to exchange the `refresh_token` for an `access_token`.

**Conclusion**: Do **NOT** remove or externalize the secret. Doing so would break the OAuth flow.

## Changes

### 1. Update `src/providers/antigravity/auth.ts`
- Add a comment explaining why the secret is hardcoded (referencing "Installed Application" OAuth flow).
- No functional change required for security.

### 2. New Tests

#### `tests/unit/prediction.test.ts`
- **Scenario A (Steady State)**: Linear usage, ensure ETTL is accurate.
- **Scenario B (Burst)**: Low usage for 50 mins, high usage for last 10 mins.
    - Verify ETTL reflects the high usage rate (short window).
- **Scenario C (Idle)**: Usage stopped 10 mins ago.
    - Verify ETTL is Infinity.

#### `tests/integration/concurrency.test.ts`
- **Race Condition Simulation**:
    - Spawn 5 parallel calls to the hook with the same `messageID`.
    - Verify that `processTask` is executed exactly once.

# Plan: Antigravity Refactor

## Objective
Remove legacy configuration handling and reduce file count by merging the Antigravity provider implementation.

## Motivation
- `src/providers/antigravity/config.ts` implements a legacy configuration loader that checks for `antigravity-quota.json`. The main `QuotaService` already handles central configuration via `quotas.json`.
- `src/providers/antigravity/cloud.ts` is small and tightly coupled to the provider logic.
- Merging these reduces complexity and file jumps.

## Tasks

### 1. Delete `src/providers/antigravity/config.ts`
- Remove the file entirely.
- Move any useful constants (like `DEFAULT_INDICATORS`) to `src/providers/antigravity/provider.ts`.

### 2. Update `AntigravityProvider` Signature
- Update `createAntigravityProvider` in `src/providers/antigravity/provider.ts` to accept the full configuration (or relevant parts) as an argument, instead of loading it internally.
- Use the config passed from `QuotaService`.

### 3. Merge `cloud.ts` into `provider.ts`
- Move the `fetchCloudQuota` function and its related interfaces (`CloudQuotaResult`, `ModelConfig`, etc.) directly into `src/providers/antigravity/provider.ts`.
- Delete `src/providers/antigravity/cloud.ts`.

### 4. Update Exports
- Update `src/providers/antigravity/index.ts` to export everything from `provider.ts`.

## Verification
- Ensure `bun test` passes (especially existing Antigravity tests).

# ISSUE-011: Missing Input Validation

**Severity**: Low  
**Category**: Robustness / Defensive Programming  
**File(s)**: 
- `src/services/quota-service.ts:39-85`
- `src/ui/progress-bar.ts:108-117`
- `src/ui/quota-table.ts:36-47`

## Problem Description

User configuration from `quotas.json` and provider responses are not validated:

### 1. QuotaConfig Parsing (quota-service.ts)
```typescript
const rawConfig = await readFile(configPath, "utf-8");
const userConfig = JSON.parse(rawConfig);

// Direct assignment without validation:
if (userConfig.pollingInterval !== undefined) {
    this.config.pollingInterval = userConfig.pollingInterval;  // Could be string, object, negative, etc.
}
```

### 2. Progress Bar Rendering (progress-bar.ts)
```typescript
export function renderQuotaBarParts(
    used: number,    // What if NaN or negative?
    limit: number,   // What if zero (division by zero)?
    options: { ... }
): RenderQuotaBarParts {
    // ...
    ratio = displayValue / limit;  // Division by zero if limit === 0
}
```

### 3. Quota Table (quota-table.ts)
```typescript
const isUnlimited = quota.limit === null || quota.limit <= 0;
// Good check, but what if quota.used is NaN or undefined?
```

## Impact

- **Runtime Errors**: Invalid data may cause crashes or NaN propagation
- **Display Bugs**: NaN% or Infinity% in the UI
- **Silent Corruption**: Bad values stored in history file

## Root Cause

Trust in external data without validation. The schema file exists (`schemas/quotas.schema.json`) but isn't enforced at runtime.

## Proposed Solution

### 1. Create Validation Utility

Create `src/utils/validation.ts`:

```typescript
export function isValidNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function validatePollingInterval(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1000) {
        return 60_000; // Default to 1 minute
    }
    return Math.max(1000, num); // Minimum 1 second
}

export function validateQuotaData(data: unknown): QuotaData | null {
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    
    if (typeof d.id !== "string" || !d.id) return null;
    if (typeof d.providerName !== "string") return null;
    if (!isValidNumber(d.used)) return null;
    // limit can be null for unlimited
    if (d.limit !== null && !isValidNumber(d.limit)) return null;
    
    return data as QuotaData;
}
```

### 2. Apply Validation in Progress Bar

```typescript
export function renderQuotaBarParts(
    used: number,
    limit: number,
    options: { ... }
): RenderQuotaBarParts {
    // Guard against invalid inputs
    if (!Number.isFinite(used)) used = 0;
    if (!Number.isFinite(limit) || limit <= 0) {
        return createUnlimitedBar(options);
    }
    
    // Safe division
    const ratio = limit > 0 ? used / limit : 0;
    // ...
}
```

### 3. Validate Config on Load

```typescript
if (userConfig.pollingInterval !== undefined) {
    this.config.pollingInterval = validatePollingInterval(userConfig.pollingInterval);
}
```

## Implementation Steps

1. [ ] Create `src/utils/validation.ts` with helper functions
2. [ ] Add validation in `quota-service.ts` config loading
3. [ ] Add guards in `progress-bar.ts` for used/limit
4. [ ] Add guards in `quota-table.ts` for quota data
5. [ ] Validate provider responses before storing in cache
6. [ ] Run `npm run typecheck && bun test`
7. [ ] Add tests for edge cases (NaN, negative, undefined)

## Testing Strategy

- Test with `pollingInterval: "invalid"` in config
- Test with `used: NaN` in QuotaData
- Test with `limit: 0` in QuotaData
- Test with `limit: -1` in QuotaData
- Verify graceful degradation (defaults used, no crashes)

## Estimated Effort

- **Validation utility**: 30 minutes
- **Integration**: 45 minutes
- **Testing**: 30 minutes
- **Total**: ~2 hours

## Success Criteria

- Invalid config values are replaced with safe defaults
- Invalid quota data is filtered or normalized
- No NaN/Infinity appears in UI
- No division by zero crashes
- All tests pass

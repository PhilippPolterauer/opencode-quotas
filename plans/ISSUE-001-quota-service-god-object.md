# ISSUE-001: QuotaService God Object

**Severity**: High  
**Category**: Architecture / Maintainability  
**File(s)**: `src/services/quota-service.ts`  

## Problem Description

The `QuotaService` class has grown to 462 lines and handles multiple distinct responsibilities:

1. Configuration loading and merging
2. Provider registration and coordination
3. Quota data processing (filtering, sorting)
4. Aggregation logic (min, max, mean, median, most_critical)
5. Time-to-limit prediction using linear regression
6. Model-to-quota mapping

This violates the **Single Responsibility Principle** and makes the class difficult to test, maintain, and extend. The linear regression logic alone is 75+ lines that could be its own module.

## Impact

- **Testability**: Hard to unit test prediction logic in isolation
- **Maintainability**: Changes to aggregation may accidentally break filtering
- **Extensibility**: Adding new prediction algorithms requires modifying the core service
- **Cognitive Load**: Developers must understand the entire class to make any change

## Root Cause

Organic growth without refactoring milestones. Features were added incrementally to the existing service rather than extracted into focused modules.

## Proposed Solution

### Phase 1: Extract PredictionEngine (Priority)

Create a new `src/services/prediction-engine.ts` module:

```typescript
export interface IPredictionEngine {
    predictTimeToLimit(quotaId: string, windowMinutes: number, shortWindowMinutes?: number): number;
}

export class LinearRegressionPredictionEngine implements IPredictionEngine {
    constructor(private historyService: IHistoryService) {}
    
    predictTimeToLimit(quotaId: string, windowMinutes: number, shortWindowMinutes?: number): number {
        // Move lines 388-460 from QuotaService here
    }
    
    private calculateSlope(history: { timestamp: number; used: number }[]): number {
        // Move lines 388-408 here
    }
}
```

### Phase 2: Extract AggregationService

Create `src/services/aggregation-service.ts`:

```typescript
export class AggregationService {
    aggregateMostCritical(quotas: QuotaData[], predictionEngine: IPredictionEngine): QuotaData | null;
    aggregateMax(quotas: QuotaData[]): QuotaData;
    aggregateMin(quotas: QuotaData[]): QuotaData;
    aggregateAverage(quotas: QuotaData[], strategy: "mean" | "median"): QuotaData;
}
```

### Phase 3: Extract ConfigLoader

Create `src/services/config-loader.ts` for configuration file handling (lines 39-93).

## Implementation Steps

1. [ ] Create `src/services/prediction-engine.ts` with `LinearRegressionPredictionEngine`
2. [ ] Add interface `IPredictionEngine` to `interfaces.ts`
3. [ ] Update `QuotaService` to accept `IPredictionEngine` via constructor injection
4. [ ] Move `calculateSlope` and `predictTimeToLimit` methods
5. [ ] Create `src/services/aggregation-service.ts`
6. [ ] Move aggregation methods from `QuotaService`
7. [ ] Update tests in `tests/unit/prediction.test.ts` to test new module directly
8. [ ] Update `tests/aggregation.test.ts` to test new module
9. [ ] Run `npm run typecheck && bun test` to verify

## Testing Strategy

- Existing tests should continue to pass
- Add unit tests for `LinearRegressionPredictionEngine` in isolation
- Add unit tests for `AggregationService` with mocked prediction engine
- Integration test to verify wiring is correct

## Estimated Effort

- **Phase 1**: 2-3 hours
- **Phase 2**: 1-2 hours
- **Phase 3**: 1 hour
- **Total**: ~5 hours

## Success Criteria

- `QuotaService` reduced to < 200 lines
- Each new module has focused responsibility
- All 46 tests continue to pass
- No change in user-facing behavior

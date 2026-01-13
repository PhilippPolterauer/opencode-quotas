# Plan: QuotaService Decomposition

## Objective
Refactor the "God Class" `QuotaService` by extracting distinct logical domains into separate services.

## Motivation
`QuotaService` currently handles:
1.  Config loading & management
2.  Provider registration & fetching
3.  Message filtering heuristics (indirectly via index.ts usage)
4.  **Complex Math**: ETTL Prediction (Dual-window regression)
5.  **Business Logic**: Aggregation strategies (most_critical, mean, median, etc.)

This violates SRP (Single Responsibility Principle) and makes testing harder.

## Tasks

### 1. Extract Prediction Logic
- Create `src/services/prediction-service.ts`.
- Move the `predictTimeToLimit` and `calculateSlope` methods here.
- The service should depend only on `IHistoryService`.
- **Interface**:
    ```typescript
    export class PredictionService {
        constructor(historyService: IHistoryService);
        predictTimeToLimit(quotaId: string, windowMinutes?: number, shortWindowMinutes?: number): number;
    }
    ```

### 2. Extract Aggregation Logic
- Create `src/services/aggregation-service.ts`.
- Move `applyAggregation`, `aggregateMostCritical`, `aggregateMax`, `aggregateMin`, `aggregateAverage` here.
- This service will need `PredictionService` to handle the `most_critical` strategy.
- **Interface**:
    ```typescript
    export class AggregationService {
        constructor(predictionService: PredictionService);
        applyAggregation(quotas: QuotaData[], groups: AggregatedGroup[]): QuotaData[];
    }
    ```

### 3. Update QuotaService
- Inject/Instantiate these new services in `init()`.
- Delegate calls in `processQuotas`.
    - Call `predictionService` to enrich individual quotas.
    - Call `aggregationService` to group them.

## Verification
- Run `bun test` to ensure no regression in ETTL or Aggregation behavior.

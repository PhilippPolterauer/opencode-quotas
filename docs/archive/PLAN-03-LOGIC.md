# Plan: Logic & Algorithms (ETTL & Aggregation)

## Objective
Fix "Estimated Time to Limit" (ETTL) accuracy. Current linear regression over a long window fails to capture bursty usage. We will implement a "Dual-Window" approach that respects sudden usage spikes.

## Changes

### 1. Modify `src/services/quota-service.ts`

#### `predictTimeToLimit(quotaId, windowMinutes)`
- **Dual Window Strategy**:
    - Calculate **Long Slope** ($m_{long}$) using the full history (e.g., 60 mins).
    - Calculate **Short Slope** ($m_{short}$) using the most recent 15% of data points or last 5 minutes (whichever contains sufficient data).
- **Conservative Estimation**:
    - Use $m = \max(m_{long}, m_{short})$. This ensures that if usage suddenly spikes, the ETTL drops immediately.
- **Idle Handling**:
    - If the last history point is older than 5 minutes, assume usage has stopped (slope = 0), returning `Infinity` (or a "stale" status).

#### `aggregateMostCritical(quotas)`
- Ensure strict precedence:
    1. **Lowest ETTL**: If any model has a finite ETTL, the one with the shortest time is the representative.
    2. **Highest Utilization**: If all ETTLs are Infinity, pick the model with the highest % used.
- This ensures that a model at 90% usage (idle) doesn't hide a model at 50% usage (burning fast).

## Configuration
- Add `predictionShortWindowMinutes` (default: 5) to `QuotaConfig` interface (optional, for future tuning).

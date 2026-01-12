# Feature Plan: Smart Quota Grouping & Configurable Paths

This plan outlines the implementation of two key features:
1.  **Configurable Config Path**: Allow setting the location of `.opencode/quotas.json` via environment variable.
2.  **Smart Quota Aggregation**: Group multiple quotas and display a single metric based on a configurable strategy (e.g., most critical, max usage).

## 1. Configurable Config Path

**Goal**: Allow users to store their configuration file anywhere, not just in `.opencode/quotas.json`.

**Implementation**:
- Modify `QuotaService.init(directory: string)` in `src/services/quota-service.ts`.
- Check for `process.env.OPENCODE_QUOTAS_CONFIG_PATH`.
- If set, use that absolute path.
- If not set, fall back to `join(directory, ".opencode", "quotas.json")`.

## 2. Smart Quota Aggregation

**Goal**: Aggregate multiple related quotas (e.g., Codex Primary/Secondary) into a single "Smart Group". The system will display a single representative quota based on the chosen strategy.

### 2.1 Data Structures (`src/interfaces.ts`)

Extend `QuotaConfig` to support aggregated groups and defined strategies:

```typescript
export type AggregationStrategy = 
  | "most_critical" // Predicted time-to-limit (requires history)
  | "min"           // Lowest percentage used
  | "max"           // Highest percentage used
  | "mean"          // Average percentage used
  | "median";       // Median percentage used

export interface AggregatedGroup {
    id: string;              // Unique ID for the smart group (e.g. "codex-smart")
    name: string;            // Display name (e.g. "Codex Usage")
    sources: string[];       // IDs of quotas to track (e.g. ["codex-primary", "codex-secondary"])
    strategy?: AggregationStrategy; // Defaults to "most_critical"
    predictionWindowMinutes?: number; // Time window for regression (default: 60)
}

export interface QuotaConfig {
    // ... existing fields
    aggregatedGroups?: AggregatedGroup[];
}
```

**Default Configuration**:
In `src/defaults.ts`, add a default group for Codex:
```typescript
aggregatedGroups: [
    {
        id: "codex-smart",
        name: "Codex Usage",
        sources: ["codex-primary", "codex-secondary"],
        strategy: "most_critical"
    }
]
```

### 2.2 History Service (`src/services/history-service.ts`)

We need to persist usage data to calculate trends for the `most_critical` strategy.

**Responsibilities**:
- **Persistence**: Store usage history in `~/.local/share/opencode/quota-history.json`.
- **Append**: Add new data points `(timestamp, usage)` for a quota.
- **Query**: Retrieve data points within a specific time window.
- **Pruning**: Automatically remove old data points (> max window) to keep file size small.

**Interface**:
```typescript
export class HistoryService {
    async init(): Promise<void>;
    async append(snapshot: QuotaData[]): Promise<void>;
    getHistory(quotaId: string, windowMs: number): HistoryPoint[];
}
```

### 2.3 Aggregation Logic

The `QuotaService` will normalize source quotas to percentages (0.0 - 1.0) before applying the strategy. Unlimited quotas are treated as 0% usage.

**Strategies**:
*   **`max` (Most Restrictive)**: Find quota with highest `used / limit` ratio. Return that specific quota object.
*   **`min` (Least Restrictive)**: Find quota with lowest ratio. Return that specific quota object.
*   **`mean` (Average)**: Calculate average %. Return synthetic quota: `used: <avg_percent>`, `limit: 100`, `unit: "%"`.
*   **`median` (Median)**: Sort by %. Pick median. Return synthetic quota: `used: <median_percent>`, `limit: 100`, `unit: "%"`.
*   **`most_critical` (Predictive - DEFAULT)**:
    *   Use `HistoryService` to predict `TimeToLimit` for each source via Linear Regression.
    *   Return the quota with the shortest `TimeToLimit`.

### 2.4 Integration

**1. Recording History**:
- Update `QuotaCache` (`src/quota-cache.ts`).
- Inject `HistoryService` into `QuotaCache`.
- On every successful `refresh()`, call `historyService.append(data)`.

**2. Processing & Aggregation**:
- Update `QuotaService.processQuotas`.
- Before filtering/sorting, iterate through `config.aggregatedGroups`.
- For each group:
    - Apply the selected strategy (defaulting to `most_critical`).
    - Create/Select the representative `QuotaData` object.
    - Remove original sources from the list and inject the representative one.

## 3. Implementation Steps

1.  **Config Update**: Update `QuotaService` to respect `OPENCODE_QUOTAS_CONFIG_PATH`.
2.  **Scaffolding**: Create `src/services/history-service.ts` and updated interfaces.
3.  **Persistence**: Implement file saving/loading in `HistoryService`.
4.  **Math Logic**: Implement normalization, stats (mean/median), and regression logic.
5.  **Wiring**:
    - Instantiate `HistoryService` in `src/index.ts` and `src/cli.ts`.
    - Pass it to `QuotaCache` for recording.
    - Pass it to `QuotaService` for prediction.
6.  **Aggregation**: Implement the grouping logic in `QuotaService.processQuotas` with support for all strategies.

## 4. Verification

- **Unit Tests**:
    - Test `HistoryService` persistence and pruning.
    - Test each aggregation strategy (`min`, `max`, `mean`, `median`, `most_critical`).
    - Test default Codex grouping.
- **Integration Test**:
    - Run the CLI, simulate usage changes, and verify the history file is updated and the correct quota is displayed.

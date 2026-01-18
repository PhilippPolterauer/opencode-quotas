# Design & Requirements: OpenCode Quotas Plugin

This document outlines the requirements and architectural design for the `opencode-quotas` plugin.

## 1. Requirements

### Functional Requirements

| Requirement | Description |
|-------------|-------------|
| **Aggregate Quotas** | Retrieve quota data from multiple independent providers (Antigravity, Codex, etc.) |
| **Message Footer Injection** | Automatically render quotas in the chat footer after the session reaches its final assistant response |
| **Visual Representation** | Display percentage-based quotas using ASCII progress bars with ANSI color gradients |
| **Pattern-Based Aggregation** | Group raw quotas into logical categories using pattern matching at the service layer |
| **Predictive Aggregation** | Group related quotas and predict which one will hit its limit first using linear regression |
| **Usage History** | Persist usage snapshots locally to enable trend analysis and forecasting |
| **Configurable Views** | Customize column layout and visibility |

### Non-Functional Requirements

| Requirement | Description |
|-------------|-------------|
| **Resilience** | Failure of one provider must not crash the plugin |
| **Extensibility** | Registry Pattern for easy addition of new providers |
| **Performance** | Parallel fetching using `Promise.all` |
| **Zero Configuration** | Use existing system credentials where possible |

---

## 2. Architecture

### Component Diagram

```mermaid
graph TD
    subgraph OpenCode Platform
        User -->|session.idle| Main
    end

    subgraph Quota Plugin
        Main[index.ts] --> Service[QuotaService]
        Main --> Cache[QuotaCache]
        CLI[cli.ts] --> Service
        
        Service --> Registry[registry.ts]
        Service --> Aggregation[AggregationService]
        Service --> Prediction[PredictionEngine]
        
        Prediction --> History[HistoryService]
        Cache -->|feeds snapshots| History
        Cache -->|polls| P1
        Cache -->|polls| P2
        Cache -->|polls| P3
        
        Registry --> P1[Antigravity Provider]
        Registry --> P2[Codex Provider]
        Registry --> P3[GitHub Provider - Experimental]
        
        Main --> UI[quota-table.ts]
        UI --> PB[progress-bar.ts]
    end

    subgraph External APIs
        P1 -->|Google OAuth| AG_API[Antigravity Cloud API]
        P2 -->|OpenAI OAuth| CX_API[Codex Usage API]
        P3 -->|GitHub OAuth| GH_API[GitHub Usage API]
    end
```

### Data Flow

1. **Initialization**: `QuotaService.init()` loads config, initializes `PredictionEngine` and `AggregationService`, and registers providers
2. **Caching**: `QuotaCache` polls providers at configurable intervals and stores snapshots
3. **History**: `QuotaCache` feeds `HistoryService` with usage snapshots for trend analysis
4. **Processing**: `QuotaService.processQuotas()` enriches quotas with predictions (via `PredictionEngine`), applies aggregation (via `AggregationService`), filters, and sorts
5. **Queueing**: The `experimental.text.complete` hook records the latest assistant message for the session
6. **Rendering**: On `session.idle`, the plugin patches the final text part with `renderQuotaTable()` output

---

## 3. Core Components

### QuotaData Interface

The common data model for all quota entries:

```typescript
interface QuotaData {
  id: string;           // Unique identifier (e.g., "codex-primary")
  providerName: string; // Display name
  used: number;         // Current consumption
  limit: number | null; // Total allowed (null = unlimited)
  unit: string;         // e.g., "%", "credits"
  
  // Structured metadata
  reset?: string;           // e.g., "resets in 2h"
  predictedReset?: string;  // e.g., "in 12m (predicted)"
  window?: string;          // e.g., "5h window"
  info?: string;            // e.g., "!!", "unlimited"
}
```

### Provider Registry

Singleton pattern for managing quota providers:

```typescript
interface IQuotaProvider {
  id: string;
  fetchQuota(): Promise<QuotaData[]>;
}

interface IQuotaRegistry {
  register(provider: IQuotaProvider): void;
  getAll(): IQuotaProvider[];
}
```

### QuotaService

Central orchestrator that manages:
- Configuration management (via `ConfigLoader`)
- Provider registration and coordination (via `Registry`)
- Internal services: `PredictionEngine` and `AggregationService`
- Quota processing pipeline: enrichment, aggregation, filtering, sorting

### QuotaCache

Background caching layer:
- Polls providers at configurable intervals
- Stores snapshots for immediate access
- Feeds history service for predictions

### HistoryService

Persistent storage for usage history:
- Stores timestamped usage snapshots locally
- Provides historical data for prediction calculations
- Automatic pruning based on configurable max age
- Debounced writes to disk for performance

### PredictionEngine

Dual-window linear regression for time-to-limit predictions:
- Calculates long-window slope for overall trend analysis
- Calculates short-window slope to capture recent usage spikes
- Uses conservative estimation (max of both slopes)
- Idle detection to avoid false predictions during inactivity

### AggregationService

Aggregates multiple quotas into representative values:
- Supports multiple strategies: `most_critical`, `max`, `min`, `mean`, `median`
- Pattern-based source matching for flexible grouping
- Uses `PredictionEngine` for `most_critical` strategy
- Creates synthetic quotas for average-based strategies

---

## 4. Smart Aggregation & Prediction

### Aggregation Strategies

| Strategy | Description |
|----------|-------------|
| `most_critical` | Uses linear regression to predict which quota reaches limit first |
| `max` | Displays the quota with the highest usage percentage |
| `min` | Displays the quota with the lowest usage percentage |
| `mean` | Displays a synthetic average of all quotas |
| `median` | Displays the median usage percentage |

### Predictive Modeling

The prediction system uses a **Dual-Window** linear regression approach:

1. **Long Slope**: Calculated over the full history window (default: 60 min)
2. **Short Slope**: Calculated over recent data (default: 5 min or 15% of points)
3. **Conservative Estimation**: Uses `max(longSlope, shortSlope)` to capture spikes
4. **Idle Detection**: If last usage is >5 minutes old, assumes usage stopped

**Formula**: `TimeToLimit = (Limit - CurrentUsage) / Slope`

---

## 5. UI Rendering

### Progress Bar Colors

| Usage | Color |
|-------|-------|
| < 50% | Green |
| 50-80% | Yellow |
| > 80% | Red |

### Status Indicators

| Status | Meaning |
|--------|---------|
| `OK` | Usage below warning threshold |
| `WRN` | Usage approaching limit |
| `ERR` | Usage at or exceeding limit |

### Configurable Columns

Available columns: `status`, `name`, `bar`, `percent`, `value`, `reset`, `window`, `info`, `ettl`

---

## 6. Concurrency & Safety

### Message Processing

The plugin uses multiple safeguards to prevent duplicate footer injection:

1. **Pending Queue**: The text-complete hook stores the latest assistant message per session
2. **Session Idle Hook**: Injection only occurs once the session signals idle
3. **PluginState**: Tracks processed and pending message IDs
4. **Lock Acquisition**: Serializes processing per message
5. **Text Check**: Verifies footer signature before injection

### Provider Isolation

Each provider failure is caught and logged without affecting others:

```typescript
const results = await Promise.all(
  providers.map(async (p) => {
    try {
      return await p.fetchQuota();
    } catch (e) {
      console.error(`Provider ${p.id} failed:`, e);
      return [];
    }
  })
);
```

---

## 7. Configuration Schema

See `schemas/quotas.schema.json` for the full JSON Schema.

Key configuration options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `displayMode` | enum | `"simple"` | Display mode |
| `footer` | boolean | `true` | Enable footer injection |
| `debug` | boolean | `false` | Enable debug logging |
| `progressBar.color` | boolean | `false` | Enable ANSI colors |
| `table.columns` | array | auto | Columns to display |
| `disabled` | array | `[]` | Quota IDs to hide |
| `aggregatedGroups` | array | preset | Smart aggregation with patterns or explicit sources |
| `historyMaxAgeHours` | number | `24` | History retention |
| `pollingInterval` | number | `60000` | Cache refresh interval |

---

## 8. Adding a New Provider

1. Create file: `src/providers/<name>.ts`
2. Implement factory function:

```typescript
import { type IQuotaProvider, type QuotaData } from "../interfaces";

export function createMyProvider(): IQuotaProvider {
  return {
    id: "my-provider",
    async fetchQuota(): Promise<QuotaData[]> {
      // Fetch and transform quota data
      return [];
    },
  };
}
```

3. Register in `src/services/quota-service.ts`:

```typescript
registry.register(createMyProvider());
```

---

_Last Updated: 2026-01-17_

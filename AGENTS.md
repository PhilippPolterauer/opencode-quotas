# Agent Guidelines: opencode-quotas (OpenCode.ai Plugin)

This document provides instructions and standards for agentic coding assistants working in this repository. This project is an official plugin for **OpenCode.ai**.

## 🚀 Commands (Powered by Bun)

This project strictly uses **Bun** as the package manager and runtime for testing.

| Task            | Command                   | Description                               |
| :-------------- | :------------------------ | :---------------------------------------- |
| **Install**     | `bun install`             | Use Bun for all dependency management.    |
| **Build**       | `npm run build`           | Compiles TypeScript to `dist/`.           |
| **Type Check**  | `npm run typecheck`       | Runs `tsc --noEmit`.                      |
| **Format**      | `npx prettier --write .`  | Formats code (4-space indent).            |
| **Test All**    | `bun test`                | Runs all tests using the Bun test runner. |
| **Single Test** | `bun test <path_to_file>` | Executes a specific test file.            |

---

## 🛠 Project Structure

- Core
  - `/src/index.ts`: Entry point. Initializes the plugin and wires hooks.
  - `/src/registry.ts`: Singleton registry for `IQuotaProvider` implementations.
  - `/src/interfaces.ts`: Core type definitions (`QuotaData`, `IQuotaProvider`).
  - `/src/constants.ts`: Shared constants used across the project.
  - `/src/defaults.ts`: Default configuration values used by the plugin.

- Providers
  - `/src/providers/`: Provider factories and concrete implementations (e.g., `antigravity.ts`, `codex.ts`).

- Services
  - `/src/services/`: Business logic and background services.
    - `quota-service.ts`: Coordinates fetching and caching of quotas.
    - `config-loader.ts`: Loads and validates configuration.
    - `aggregation-service.ts`: Aggregates and normalizes quota data.
    - `prediction-engine.ts`: Optional usage/prediction logic.
    - `history-service.ts`: Manages historical quota records.

- Integrations
  - `/src/antigravity/`: Integration layer for Antigravity (e.g., `auth.ts`, `client.ts`).

- CLI
  - `/src/cli.ts`: Command-line entrypoint (used by package `bin`).

- UI
  - `/src/ui/`: CLI rendering components (`quota-table.ts`, `progress-bar.ts`).

- Utilities
  - `/src/utils/`: Small helpers (`paths.ts`, `time.ts`, `validation.ts`).
  - `/src/logger.ts`: Centralized logging for debug output.

- State & Cache
  - `/src/plugin-state.ts`: In-memory plugin state and locking structures.
  - `/src/quota-cache.ts`: Cache layer for fetched quota data.

- Tests & Schemas
  - `/tests/`: Unit and integration tests.
  - `/schemas/quotas.schema.json`: Configuration schema for `QuotaConfig`.

- Project files
  - `package.json`, `tsconfig.*`, `.opencode/quotas.json`, `README.md`, `CHANGELOG.md`.

## ⚙️ Environment Configuration

- **Antigravity**: Relies on local configuration files and cloud credentials managed via `src/antigravity/auth.ts`.
- **Codex**: Typically uses an API key or session token (see `src/providers/codex.ts`).
- **Configuration**: The plugin is configured via `.opencode/quotas.json`. This controls debug mode, UI settings, etc.
- **Debug Logs**: If `debug: true` is set, logs are written to `~/.local/share/opencode/quotas-debug.log`.

---

## 🎨 Code Style & Conventions

### 1. TypeScript & Types

- **Strict Mode**: `strict: true` is enabled. Avoid `any`. Use `unknown` if necessary.
- **Interfaces**:
  - Use `I` prefix for service-like interfaces/contracts (e.g., `IQuotaProvider`).
  - Do **not** use `I` prefix for plain data structures (e.g., `QuotaData`).
- **Explicit Returns**: Always specify return types for public functions.
- **Type Imports**: Use `import type { ... }` or `import { type ... }` for type-only imports.

### 2. Formatting & Syntax

- **Indentation**: 4 spaces.
- **Semicolons**: Required.
- **Quotes**: Double quotes for imports and string literals.
- **Naming**: `camelCase` for variables/functions, `PascalCase` for classes/types, `UPPER_SNAKE_CASE` for constants.

---

## 📐 Design Overview

The plugin follows a **Registry Pattern** to decouple the main command from quota sources.

### Core Requirements
1. **Unified Quota View**: Aggregate quotas from multiple providers.
2. **Resilience**: A failure in one provider must not crash the command.
3. **Accuracy**: Handle "Unlimited" quotas and balance-based reporting gracefully.
4. **Visuals**: Use high-quality ASCII bars for percentage-based limits.

### Data Flow
1. `QuotaService.init()`: Load config, set up prediction/aggregation, and register providers into `QuotaRegistry`.
2. Fetching: `QuotaCache` (plugin) or `QuotaService.getQuotas()` (CLI) runs `fetchQuota()` in parallel and flattens results.
3. Rendering: Display data using `renderQuotaTable`.

---

## 🧪 Error Handling

- **Silent Failures**: Providers should catch errors and return an empty array or log a warning.
- **Console Logging**: DO NOT use `console.log` for debugging or output. Use `logToDebugFile` instead. `console.warn` is acceptable for initialization warnings.
- **Result Flattening**: `src/quota-cache.ts` and `src/services/quota-service.ts` flatten results from `fetchQuota()`.

---

## 🔒 Concurrency & Safety

- **Duplicate Injection**: Ensure quota blocks are injected exactly once per message.
- **Race Conditions**: Use locking mechanisms (`processedMessages` set, `processingLocks` map).
- **Output Validation**: Check if target text already contains the injection.

---

## 🧪 Testing Patterns

- **Runner**: `bun test`
- **Mocking**: Use mocks for network requests/shell executions.
- **Validation**: Ensure `QuotaData` objects conform to `src/interfaces.ts`.

---

## 🧩 Adding a New Provider

To add a new provider (e.g., "GitHub"):

1.  **Create File**: Add `src/providers/github.ts`.
2.  **Implement Factory**: Export a function returning `IQuotaProvider`.

    ```typescript
    import { type IQuotaProvider, type QuotaData } from "../interfaces";

    export function createGitHubProvider(): IQuotaProvider {
      return {
        id: "github-provider",
        fetchQuota: async (): Promise<QuotaData[]> => {
          // Implementation...
          return [];
        },
      };
    }
    ```

3.  **Register**: Add call to `registry.register(createGitHubProvider())` in `src/services/quota-service.ts` (inside `QuotaService.registerProviders()`).

---

## 🖥 UI Standards

- **Main Component**: Use `renderQuotaTable` in `src/ui/quota-table.ts`.
- **Progress Bars**: Use `renderQuotaBar` in `src/ui/progress-bar.ts`.
- **Reporting**:
  - Primary: `[Provider] [Bar] 60% (Used/Limit Unit)`
  - Secondary: Indented with ` └` for metadata.

---

## 🤖 AI Instructions

- **Documentation**: Update `DESIGN.md` and `README.md` when changing architecture or user-facing features.
- **Changelog**: Update `CHANGELOG.md` (`[Unreleased]` section) with changes.
- **Bun**: Always use `bun` for install/test.
- **Dependencies**: Check `package.json` before adding libs. Prefer built-ins.
- **Verification**: Run `npm run typecheck` after modifications.
- **Schema**: Update `schemas/quotas.schema.json` if `QuotaConfig` changes.

## 🐛 Debugging

To debug the plugin and investigate issues (e.g., missing quotas, errors):

1.  **Trigger the Plugin**: Use `opencode run` to execute a command that triggers the plugin hooks.
    ```bash
    opencode run say hi
    ```

2.  **Inspect Plugin Logs**: The plugin writes detailed debug logs to a file in the user's home directory.
    ```bash
    tail -f ~/.local/share/opencode/quotas-debug.log
    ```

3.  **Inspect Process Output**: If you are running the plugin in a dev environment, check the standard output/error of the process running `opencode`.

4.  **Verify Configuration**: Ensure `.opencode/quotas.json` has `debug: true` enabled to see verbose logs.

_Updated on 2026-01-13_

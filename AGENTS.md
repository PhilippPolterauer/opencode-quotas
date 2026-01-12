# Agent Guidelines: opencode-quotas (OpenCode.ai Plugin)

This document provides instructions and standards for agentic coding assistants working in this repository. This project is an official plugin for **OpenCode.ai**.

## 🚀 Commands (Powered by Bun)

This project strictly uses **Bun** as the package manager and runtime for testing.

| Task            | Command                   | Description                               |
| :-------------- | :------------------------ | :---------------------------------------- |
| **Install**     | `bun install`             | Use Bun for all dependency management.    |
| **Build**       | `npm run build`           | Compiles TypeScript to `dist/`.           |
| **Type Check**  | `npm run typecheck`       | Runs `tsc --noEmit`.                      |
| **Lint**        | `npx prettier --write .`  | Project uses 4-space indent.              |
| **Test All**    | `bun test`                | Runs all tests using the Bun test runner. |
| **Single Test** | `bun test <path_to_file>` | Executes a specific test file.            |

---

## 🛠 Project Structure

- `/src/index.ts`: Entry point. Registers default providers.
- `/src/registry.ts`: Singleton registry for `IQuotaProvider` implementations.
- `/src/interfaces.ts`: Core type definitions (`QuotaData`, `IQuotaProvider`).
- `/src/providers/`: Concrete provider implementations (e.g., `antigravity.ts`, `codex.ts`).
- `/src/ui/`: CLI rendering components (e.g., `progress-bar.ts`).
- `/src/antigravity/`: Logic layer for interacting with Antigravity services.

## ⚙️ Environment Configuration

The plugin expects certain environment variables or configuration files depending on the provider:

- **Antigravity**: Relies on local configuration files and cloud credentials managed via `src/antigravity/auth.ts`.
- **Codex**: Typically uses an API key or session token (see `src/providers/codex.ts`).

### Debugging & Configuration

- **Configuration File**: The plugin can be configured via `.opencode/quotas.json`. This file controls debug mode, UI settings, and more.
- **Debug Logs**: When debug mode is enabled (via `debug: true` in config), logs are written to `~/.local/share/opencode/quotas-debug.log`. These logs contain detailed hook invocation and processing info.

Agents should verify these dependencies before attempting to fetch live data.

---

## 🎨 Code Style & Conventions

### 1. TypeScript & Types

- **Strict Mode**: `strict: true` is enabled. Avoid `any`. Use `unknown` if necessary.
- **Interfaces**:
  - Use `I` prefix for service-like interfaces/contracts (e.g., `IQuotaProvider`, `IQuotaRegistry`).
  - Do **not** use `I` prefix for plain data structures or objects (e.g., `QuotaData`, `QuotaConfig`).
- **Explicit Returns**: Always specify return types for public functions and exported methods.
- **Type Imports**: Use `import type { ... }` or `import { type ... }` for type-only imports.

### 2. Formatting & Syntax

- **Indentation**: 4 spaces.
- **Semicolons**: Required.
- **Quotes**: Use **double quotes** for imports and string literals.
- **Naming**: `camelCase` for variables/functions, `PascalCase` for classes/plugins, `UPPER_SNAKE_CASE` for global constants.

---

## 📐 Design Overview

The plugin follows a **Registry Pattern** to allow decoupling between the main command and various quota sources.

```mermaid
graph TD
    User -->|show-quotas| Plugin[QuotaHubPlugin]
    Plugin --> Registry[QuotaRegistry]
    Registry -->|getAll| Providers[IQuotaProvider[]]
    Providers -->|fetchQuota| Data[QuotaData[]]
    Plugin -->|render| UI[progress-bar.ts]
```

### Core Requirements

1. **Unified Dashboard**: Aggregate quotas from Antigravity, Codex, and others.
2. **Resilience**: A failure in one provider (e.g., network error) must not crash the `show-quotas` command.
3. **Accuracy**: Handle "Unlimited" quotas and balance-based reporting gracefully.
4. **Visuals**: Use high-quality ASCII bars for percentage-based limits.

### Data Flow

1. `init()`: Instantiate and register providers into the `QuotaRegistry`.
2. `show-quotas`: Retrieve all registered providers, execute `fetchQuota()` in parallel using `Promise.all`, and flatten the results.
3. Rendering: Sort and display each `QuotaData` entry using the UI utility.

---

## 🧪 Error Handling

- **Silent Failures**: Providers should catch their own errors and return an empty array or log a warning.
- **Console Logging**: Use `console.warn` for init issues; `console.log` for user-facing output.
- **Result Flattening**: `src/index.ts` flattens results. Ensure `fetchQuota()` always returns a `Promise<QuotaData[]>`.

---

## 🧪 Testing Patterns

Tests are located alongside the source or in a dedicated `tests/` directory (if applicable).

- **Mocking**: Use mocks for network requests and shell executions.
- **Validation**: Ensure `QuotaData` objects conform to the interface defined in `src/interfaces.ts`.
- **Command**: Run `bun test` to execute the suite.

---

## 🧩 Adding a New Provider

To add a new quota provider (e.g., "GitHub"):

1.  **Define the Logic**: Create a file in `src/providers/`.
2.  **Implement `IQuotaProvider`**:

    ```typescript
    import { type IQuotaProvider, type QuotaData } from "../interfaces";

    export function createMyProvider(): IQuotaProvider {
      return {
        id: "my-provider",
        fetchQuota: async (): Promise<QuotaData[]> => {
          // Implementation here
          return [];
        },
      };
    }
    ```

3.  **Register it**: Add it to the `init` method in `src/index.ts`.

---

## 🖥 UI Standards

- Use `renderQuotaBar` in `src/ui/progress-bar.ts` for consistency.
- **Detailed Reporting**:
  - Primary line: `[Provider] [Bar] 60% (Used/Limit Unit)`
  - Secondary lines: Indented with ` └` for metadata.

---

## 🤖 AI Instructions

- **Documentation Mandate**: Whenever you modify the plugin's architecture, add a new provider, or change configuration options, you **MUST** update `DESIGN.md` (for architectural changes) and `README.md` (for user-facing features/usage) in the same task.
- **Bun Usage**: Always use `bun test` and `bun install`.
- **Refactoring**: Maintain the factory pattern in `src/providers/`.
- **Dependencies**: Check `package.json` before adding new libs. Prefer Bun/Node built-ins.
- **Verification**: Run `npm run typecheck` after every modification.

---

_Created on 2026-01-11 for the Opencode.ai Quotas project._

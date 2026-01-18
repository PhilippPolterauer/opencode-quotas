# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Extract magic number 0.15 to `SHORT_WINDOW_FALLBACK_RATIO` in prediction engine for better code clarity.

### Planned

- [ ] Local Provider pattern for `/quotas` command (pending platform support)
- [ ] GitHub Copilot detailed usage (pending API availability)
- [ ] Web-based configuration UI

## [0.0.2-beta] - 2026-01-17

### Added

- Integration tests for default configuration behavior to prevent documentation drift (TEST-001)
- Schema validation tests using AJV for configuration validation (TEST-002)
- Tests for overlapping aggregation patterns (TEST-003)
- Global `predictionWindowMinutes` config option for prediction engine (FEAT-002)
- Error handling for malformed history files (ISSUE-016)

### Changed

- Comprehensive test suite expanded from 46 to 175 tests with 383 assertions
- Updated default `progressBar.color` to `false` (was incorrectly documented as `true`)
- Clarified experimental GitHub Copilot provider status in documentation (DOC-009)

### Fixed

- Added missing `predictionShortWindowMinutes` default to `DEFAULT_CONFIG` in `src/defaults.ts`.
- Correct README to reflect `filterByCurrentModel` default is `false` (DOC-001)
- Defer quota footer injection until `session.idle` to avoid duplicate footers across multi-step responses
- Fix overlapping aggregation patterns where general tokens (e.g. `gemini`) could match multiple groups; make pattern matching token-aware and support regex/glob patterns (BUG-003)
- Fix `tsconfig.build.json` reference in package.json (BUG-002)
- Remove unused QuotaTool and stale docs (ISSUE-014)
- Fix unused imports in logger.ts (ISSUE-013)
- Fix `test-ag.ts` outdated API signature (ISSUE-012)
- Add missing `patterns` and `providerId` fields to aggregatedGroups schema (SCHEMA-001)
- Fix schema mismatch between 'groups' vs 'aggregatedGroups' (ISSUE-015)
- Fix `showUnaggregated` default causing empty quota display (DOC-002)

### Documentation

- Update DESIGN.md architecture diagram to match implementation (DOC-003)
- Update AGENTS.md with complete project structure (DOC-005)

## [0.0.1] - 2026-01-13

### Added

- **Core Plugin Architecture**
  - Service Registry Pattern for decoupled provider management
  - `QuotaService` for centralized configuration and processing
  - `QuotaCache` for background polling and caching
  - `PluginState` for concurrency and deduplication control

- **Quota Providers**
  - **Antigravity Provider**: Full support for local and cloud quotas with category-based breakdown (Flash, Pro, Premium)
  - **Codex Provider**: Support for primary/secondary rate limit windows and credit balances
  - **GitHub Copilot Provider**: Experimental tracking for monthly suggestions (disabled by default; enable via `enableExperimentalGithub` in `.opencode/quotas.json`)

- **Smart Features**
  - **Dual-Window ETTL Prediction**: Accurate "Estimated Time to Limit" using both long-term trends and short-term spike detection
  - **Smart Quota Aggregation**: Combine multiple quotas using strategies (`most_critical`, `max`, `min`, `mean`, `median`)
  - **Usage History Persistence**: Stored in `~/.local/share/opencode/quota-history.json`
  - **Idle Detection**: Predictions return Infinity when usage has stopped

- **UI Components**
  - Configurable table columns with dynamic width calculation
  - ANSI color gradient progress bars (green/yellow/red)
  - Status indicators (OK/WRN/ERR)
  - Clean CLI output with `--no-color` support

- **Configuration**
  - JSON Schema for `.opencode/quotas.json`
  - Environment variable support (`OPENCODE_QUOTAS_CONFIG_PATH`, `NO_COLOR`)
  - Model-aware quota filtering based on active model
  - Configurable history retention and polling intervals
  - `showUnaggregated` option to display raw provider data alongside aggregated groups

- **Developer Experience**
  - Comprehensive test suite (46 tests)
  - Bun for fast testing
  - TypeScript strict mode
  - Centralized logging with debug file output

### Changed

- Refined default configuration with sensible presets
- Enhanced documentation (README, DESIGN, AGENTS)

### Fixed

- TypeScript configuration properly includes Node.js types
- Extended message interface handles optional SDK fields correctly
- Concurrency tests verify exactly-once message processing
- Race condition in `QuotaCache` initialization
- Memory leak in `PluginState` cleanup
- Synchronous file operations in GitHub provider blocking the event loop
- Silent errors in `HistoryService`

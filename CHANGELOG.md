# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- [ ] Local Provider pattern for `/quotas` command (pending platform support)
- [ ] GitHub Copilot detailed usage (pending API availability)
- [ ] Web-based configuration UI

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
  - **GitHub Copilot Provider**: Experimental tracking for monthly suggestions (currently limited by API availability)

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
  - Model-to-quota mapping for context-aware filtering
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

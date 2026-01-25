# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **ETTL Prediction**: Fix overly pessimistic time-to-limit predictions for long-term quotas (Weekly/Monthly) by ignoring short-term usage spikes in the prediction engine.
- **Robustness**: Ensure `QuotaService` handles missing authentication files gracefully (verified by new robustness tests), preventing crashes for users with minimal setups.

### Planned

- [ ] Local Provider pattern for `/quotas` command (pending platform support)
- [ ] GitHub Copilot detailed usage (pending API availability)
- [ ] Web-based configuration UI

## [0.0.3-rc0] - 2026-01-24

### Changed

- Replace platform-specific build scripts with a cross-platform `scripts/build.ts` runner used by `bun run build`

## [0.0.3-beta] - 2026-01-22

### Fixed

- Fix macOS (Darwin) path handling to use XDG-style paths (`~/.local/share/opencode/`, `~/.config/opencode/`) instead of `~/Library/Application Support/opencode/`, matching OpenCode's actual file locations (fixes #4)

## [0.0.2] - 2026-01-20

### Added

- `historyResetThreshold` option (0-100) to allow fine-tuning quota reset detection in `HistoryService`
- End-to-end injection test that runs the OpenCode CLI when `OPENCODE_QUOTAS_E2E=1` is set
- Integration tests for default configuration behavior to prevent documentation drift
- Schema validation tests using AJV for configuration validation
- Tests for overlapping aggregation patterns
- Global `predictionWindowMinutes` config option for prediction engine
- Error handling for malformed history files

### Changed

- **Inline footer injection**: Switch from idle-based PATCH injection to inline injection via `experimental.text.complete`, modifying `output.text` directly for immediate, reliable footer display
- Relax token splitting in `QuotaService` to better handle common ID characters like hyphens and underscores
- Align `showUnaggregated` default to `false` across implementation, interface documentation, and JSON schema
- Switch `validateConfig` to synchronous validation for predictable initialization
- Deep clone `aggregatedGroups` defaults to prevent shared array references between default and user configurations
- Filter out internal/test Antigravity quotas (e.g. "chat 12345", "rev123") by default to reduce noise
- Extract `SHORT_WINDOW_FALLBACK_RATIO` constant in prediction engine for better code clarity
- Comprehensive test suite expanded from 46 to 175 tests with 383 assertions
- Updated default `progressBar.color` to `false` (was incorrectly documented as `true`)

### Fixed

- Include `schemas/` directory in npm package, required for configuration validation
- Resolve issue where build artifacts were sometimes nested in `dist/src` due to stray files in the project root
- Updated build script to automatically clear `dist/` before each build to ensure no stale files remain
- Skip footer injection for reasoning/subagent steps and incomplete messages, keeping quota footers limited to final responses only
- Only inject footer when message is complete (`finish === "stop"`) to prevent duplicate injections during streaming
- Fix footer injection patch payload to include required discriminator fields (`type: "text"`)
- Ensure ANSI colorization strictly respects `config.color` and is disabled by default
- Use build configuration (`tsconfig.build.json`) that emits to `dist/`
- Add missing `predictionShortWindowMinutes` default to `DEFAULT_CONFIG`
- Fix overlapping aggregation patterns with token-aware matching and regex/glob support
- Fix unused imports in `src/logger.ts`
- Fix `tests/test-ag.ts` outdated API signature
- Add missing `patterns` and `providerId` fields to aggregatedGroups schema
- Fix schema mismatch between 'groups' vs 'aggregatedGroups'
- Fix `showUnaggregated` default causing empty quota display
- Improved type safety in plugin initialization by replacing `any` with `unknown` for error handling
- Updated all unit test mocks to support the new `IHistoryService` interface

### Documentation

- Update DESIGN.md architecture diagram to match implementation
- Update AGENTS.md with complete project structure
- Clarified experimental GitHub Copilot provider status in documentation
- Document `predictionShortWindowMinutes` in README config reference
- Correct README to reflect `filterByCurrentModel` default is `false`

### Removed

- Removed unused QuotaTool and stale docs
- Removed unused `recentChecks` field in `PluginState`

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

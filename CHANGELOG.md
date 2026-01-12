# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Smart Quota Aggregation**: Ability to group multiple quotas into a single "Smart Group" using strategies like `most_critical` (predictive), `max`, `min`, `mean`, and `median`.
- **History Service**: Persistence of usage data to `~/.local/share/opencode/quota-history.json` to enable usage trend analysis.
- **Predictive UI**: "Time to Limit" predictions (e.g., "in 12m (predicted)") using Linear Regression when the `most_critical` strategy is active.
- **Configurable Paths**: Support for `OPENCODE_QUOTAS_CONFIG_PATH` environment variable to load configuration from custom locations.
- **Default Codex Grouping**: Codex Primary and Secondary rate limits are now automatically grouped into a single predictive "Codex Usage" bar.
- **Configurable History Pruning**: Added `historyMaxAgeHours` to `quotas.json` to control how long usage history is retained (default: 24h).
- Initial project structure and configuration.
- `AGENTS.md` for agent guidelines.
- `DESIGN.md` for architectural design.
- `CHANGELOG.md` file.
- **GitHub Copilot Provider**: Support for tracking monthly suggestions (Free) and premium requests (Pro).

### Changed
- Updated `package.json` version to `0.0.1-beta`.
- Enhanced `Antigravity` and `Codex` providers implementation.
- Improved CLI output and UI rendering (`progress-bar`, `quota-table`).
- Refined configuration handling in `.opencode/quotas.json` and defaults.
- Updated documentation (`README.md`, `AGENTS.md`, `DESIGN.md`) to reflect latest changes.
- **Deduplication Refactor**: Extracted shared initialization, configuration, and filtering logic into `QuotaService`. Both the Plugin and CLI now use this unified service.
- **GitHub Provider**: Unregistered the GitHub provider by default as it is currently unavailable for individual accounts due to API deprecation. The implementation remains in the codebase for future use.

### Fixed
- Various type checks and linting improvements.

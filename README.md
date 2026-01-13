# OpenCode Quotas Plugin

A unified quota visualization plugin for [OpenCode](https://opencode.ai), aggregating data from multiple AI providers and injecting polished status summaries directly into your chat workflow.

> **Disclaimer**: This is an independent community project. It is **not** affiliated with, endorsed by, or officially associated with OpenCode.ai.

## Features

- **Seamless Integration**: Automatically appends a quota summary to the end of every assistant response
- **Service Registry Pattern**: Decoupled architecture allowing easy addition of new quota providers
- **Smart Quota Aggregation**: Group multiple quotas and predict which one will hit its limit first using linear regression
- **Usage History**: Persistent usage tracking for predictive modeling
- **Visual Progress Bars**: Clean ASCII-based progress bars with ANSI color gradients
- **Detailed Reporting**: Support for "Unlimited" quotas, balance-based reporting, and predicted reset times

### Supported Providers

| Provider | Status | Features |
|----------|--------|----------|
| **Antigravity** | Stable | Category-based breakdown (Flash, Pro, Premium) |
| **Codex** | Stable | Primary/secondary rate windows, credit balances |
| **GitHub Copilot** | Experimental | Monthly suggestions (currently limited by API) |

## Security Note

This plugin uses standard "Installed Application" OAuth flow for Google services. The Client ID and Secret included in the source code are public credentials as per [Google's OAuth2 Native App documentation](https://developers.google.com/identity/protocols/oauth2/native-app). They are safe to be public because they cannot be used to access user data without a valid refresh token, which is stored securely on your local machine.

## Installation

Install as an OpenCode plugin:

```bash
# Clone to your plugins directory
git clone https://github.com/your-org/opencode-quotas ~/.opencode/plugins/opencode-quotas

# Install dependencies and build
cd ~/.opencode/plugins/opencode-quotas
bun install
npm run build
```

## Usage

Once installed, quotas are automatically displayed in the **message footer** after every assistant response.

### CLI Mode

You can also run the quota view directly in your terminal:

```bash
# Run directly via npx
npx opencode-quotas

# Or install globally
npm install -g opencode-quotas
opencode-quotas
```

### Example Output

![Opencode Quotas Display](docs/QuotaDisplay.png)

```text
Opencode Quotas (Used)
ST    QUOTA NAME            USED   UTILIZATION            RESET     ETTL
---   -------------------   ----   --------------------   -------   ----
OK    Antigravity Flash      20%   ████░░░░░░░░░░░░░░░░   54m       -   
OK    Antigravity Pro        40%   ████████░░░░░░░░░░░░   1h 8m     in 2h
ERR   Codex Usage           100%   ████████████████████   23h 35m   -
```

## Configuration

Configure the plugin via `.opencode/quotas.json`:

```json
{
  "footer": true,
  "debug": false,
  "progressBar": {
    "color": true
  },
  "table": {
    "columns": ["status", "name", "percent", "bar", "reset", "ettl"]
  },
  "disabled": [],
  "aggregatedGroups": [
    {
      "id": "codex-smart",
      "name": "Codex Usage",
      "sources": ["codex-primary", "codex-secondary"],
      "strategy": "most_critical"
    }
  ]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `footer` | boolean | `true` | Show quotas in chat footer |
| `debug` | boolean | `false` | Enable debug logging |
| `progressBar.color` | boolean | `true` | Enable ANSI colors |
| `table.columns` | array | See below | Columns to display |
| `disabled` | array | `[]` | Quota IDs to hide |
| `historyMaxAgeHours` | number | `24` | History retention |
| `pollingInterval` | number | `60000` | Refresh interval (ms) |

### Available Columns

`status`, `name`, `bar`, `percent`, `value`, `reset`, `window`, `info`, `ettl`

**Default**: `status`, `name`, `percent`, `bar`, `reset`, `ettl`

### Color Output

Color output is **enabled by default**. To disable:

- Set environment variable: `NO_COLOR=1` or `OPENCODE_QUOTAS_NO_COLOR=1`
- Or set `progressBar.color` to `false` in config

## Development

This project uses **Bun** for dependency management and testing.

```bash
# Install dependencies
bun install

# Build the project
npm run build

# Run tests
bun test

# Type check
npm run typecheck
```

### Project Structure

```
src/
  index.ts              # Plugin entry point
  cli.ts                # CLI entry point
  interfaces.ts         # Type definitions
  registry.ts           # Provider registry
  defaults.ts           # Default configuration
  constants.ts          # Shared constants
  logger.ts             # Debug logging
  quota-cache.ts        # Caching layer
  plugin-state.ts       # Concurrency handling
  services/
    quota-service.ts    # Core service
    history-service.ts  # Usage history persistence
  providers/
    antigravity/        # Antigravity provider
    codex.ts            # Codex provider
    github.ts           # GitHub Copilot provider
  ui/
    quota-table.ts      # Table rendering
    progress-bar.ts     # Progress bar rendering
  utils/
    time.ts             # Time formatting
    debug.ts            # Debug utilities
```

## Architecture

For detailed architectural documentation, see:

- [DESIGN.md](./DESIGN.md) - Requirements and design diagrams
- [AGENTS.md](./AGENTS.md) - Coding standards for AI agents

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass: `bun test`
2. Type check passes: `npm run typecheck`
3. Code is formatted: `npx prettier --write .`

## License

MIT

---

_Created with care for the OpenCode community._

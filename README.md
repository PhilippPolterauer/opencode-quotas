# OpenCode Quota Hub

🚀 **TL;DR**: One command (`/quotas`) to see all your AI and system quotas in one beautiful ASCII dashboard. Stop checking five different websites.

⚠️ **Disclaimer**: This is an independent community project. It is **not** affiliated with, endorsed by, or officially associated with [OpenCode.ai](https://opencode.ai).

---

A unified quota visualization plugin for OpenCode, aggregating data from multiple providers (Antigravity, Codex, etc.) into a single, polished terminal interface.

## 🎨 Vibe Check

💡 _Hint: This plugin was 100% vibe-coded. If the progress bars look too cool to be true, it's because the development vibes were immaculate._

---

## ✨ Features

- **Service Registry Pattern**: Decoupled architecture allowing easy addition of new quota providers.
- **Unified Interface**: Standardized `QuotaData` format for all providers.
- **Visual Progress Bars**: Clean ASCII-based progress bars for percentage-based quotas.
- **Detailed Reporting**: Support for "Unlimited" quotas, balance-based reporting, and reset time information.
- **Provider Support**:
  - **Antigravity**: Full support for local and cloud quotas with category-based breakdown.
  - **Codex**: Support for primary/secondary rate limit windows and credit balances.

## 🚀 Usage

Once installed as an OpenCode plugin, system quotas are automatically displayed in the **message footer** after every final assistant response (this can be disabled in settings).

### Color Output
Color output is **disabled by default** to ensure compatibility with the OpenCode UI.

If you want to enable colors (e.g., for local CLI usage):

- Env: `NO_COLOR=0` or `OPENCODE_QUOTAS_NO_COLOR=0`
- Config: Set `progressBar.noColor` to `false` in your defaults.

### Model Mapping
By default, the plugin attempts to show only the quota relevant to the current model being used. You can configure this mapping in `defaults.ts`.

You can also trigger a detailed quota dashboard at any time using the command:

```bash
/quotas
```

### Example Dashboard Output

```text
📊 SYSTEM QUOTAS

[Antigravity GPUs]  [████████████░░░░░░░░░░] 60%
  └ 40% remaining 🟢 | resets in 2h 15m (1/11/2026, 4:30:00 PM)

[Codex Primary]     [████░░░░░░░░░░░░░░░░░░] 20%
  └ 1h window | resets in 45m

[Codex Credits]     150.50 credits (Unlimited)
  └ balance
```

## 🛠 Development (Powered by Bun)

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

## 📐 Architecture

For a deep dive into the plugin architecture and agent instructions, see:

- [DESIGN.md](./DESIGN.md) - Requirements and architectural diagrams.
- [AGENTS.md](./AGENTS.md) - Coding standards and registry patterns for AI agents.

---

_Created with ❤️ for the OpenCode community._

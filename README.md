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
- **Smart Quota Aggregation**: Group multiple quotas (e.g., Codex Primary/Secondary) and predict which one will hit its limit first using **Linear Regression**.
- **Usage History**: Persistent usage tracking in `~/.local/share/opencode/quota-history.json` for predictive modeling.
- **Configurable Paths**: Specify your config location via the `OPENCODE_QUOTAS_CONFIG_PATH` environment variable.
- **Visual Progress Bars**: Clean ASCII-based progress bars for percentage-based quotas.
- **Detailed Reporting**: Support for "Unlimited" quotas, balance-based reporting, and predicted reset times.
- **Provider Support**:
  - **Antigravity**: Full support for local and cloud quotas with category-based breakdown.
  - **Codex**: Support for primary/secondary rate limit windows and credit balances.
  - **GitHub Copilot**: Tracking for monthly suggestions (Free) and premium requests (Pro).

## 🚀 Usage

Once installed as an OpenCode plugin, system quotas are automatically displayed in the **message footer** after every final assistant response.

### 💻 CLI Mode

You can also run the quota dashboard directly in your terminal!

```bash
# Run directly via npx
npx opencode-quotas

# Or install globally
npm install -g opencode-quotas
opencode-quotas
```

The CLI output is **colorful by default** and includes status emojis for quick health checks.

### Color Output
Color output is **enabled by default**.

If you want to disable colors (e.g., for plain text logging):

- Env: `NO_COLOR=1` or `OPENCODE_QUOTAS_NO_COLOR=1`
- Config: Set `progressBar.color` to `false` in your `.opencode/quotas.json`.

### Model Mapping
By default, the plugin attempts to show only the quota relevant to the current model being used. You can configure this mapping in `defaults.ts`.

### Configurable Views
You can customize which columns appear in the quota table by modifying your `.opencode/quotas.json`.

Available columns: `status`, `name`, `bar`, `percent`, `value`, `reset`, `window`, `info`.

**Default View:** `status`, `name`, `bar`, `percent`, `reset`

**Example Config:**
```json
{
  "table": {
    "columns": ["status", "name", "bar", "value", "window"]
  }
}
```

### Example Dashboard Output

```text
🟢 Antigravity Pro    : ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱  60% resets in 2h 15m
🔴 Codex Primary      : ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱  90% resets in 45m
🟢 GitHub Copilot    : ▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  15% resets in 12d
⚪ Codex Credits      : Unlimited
```

> **Note**: Avoid using square brackets `[]` in provider names or labels, as the OpenCode UI may interpret them as links.

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

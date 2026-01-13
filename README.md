# OpenCode Quotas

**The ultimate usage dashboard for your AI coding assistants.**

**OpenCode Quotas** aggregates usage data from Antigravity, Codex, and GitHub Copilot into a single, beautiful dashboard injected directly into your OpenCode chat footer. Never hit a rate limit unexpectedly again.

![OpenCode Quotas Dashboard](docs/QuotaDisplay.png)

> **Note**: This is a community-developed plugin and is not officially affiliated with OpenCode.ai.

## ✨ Features

- **Unified Dashboard**: See all your AI quotas (Antigravity, Codex, Copilot) in one place.
- **Smart Predictions**: Uses linear regression to predict *exactly* when you'll run out of tokens.
- **Visual Intelligence**: Beautiful, ANSI-colored progress bars that change color as you approach limits.
- **Context Aware**: Automatically filters quotas based on the active model (optional).
- **Resilient**: Failures in one provider won't break your chat experience.

## 📦 Installation

Install seamlessly as an OpenCode plugin:

```bash
# Clone into your plugins directory
git clone https://github.com/your-org/opencode-quotas ~/.opencode/plugins/opencode-quotas

# Build the plugin
cd ~/.opencode/plugins/opencode-quotas
bun install
npm run build
```

## 🚀 Usage

Once installed, **you don't need to do anything**.

Every time your AI assistant replies, a live quota summary is appended to the footer of the message.

### CLI Mode
Want to check quotas without sending a message? Run it in your terminal:

```bash
npx opencode-quotas
```

## 🔌 Supported Providers

| Provider | Description |
| :--- | :--- |
| **Antigravity** | Tracks Flash, Pro, and Premium tiers with precise reset timers. |
| **Codex** | Monitors primary and secondary rate limits and credit balances. |
| **GitHub Copilot** | (Experimental) Tracks monthly suggestions and API limits. |

## ⚙️ Configuration

Customize the look and feel via `.opencode/quotas.json`.

```json
{
  "footer": true,
  "progressBar": { "color": true },
  "aggregatedGroups": [
    {
      "id": "codex-unified",
      "name": "Codex Usage",
      "sources": ["codex-primary", "codex-secondary"],
      "strategy": "most_critical"
    }
  ]
}
```

See [schemas/quotas.schema.json](schemas/quotas.schema.json) for all options.

## 🔒 Security

Your credentials remain safe. This plugin uses standard local OAuth flows and stores tokens securely on your machine. No data is sent to third-party servers other than the quota providers themselves.

## 💻 Development

Built with **Bun** for speed.

```bash
bun install
bun test
npm run build
```

## 📄 License

MIT

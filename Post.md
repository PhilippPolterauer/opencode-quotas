Title:
[Release] opencode-quotas – quota tracker for OpenCode (now with ETTL + grouping/filtering)

Post:

Hey all — I shipped a little plugin/CLI thing I built because I kept getting surprised by quota limits.

opencode-quotas shows your remaining usage in the terminal and (if installed as a plugin) can append a compact quota summary after OpenCode responses.

GitHub: https://github.com/PhilippPolterauer/opencode-quotas

Screenshot: (attach the cropped terminal shot)

What it shows

per-quota status + usage bars

RESET countdown

ETTL = “Estimated Time To Limit” → basically: given your recent usage trend, how long until you hit the limit (when it can estimate)

Config bits (if you care)
You can tune the output so it matches how you work:

grouping (e.g. group by provider vs. show flat list)

filtering (hide stuff you don’t use / only show relevant quotas / focus on a provider)

“current view” style config so you can keep a default dashboard and switch views when needed

Providers right now:

Antigravity (stable)

Codex (stable)

GitHub Copilot (experimental)

If you try it and want another provider added (or the ETTL math improved), I’m all ears.

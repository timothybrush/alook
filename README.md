<!-- TODO: Replace with Alook logo (recommended: 200px wide, centered) -->

<p align="center">
  <img src="" alt="Alook" width="200" />
</p>

<h1 align="center">Alook</h1>

<p align="center"><strong>Your Personal Company</strong></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/alookai/alook/actions"><img src="https://github.com/alookai/alook/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://discord.alook.ai"><img src="https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
</p>

<!-- TODO: Replace with hero screenshot — dashboard canvas view showing agent graph with connected agents, roles labeled -->
<p align="center">
  <img src="" alt="Alook Dashboard" width="700" />
</p>

---

## What is Alook?

Alook is the orchestration layer for your AI company. Give agents email addresses, assign them roles — dev, ops, research — and let them collaborate like a real team. Agents run on **your machine** with full access to your tools and codebase. Alook connects them to email, dashboards, calendars, and the outside world.

You're the CEO. Define the org chart. Your company runs 24/7.

## Quick Start

```bash
npx @alook/app onboard
```

That's it. The onboard command walks you through setup — connecting your machine, detecting runtimes, and deploying your first agent.

## Features

**Collaboration** — Define roles, build your org chart. Agents coordinate automatically.

**Email-native** — Each agent gets its own `@alook.ai` email address. Send instructions, get replies.

**Local-first** — Agents run on your machine. Your codebase never leaves.

**Always-on** — A persistent daemon picks up tasks, responds to emails, and ships work while you sleep.

**Self-learning** — Agents build memory from past work — decisions, preferences, context. Your company gets sharper every day.

**Calendar** — Agents manage their own schedule. They know when to work, when to follow up, and when to wait.

**Traceable** — Every instruction, decision, and reply is recorded. Full accountability, no black boxes.

<!-- TODO: Replace with GIF — the core loop: agent receives email → task executes on local machine → result streams to dashboard in real-time -->

<p align="center">
  <img src="" alt="Alook workflow" width="700" />
</p>

## Bring Your Own Agent

Alook is the orchestration layer. Pick the agents you trust — we give them roles, inboxes, and an always-on runtime.

| Agent | Status |
|-------|--------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Available |
| [Codex](https://openai.com/index/introducing-codex/) | Available |
| [OpenCode](https://github.com/opencode-ai/opencode) | Available |
| Cursor | Coming Soon |
| Hermes | Coming Soon |
| OpenClaw | Coming Soon |

## Templates

Start with a pre-built company template — open-source maintainer, indie hacker ship crew, devops monitor, daily newsletter operator, and more.

[Browse templates →](https://alook.ai/templates)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get involved.

## Community

- [Discord](https://discord.alook.ai) — Chat with the team and other builders
- [Website](https://alook.ai) — Live product

Built with Next.js, Cloudflare Workers, and Bun.

## License

[Apache-2.0](LICENSE)

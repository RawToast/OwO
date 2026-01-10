<p align="center">
  <img src="https://res.cloudinary.com/dyetf2h9n/image/upload/v1768073623/ZENOX_e4boob.png" alt="Zenox" width="600" />
</p>

<h1 align="center">ZENOX</h1>

<p align="center">
  <strong>Intelligent agent orchestration for OpenCode</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zenox"><img src="https://img.shields.io/npm/v/zenox.svg?style=flat-square" alt="npm version" /></a>
  <!-- <a href="https://www.npmjs.com/package/zenox"><img src="https://img.shields.io/npm/dm/zenox.svg?style=flat-square" alt="npm downloads" /></a> -->
  <a href="https://github.com/CYBERBOYAYUSH/zenox/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license" /></a>
</p>

---

Zenox supercharges [OpenCode](https://opencode.ai) with specialized AI agents that handle different aspects of development. Instead of one agent doing everything, you get a team of experts — each optimized for their domain.

## Why Zenox?

Most AI coding assistants use a single model for everything. Zenox takes a different approach:

- **Explorer** finds code fast — optimized for codebase search with a lightweight model
- **Librarian** digs deep into docs — researches libraries, finds GitHub examples, citations included
- **Oracle** thinks strategically — architecture decisions, debugging, technical trade-offs
- **UI Planner** designs beautifully — CSS, animations, interfaces that don't look AI-generated

The main agent automatically delegates to specialists when needed. You don't have to manage them.

## Quick Start

```bash
bunx zenox install
```

That's it. Restart OpenCode and the agents are ready.

## Agents

| Agent | What it does | Default Model |
|-------|-------------|---------------|
| **Explorer** | Codebase search, file discovery, pattern matching | `claude-haiku-4-5` |
| **Librarian** | Library research, docs lookup, GitHub examples | `claude-sonnet-4-5` |
| **Oracle** | Architecture decisions, debugging strategy, code review | `gpt-5.2` |
| **UI Planner** | Frontend design, CSS, animations, visual polish | `gemini-3-pro-high` |

### How delegation works

You don't need to call agents directly. The main agent (Build/Plan) automatically delegates:

```
You: "Where's the authentication logic?"
→ Explorer searches the codebase

You: "How does React Query handle caching?"
→ Librarian fetches official docs + real examples

You: "Should I use Redux or Zustand here?"
→ Oracle analyzes trade-offs for your codebase

You: "Make this dashboard look better"
→ UI Planner redesigns with proper aesthetics
```

## Background Tasks

Need comprehensive research? Fire multiple agents in parallel:

```
background_task(agent="explorer", description="Find auth code", prompt="...")
background_task(agent="librarian", description="JWT best practices", prompt="...")

// Both run simultaneously while you keep working
// You're notified when all tasks complete
```

## Configuration

### Custom Models

During installation, choose "Customize models" to pick your own. Or run later:

```bash
bunx zenox config
```

Config saves to `~/.config/opencode/zenox.json`:

```json
{
  "agents": {
    "explorer": { "model": "anthropic/claude-sonnet-4.5" },
    "oracle": { "model": "openai/gpt-5.2" }
  }
}
```

### Disable Agents or MCPs

```json
{
  "disabled_agents": ["ui-planner"],
  "disabled_mcps": ["grep_app"]
}
```

## Included MCP Servers

Zenox auto-loads these tools for agents to use:

| Server | Purpose |
|--------|---------|
| **exa** | Web search, docs lookup, URL crawling |
| **grep_app** | Search millions of GitHub repos instantly |
| **sequential-thinking** | Step-by-step reasoning for complex problems |

## CLI

```bash
bunx zenox install          # Add to opencode.json + configure models
bunx zenox install --no-tui # Non-interactive (uses defaults)
bunx zenox config           # Reconfigure models anytime
bunx zenox --help           # Show all commands
```

## Auto-Update

Zenox checks for updates on startup. When a new version drops:

1. You see a toast notification
2. Bun cache is invalidated
3. Restart to get the update

Pin a version to disable: `"zenox@1.0.3"` in your plugins array.

## Credits

- [OpenCode](https://opencode.ai) — The CLI this extends
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) — Inspiration for orchestration patterns

## License

[MIT](LICENSE)

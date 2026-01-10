# zenox

OpenCode plugin for intelligent agent orchestration with specialized subagents and parallel background tasks.

## Features

- **4 Specialized Subagents**: Explorer, Librarian, Oracle, UI-Planner
- **Background Tasks**: Parallel agent execution for comprehensive research
- **Auto-Update**: Automatic update checking with toast notifications
- **Auto-Loaded MCP Servers**: exa, grep_app, sequential-thinking
- **Smart Orchestration**: Automatically teaches Build/Plan agents how to delegate
- **CLI Installer**: Easy setup via `bunx zenox install`

## Installation

### Quick Install (Recommended)

```bash
bunx zenox install
```

This will:
- Create `opencode.json` if it doesn't exist
- Add zenox to your plugins array
- Preserve existing configuration

### Manual Install

Add to your `opencode.json`:

```json
{
  "plugins": ["zenox"]
}
```

> **Note**: Don't pin the version (e.g., `zenox@0.1.0`) if you want automatic updates.

Restart OpenCode and the plugin is ready to use.

## CLI Commands

```bash
# Interactive install with TUI
bunx zenox install

# Non-interactive mode (CI/scripts)
bunx zenox install --no-tui

# Specify config path
bunx zenox install --config ./path/to/opencode.json

# Help
bunx zenox --help
```

## Agents

### @explorer
Fast codebase search specialist.
- "Where is X implemented?"
- "Find all files containing Y"
- Pattern matching and locating implementations

**Model**: `anthropic/claude-haiku-4-5`

### @librarian
Open-source research agent.
- "How does library X work?"
- "Show me implementation examples"
- Finding official documentation

**Model**: `anthropic/claude-sonnet-4-5`

### @oracle
Strategic technical advisor.
- Architecture decisions
- Code review and debugging strategy
- Technical trade-offs analysis

**Model**: `openai/gpt-5.2-high`

### @ui-planner
Designer-turned-developer.
- Beautiful UI/UX implementation
- Frontend aesthetics and animations
- Visual design without mockups

**Model**: `google/gemini-3-pro-high`

## Background Tasks

For parallel research, use background tasks instead of sequential agents:

```
// Launch parallel research (all run simultaneously)
background_task(agent="explorer", description="Find auth code", prompt="...")
background_task(agent="explorer", description="Find db layer", prompt="...")
background_task(agent="librarian", description="Best practices", prompt="...")

// Continue working while they run...
// [NOTIFICATION: All background tasks complete!]

// Retrieve results
background_output(task_id="bg_abc123")
```

### When to Use

| Scenario | Use Background Tasks |
|----------|---------------------|
| Comprehensive exploration | YES - fire 3-4 agents in parallel |
| Codebase + external docs | YES - explore + librarian in parallel |
| Result A needed before B | NO - use sequential Task |

## Auto-Update

Zenox automatically checks for updates on startup:

1. **Startup Toast**: Shows current version when plugin loads
2. **Update Check**: Queries npm registry for latest version
3. **Cache Invalidation**: If update available, clears Bun cache
4. **Update Toast**: Notifies you to restart OpenCode

To disable auto-updates, pin your version: `"zenox@0.1.0"`

## Configuration (Optional)

Create `~/.config/opencode/zenox.json` or `.opencode/zenox.json`:

```json
{
  "agents": {
    "explorer": { "model": "anthropic/claude-sonnet-4" },
    "oracle": { "model": "openai/gpt-4o" }
  },
  "disabled_agents": [],
  "disabled_mcps": []
}
```

## Auto-Loaded MCP Servers

| MCP Server | Description |
|------------|-------------|
| `exa` | Web search, code context, URL crawling |
| `grep_app` | GitHub code search across millions of repos |
| `sequential-thinking` | Structured reasoning for complex problems |

## Development

```bash
bun install
bun run build
bun run typecheck
```

## Credits

- **[OpenCode](https://opencode.ai)** — The CLI tool this plugin extends
- **[oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)** by YeonGyu Kim — Inspiration for orchestration patterns

## License

MIT

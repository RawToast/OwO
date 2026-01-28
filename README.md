# OwO

## Agent orchestration for OpenCode

OwO provides a set of plugins that can be used to supercharge [OpenCode](https://opencode.ai)

You can use these plugins to create specialised AI agents that handle different aspects of development. Instead of one agent doing everything, you get a team of experts — each optimized for their domain. Or if you prefer, you can enhance the existing agents and configuration. Everything is customisable, so it's up to you!

## Features

Everything is opt-in. With OwO you have to configure things yourself, but the `examples` package is based on my own setup

- **Background Tasks** — Fire multiple agents in parallel
- **System Prompt Injection** - Add specific commands or skills directly in the system prompt, per agent
- **Keyword Triggers** — `ultrawork`, `deep research`, `explore codebase`
- **Multi Agent Code review** - For when just one agent isn't enough
- **Github PR reviews** - More control than the GH agent provides
- **Various Tools** - To provide more context and power to agents
- **Example Skills** - Based on [Superpowers](https://github.com/obra/superpowers) powerful skills for brainstorming, planning, and sub-agent powered builds
- **Example Agents** - Example agents, using zenox as a base: Explore, Librarian, Oracle, UI Planner. Pre-configured with Superpowers

### Tools

OwO provides tools for tasks usually handled by MCP

- **Context7** - For the latest documentation, handled as a single tool call. No looping around with ids
- **Exa** - Fast web and github search
- **Jira** - Read only access to tickets and dependencies
- **Grep-App** - Super fast github code search
- **Coderabbit** - Code reviews directly from the Coderabbit CLI

## Why OwO?

OwO takes the more lightweight sub-agent and multi-model approach from [zenox](https://github.com/CYBERBOYAYUSH/zenox). This lets you configure each agent to a model more tuned for the task.

For example, you **can** configure orchestration to have something like:

- **Explore** finds code fast — optimized for codebase search with a lightweight model (built into OpenCode, but you can use the `prompt-injector` to enhance it)
- **Librarian** digs deep into docs — researches libraries, finds GitHub examples, citations included
- **Oracle** thinks strategically — architecture decisions, debugging, technical trade-offs
- **UI Planner** designs beautifully — CSS, animations, interfaces that don't look AI-generated

Or you could decide to merge Explore/Librarian into one. Maybe you have no UI work, so need a database expert instead. You can do as you please

You can set your main agent to automatically delegate to specialists when needed. Or — better yet — keep the **build** agent lean and create an orchestrator agent to coordinate!

See [`packages/example`](packages/example) for complete example configurations.

## Install

Things are still under development. You'll need to run from source for now:

```bash
git clone git@github.com:rawtoast/OwO.git
bun install
```

Make note of where you do this, as you'll need the location for plugin installation.

### Setting Up Delegation

To enable agent delegation (where one agent coordinates others), you need:

1. **The orchestration plugin** — Add [`@owo/orchestration`](packages/orchestration/src/index.ts) to your plugins

2. **An orchestrator agent** — Either:
   - Create a custom agent with orchestration instructions in its prompt (see [`packages/example/agent/owO.md`](packages/example/agent/owO.md) for an example)
   - Or use the [`@owo/prompt-injector`](packages/prompt-injector/src/index.ts) plugin to inject orchestration context into existing agents like `build` or `plan`

### Example Configurations

Check out the example configs in [`packages/example`](packages/example):

- **[`owo.example.json`](packages/example/owo.example.json)** — Full OwO config with keywords, prompts, orchestration, and tool settings
- **[`opencode.example.json`](packages/example/opencode.example.json)** — OpenCode config showing how to wire up plugins and configure multiple agents with different models and permissions

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

## Credits

- [OpenCode](https://opencode.ai) — The CLI this extends
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) — Inspiration for orchestration patterns
- [zenox](https://github.com/CYBERBOYAYUSH/zenox) - Originally forked form this great setup

## License

[MIT](LICENSE)

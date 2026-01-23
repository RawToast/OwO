# OpenCode SDK Exploration - START HERE

## 📍 What You'll Find

Complete documentation on how to make **parallel agent requests** from within an OpenCode plugin.

## 🚀 Quick Start (5 minutes)

1. **Read this file** (you're reading it!)
2. **Read**: `OPENCODE_QUICK_START.md` (5 min)
3. **Copy**: Example 1 from `OPENCODE_EXAMPLES.md`
4. **Run** and modify

## 📚 Documentation Files

| File                          | Purpose                       | Time      |
| ----------------------------- | ----------------------------- | --------- |
| **OPENCODE_README.md**        | Navigation guide & index      | 2 min     |
| **OPENCODE_QUICK_START.md**   | 3 core patterns + key methods | 5-10 min  |
| **OPENCODE_SDK_ANALYSIS.md**  | Complete API reference        | 20-30 min |
| **OPENCODE_EXAMPLES.md**      | 10 ready-to-use examples      | 15-20 min |
| **OPENCODE_SUMMARY.txt**      | Key findings summary          | 5 min     |
| **OPENCODE_VISUAL_GUIDE.txt** | Visual overview               | 5 min     |

## ⚡ The Answer: Parallel Requests ARE Fully Supported

### Pattern 1: Simple Parallel (Recommended)

```typescript
const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })
const session = await client.session.create()

const [review, perf, security] = await Promise.all([
  client.session.prompt({
    sessionID: session.data.id,
    agent: "code-review",
    parts: [{ type: "text", text: code }],
  }),
  client.session.prompt({
    sessionID: session.data.id,
    agent: "performance",
    parts: [{ type: "text", text: code }],
  }),
  client.session.prompt({
    sessionID: session.data.id,
    agent: "security",
    parts: [{ type: "text", text: code }],
  }),
])
```

### Pattern 2: Fire-and-Forget

```typescript
await client.session.promptAsync({
  sessionID: session.data.id,
  agent: "build",
  parts: [{ type: "text", text: "Build the project" }],
})
// Returns immediately, processing happens in background
```

### Pattern 3: From Within a Plugin

```typescript
import type { Plugin } from "@opencode-ai/plugin"

const MyPlugin: Plugin = async (input) => {
  const { client, directory } = input // SDK client provided!

  return {
    tool: {
      analyzeParallel: tool({
        description: "Analyze with multiple agents",
        args: { code: tool.schema.string() },
        async execute(args) {
          const session = await client.session.create({ directory })

          const results = await Promise.all([
            client.session.prompt({
              sessionID: session.data.id,
              agent: "code-review",
              parts: [{ type: "text", text: args.code }],
            }),
            client.session.prompt({
              sessionID: session.data.id,
              agent: "performance",
              parts: [{ type: "text", text: args.code }],
            }),
          ])

          return results
        },
      }),
    },
  }
}
```

## ✅ What's Possible

- ✓ Create multiple sessions in parallel
- ✓ Send messages to multiple sessions in parallel
- ✓ Fire-and-forget async requests with `promptAsync()`
- ✓ Delegate to other agents via `AgentPartInput`
- ✓ Create independent parallel branches via `fork()`
- ✓ Process multiple files concurrently
- ✓ Compare different agents on same task
- ✓ Chain parallel operations (cascading)
- ✓ Batch process large workloads
- ✓ Handle partial failures with `Promise.allSettled()`

## 🎯 Key Methods

```typescript
// Create session
const session = await client.session.create()

// Send message (blocking)
await client.session.prompt({ sessionID, agent, parts })

// Send message (non-blocking) ⭐
await client.session.promptAsync({ sessionID, agent, parts })

// Fork session
const branch = await client.session.fork({ sessionID })

// List agents
const agents = await client.app.agents()
```

## 📖 Reading Guide

### I want to...

**...get started immediately** (10 min)
→ Read: `OPENCODE_QUICK_START.md`
→ Copy: Example 1 from `OPENCODE_EXAMPLES.md`

**...understand the full API** (30 min)
→ Read: `OPENCODE_SDK_ANALYSIS.md`

**...implement parallel requests** (20 min)
→ Read: `OPENCODE_QUICK_START.md`
→ Copy: Examples 1, 2, 6 from `OPENCODE_EXAMPLES.md`

**...build a plugin with parallel agents** (45 min)
→ Read: `OPENCODE_SDK_ANALYSIS.md` section 6
→ Copy: Example 5 from `OPENCODE_EXAMPLES.md`

**...see all examples** (30 min)
→ Read: `OPENCODE_EXAMPLES.md` (10 complete examples)

## 🔑 Key Insights

1. **Parallel is native** - All SDK methods return Promises
2. **Sessions are independent** - Create one per task or reuse
3. **Fire-and-forget works** - Use `promptAsync()` for background tasks
4. **Agents are composable** - Delegate to other agents easily
5. **Plugins get full access** - SDK client provided in plugin context

## 📊 Architecture

```
Plugin (owo)
  ↓
PluginInput { client, directory, ... }
  ↓
SDK Client (createOpencodeClient)
  ↓
OpenCode Server (localhost:3000)
  ↓
Agents (code-review, performance, security, ...)
```

## 💡 Best Practices

✅ **DO:**

- Use `Promise.all()` for coordinated parallel work
- Use `promptAsync()` for background tasks
- Reuse sessions for multiple messages
- Specify agents explicitly
- Batch large workloads (100+ items)

❌ **DON'T:**

- Create unnecessary sessions
- Ignore errors in `Promise.all()`
- Spawn unlimited concurrent requests
- Rely on default agents
- Block on fire-and-forget requests

## 🔗 Source Files Analyzed

- `/Users/james.morris/github/opencode/packages/sdk/js/src/v2/gen/sdk.gen.ts` (2900+ lines)
- `/Users/james.morris/github/opencode/packages/sdk/js/src/v2/gen/types.gen.ts` (4800+ lines)
- `/Users/james.morris/github/opencode/packages/sdk/js/example/example.ts` (official example)
- `/Users/james.morris/github/opencode/packages/plugin/src/index.ts` (plugin types)

## 📝 Next Steps

1. ✅ Read `OPENCODE_QUICK_START.md` (5 min)
2. ✅ Copy Example 1 from `OPENCODE_EXAMPLES.md`
3. ✅ Modify and test
4. ✅ Refer to `OPENCODE_SDK_ANALYSIS.md` for details
5. ✅ Build your plugin with parallel agents

## ❓ FAQ

**Q: Can I run unlimited parallel requests?**
A: Technically yes, but batch large workloads. The server may have limits.

**Q: Should I create one session or multiple?**
A: One session for related messages, multiple for independent tasks.

**Q: What's the difference between `prompt()` and `promptAsync()`?**
A: `prompt()` blocks until response, `promptAsync()` returns immediately.

**Q: Can I use multiple agents in one session?**
A: Yes! Send messages with different `agent` parameters.

**Q: How do I handle errors?**
A: Use `Promise.allSettled()` instead of `Promise.all()`.

---

**Ready?** → Open `OPENCODE_QUICK_START.md` now!

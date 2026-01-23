# OpenCode SDK Quick Start: Parallel Agent Requests

## TL;DR - Parallel Requests in 3 Patterns

### Pattern 1: Simple Parallel (Recommended)

```typescript
const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })

// Create one session
const session = await client.session.create()

// Send multiple requests in parallel
const results = await Promise.all([
  client.session.prompt({
    sessionID: session.data.id,
    agent: "code-review",
    parts: [{ type: "text", text: "Review this code" }],
  }),
  client.session.prompt({
    sessionID: session.data.id,
    agent: "performance",
    parts: [{ type: "text", text: "Check performance" }],
  }),
  client.session.prompt({
    sessionID: session.data.id,
    agent: "security",
    parts: [{ type: "text", text: "Security audit" }],
  }),
])
```

### Pattern 2: Fire-and-Forget (Non-blocking)

```typescript
// Send and return immediately
await client.session.promptAsync({
  sessionID: session.data.id,
  agent: "build",
  parts: [{ type: "text", text: "Build the project" }],
})

// Processing happens in background
console.log("Request sent, continuing...")
```

### Pattern 3: Batch Processing

```typescript
const files = ["file1.ts", "file2.ts", "file3.ts"]

const results = await Promise.all(
  files.map(async (file) => {
    const session = await client.session.create()
    return client.session.prompt({
      sessionID: session.data.id,
      parts: [
        { type: "file", mime: "text/plain", url: `file://${file}` },
        { type: "text", text: "Analyze this file" },
      ],
    })
  }),
)
```

---

## From Within a Plugin

```typescript
import type { Plugin } from "@opencode-ai/plugin"

const MyPlugin: Plugin = async (input) => {
  const { client, directory } = input

  return {
    tool: {
      parallelAnalysis: tool({
        description: "Analyze code with multiple agents",
        args: { code: tool.schema.string() },
        async execute(args) {
          const session = await client.session.create({ directory })

          // Parallel requests
          const [review, perf, security] = await Promise.all([
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
            client.session.prompt({
              sessionID: session.data.id,
              agent: "security",
              parts: [{ type: "text", text: args.code }],
            }),
          ])

          return { review, perf, security }
        },
      }),
    },
  }
}
```

---

## Key Methods

| Method                         | Purpose                          | Blocking? |
| ------------------------------ | -------------------------------- | --------- |
| `client.session.create()`      | Create new session               | Yes       |
| `client.session.prompt()`      | Send message, wait for response  | Yes       |
| `client.session.promptAsync()` | Send message, return immediately | No        |
| `client.session.fork()`        | Create parallel branch           | Yes       |
| `client.app.agents()`          | List available agents            | Yes       |

---

## Message Parts

```typescript
// Text
{ type: "text", text: "Your message" }

// File
{ type: "file", mime: "text/plain", url: "file:///path/to/file" }

// Delegate to agent
{ type: "agent", name: "code-review" }

// Structured subtask
{
  type: "subtask",
  prompt: "Analyze performance",
  agent: "performance",
  model: { providerID: "openai", modelID: "gpt-4" }
}
```

---

## Specify Agent & Model

```typescript
await client.session.prompt({
  sessionID: "session-id",
  agent: "build", // Which agent
  model: {
    providerID: "openai",
    modelID: "gpt-4", // Which model
  },
  parts: [{ type: "text", text: "..." }],
})
```

---

## Error Handling

```typescript
try {
  const results = await Promise.all([
    client.session.prompt({
      /* ... */
    }),
    client.session.prompt({
      /* ... */
    }),
  ])
} catch (error) {
  console.error("Failed:", error.message)
}
```

---

## Concurrency Patterns

### All at once

```typescript
await Promise.all(requests)
```

### First to complete

```typescript
const first = await Promise.race(requests)
```

### Sequential

```typescript
for (const req of requests) {
  await req
}
```

### Batches of N

```typescript
for (let i = 0; i < requests.length; i += batchSize) {
  await Promise.all(requests.slice(i, i + batchSize))
}
```

---

## Common Patterns

### Analyze Multiple Files

```typescript
const files = ["a.ts", "b.ts", "c.ts"]
const results = await Promise.all(
  files.map(async (file) => {
    const session = await client.session.create()
    return client.session.prompt({
      sessionID: session.data.id,
      parts: [
        { type: "file", mime: "text/plain", url: `file://${file}` },
        { type: "text", text: "Analyze" },
      ],
    })
  }),
)
```

### Compare Agents

```typescript
const agents = ["code-review", "performance", "security"]
const session = await client.session.create()

const results = await Promise.all(
  agents.map((agent) =>
    client.session.prompt({
      sessionID: session.data.id,
      agent,
      parts: [{ type: "text", text: "Analyze this code" }],
    }),
  ),
)
```

### Parallel Branches

```typescript
const parent = await client.session.create()
await client.session.prompt({
  sessionID: parent.data.id,
  parts: [{ type: "text", text: "Initial analysis" }],
})

const [branch1, branch2] = await Promise.all([
  client.session.fork({ sessionID: parent.data.id }),
  client.session.fork({ sessionID: parent.data.id }),
])

await Promise.all([
  client.session.prompt({
    sessionID: branch1.data.id,
    parts: [{ type: "text", text: "Approach A" }],
  }),
  client.session.prompt({
    sessionID: branch2.data.id,
    parts: [{ type: "text", text: "Approach B" }],
  }),
])
```

---

## Tips

✅ **DO:**

- Use `Promise.all()` for coordinated parallel work
- Use `promptAsync()` for background tasks
- Reuse sessions for multiple messages
- Specify agents explicitly
- Batch large workloads

❌ **DON'T:**

- Create unnecessary sessions
- Ignore errors in Promise.all()
- Spawn unlimited concurrent requests
- Rely on default agents
- Block on fire-and-forget requests

---

## Full Example: Multi-Agent Analysis Tool

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const AnalyzerPlugin: Plugin = async (input) => {
  const { client, directory } = input

  return {
    tool: {
      analyzeCode: tool({
        description: "Analyze code with multiple agents in parallel",
        args: {
          code: tool.schema.string(),
          agents: tool.schema.array(tool.schema.string()).optional(),
        },
        async execute(args) {
          const agentList = args.agents || ["code-review", "performance", "security"]
          const session = await client.session.create({ directory })

          const analyses = await Promise.all(
            agentList.map((agent) =>
              client.session.prompt({
                sessionID: session.data.id,
                agent,
                parts: [{ type: "text", text: args.code }],
              }),
            ),
          )

          return {
            sessionId: session.data.id,
            results: agentList.map((agent, i) => ({
              agent,
              analysis: analyses[i],
            })),
          }
        },
      }),
    },
  }
}

export default AnalyzerPlugin
```

---

## Resources

- Full Analysis: `OPENCODE_SDK_ANALYSIS.md`
- SDK Repo: `/Users/james.morris/github/opencode/packages/sdk/js/`
- Example: `/Users/james.morris/github/opencode/packages/sdk/js/example/example.ts`
- Types: `/Users/james.morris/github/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`

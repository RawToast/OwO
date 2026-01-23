# OpenCode SDK Analysis: Parallel Agent Requests & Multi-Agent Patterns

## Executive Summary

The OpenCode SDK provides a comprehensive API for programmatically interacting with AI agents and sessions. **Parallel agent requests are fully supported** through:

1. **Async/Promise-based API** - All SDK methods return Promises
2. **`promptAsync()` method** - Fire-and-forget async message sending
3. **`Promise.all()` pattern** - Demonstrated in official examples
4. **Subagent/Agent parts** - Built-in support for delegating to other agents
5. **Session forking** - Create independent parallel execution contexts

---

## 1. SDK Architecture & Entry Points

### Installation & Initialization

```typescript
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk"

// Server-side (optional, for local development)
const server = await createOpencodeServer()
const client = createOpencodeClient({ baseUrl: server.url })

// Or direct client connection
const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })
```

### Plugin Context Access

From within a plugin, the SDK client is provided via `PluginInput`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

const MyPlugin: Plugin = async (input) => {
  const { client, project, directory, serverUrl } = input

  // client is: ReturnType<typeof createOpencodeClient>
  // Ready to use for parallel requests

  return {
    tool: {
      /* ... */
    },
    event: async ({ event }) => {
      /* ... */
    },
  }
}
```

**Key exports from `@opencode-ai/sdk`:**

- `createOpencodeClient()` - Create SDK client
- `createOpencodeServer()` - Create local server
- `createOpencode()` - Combined server + client setup
- Type exports: `Project`, `Model`, `Provider`, `Message`, `Part`, `Agent`, `Config`

---

## 2. Core API Methods for Parallel Execution

### Session Management

```typescript
// Create a new session
const session = await client.session.create({
  directory: "/path/to/project",
})
// Returns: { data: { id: string, ... } }

// Get session status
const status = await client.session.status({ directory })

// List all sessions
const sessions = await client.session.list({ directory })

// Fork a session (create independent copy at a message point)
const forked = await client.session.fork({
  sessionID: "parent-session-id",
  messageID: "message-id", // optional
})
```

### Message/Prompt Methods (Core for Parallel Requests)

#### Synchronous Prompt (Streaming)

```typescript
// Send message and wait for response (streaming)
const response = await client.session.prompt({
  sessionID: "session-id",
  directory: "/path/to/project",
  agent: "build", // Specify which agent to use
  model: {
    providerID: "openai",
    modelID: "gpt-4",
  },
  parts: [
    {
      type: "text",
      text: "Analyze this code",
    },
    {
      type: "file",
      mime: "text/plain",
      url: "file:///path/to/file.ts",
    },
  ],
})
```

#### Asynchronous Prompt (Fire-and-Forget) ⭐ **KEY FOR PARALLEL**

```typescript
// Send message and return immediately (non-blocking)
const asyncResponse = await client.session.promptAsync({
  sessionID: "session-id",
  directory: "/path/to/project",
  agent: "build",
  parts: [{ type: "text", text: "Do something" }],
})
// Returns immediately, processing happens in background
```

#### Get Messages

```typescript
// Retrieve all messages in a session
const messages = await client.session.messages({
  sessionID: "session-id",
  directory: "/path/to/project",
  limit: 50,
})

// Get specific message
const message = await client.session.message({
  sessionID: "session-id",
  messageID: "message-id",
  directory: "/path/to/project",
})
```

### Agent Discovery

```typescript
// List all available agents
const agents = await client.app.agents({ directory })
// Returns: Array<Agent>
// Agent type includes: name, description, mode, model, permission, steps, etc.

// List all available skills
const skills = await client.app.skills({ directory })
```

---

## 3. Parallel Execution Patterns

### Pattern 1: Promise.all() with Multiple Sessions

**Official Example from SDK:**

```typescript
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk"

const server = await createOpencodeServer()
const client = createOpencodeClient({ baseUrl: server.url })

const files = await Array.fromAsync(new Bun.Glob("packages/core/*.ts").scan())

// Create parallel requests for each file
await Promise.all(
  files.map(async (file) => {
    const session = await client.session.create()
    console.log("processing", file)

    await client.session.prompt({
      sessionID: session.data.id,
      parts: [
        {
          type: "file",
          mime: "text/plain",
          url: `file://${file}`,
        },
        {
          type: "text",
          text: `Write tests for every public function in this file.`,
        },
      ],
    })

    console.log("done", file)
  }),
)
```

### Pattern 2: Fire-and-Forget with promptAsync()

```typescript
// Spawn multiple async requests without waiting
const tasks: Promise<void>[] = []

for (const file of files) {
  const session = await client.session.create()

  // Fire-and-forget: returns immediately
  tasks.push(
    client.session
      .promptAsync({
        sessionID: session.data.id,
        parts: [
          { type: "file", mime: "text/plain", url: `file://${file}` },
          { type: "text", text: "Analyze this file" },
        ],
      })
      .then(() => console.log("done", file)),
  )
}

// Wait for all to complete
await Promise.all(tasks)
```

### Pattern 3: Subagent Delegation (Built-in Multi-Agent)

**Using AgentPartInput to delegate to other agents:**

```typescript
// Send a message that delegates to a specific subagent
await client.session.prompt({
  sessionID: "session-id",
  parts: [
    {
      type: "agent",
      name: "code-review", // Name of the subagent
      source: {
        value: "function foo() { ... }",
        start: 0,
        end: 25,
      },
    },
    {
      type: "text",
      text: "Review this code",
    },
  ],
})
```

### Pattern 4: Subtask Delegation

**Using SubtaskPartInput for structured parallel work:**

```typescript
// Delegate work to a specific agent with explicit model
await client.session.prompt({
  sessionID: "session-id",
  parts: [
    {
      type: "subtask",
      prompt: "Analyze performance",
      description: "Performance analysis of the module",
      agent: "performance",
      model: {
        providerID: "openai",
        modelID: "gpt-4",
      },
      command: "npm run benchmark",
    },
  ],
})
```

### Pattern 5: Session Forking for Parallel Branches

```typescript
// Create independent parallel execution branches
const parentSession = await client.session.create()

// Send initial message
await client.session.prompt({
  sessionID: parentSession.data.id,
  parts: [{ type: "text", text: "Initial analysis" }],
})

// Fork into multiple parallel branches
const [branch1, branch2, branch3] = await Promise.all([
  client.session.fork({
    sessionID: parentSession.data.id,
    messageID: "message-id",
  }),
  client.session.fork({
    sessionID: parentSession.data.id,
    messageID: "message-id",
  }),
  client.session.fork({
    sessionID: parentSession.data.id,
    messageID: "message-id",
  }),
])

// Process each branch in parallel
await Promise.all([
  client.session.prompt({
    sessionID: branch1.data.id,
    parts: [{ type: "text", text: "Approach A" }],
  }),
  client.session.prompt({
    sessionID: branch2.data.id,
    parts: [{ type: "text", text: "Approach B" }],
  }),
  client.session.prompt({
    sessionID: branch3.data.id,
    parts: [{ type: "text", text: "Approach C" }],
  }),
])
```

---

## 4. Agent Configuration & Types

### Agent Type Definition

```typescript
export type Agent = {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  native?: boolean
  hidden?: boolean
  topP?: number
  temperature?: number
  color?: string
  permission: PermissionRuleset
  model?: {
    modelID: string
    providerID: string
  }
  prompt?: string
  options: {
    [key: string]: unknown
  }
  steps?: number // Max agentic iterations
}
```

### Agent Modes

- **`"primary"`** - Main agent, can be invoked directly
- **`"subagent"`** - Helper agent, invoked via `@agent-name` or `AgentPartInput`
- **`"all"`** - Available in all contexts

### Specifying Agent in Requests

```typescript
// Use specific agent
await client.session.prompt({
  sessionID: "session-id",
  agent: "build", // Use the "build" agent
  parts: [{ type: "text", text: "Build the project" }],
})

// Use specific model for agent
await client.session.prompt({
  sessionID: "session-id",
  agent: "code-review",
  model: {
    providerID: "anthropic",
    modelID: "claude-3-opus",
  },
  parts: [{ type: "text", text: "Review code" }],
})
```

---

## 5. Message Parts System

### Supported Part Types

```typescript
// Text part
{
  type: "text",
  text: string,
  synthetic?: boolean,
  ignored?: boolean,
  time?: { start: number, end?: number },
  metadata?: Record<string, unknown>
}

// File part
{
  type: "file",
  mime: string,
  filename?: string,
  url: string,  // file:// or http(s)://
  source?: FilePartSource
}

// Agent part (delegate to subagent)
{
  type: "agent",
  name: string,
  source?: {
    value: string,
    start: number,
    end: number
  }
}

// Subtask part (structured delegation)
{
  type: "subtask",
  prompt: string,
  description: string,
  agent: string,
  model?: { providerID: string, modelID: string },
  command?: string
}
```

---

## 6. Using SDK from Within a Plugin

### Plugin Receives Client in Context

```typescript
import type { Plugin } from "@opencode-ai/plugin"

const MyPlugin: Plugin = async (input) => {
  const { client, project, directory, serverUrl } = input

  // Tool that spawns parallel agent requests
  return {
    tool: {
      analyzeMultipleFiles: tool({
        description: "Analyze multiple files in parallel",
        args: {
          files: tool.schema.array(tool.schema.string()),
          agent: tool.schema.string().optional(),
        },
        async execute(args) {
          // Spawn parallel requests
          const results = await Promise.all(
            args.files.map(async (file) => {
              const session = await client.session.create({ directory })

              return client.session.prompt({
                sessionID: session.data.id,
                agent: args.agent || "build",
                parts: [
                  {
                    type: "file",
                    mime: "text/plain",
                    url: `file://${file}`,
                  },
                  {
                    type: "text",
                    text: "Analyze this file",
                  },
                ],
              })
            }),
          )

          return results
        },
      }),
    },
  }
}
```

### Event Hooks with Parallel Processing

```typescript
const MyPlugin: Plugin = async (input) => {
  const { client, directory } = input

  return {
    event: async ({ event }) => {
      if (event.type === "session.message") {
        // Spawn parallel analysis tasks
        await Promise.all([
          client.session.promptAsync({
            sessionID: event.sessionID,
            agent: "code-review",
            parts: [{ type: "text", text: "Review the code" }],
          }),
          client.session.promptAsync({
            sessionID: event.sessionID,
            agent: "performance",
            parts: [{ type: "text", text: "Check performance" }],
          }),
          client.session.promptAsync({
            sessionID: event.sessionID,
            agent: "security",
            parts: [{ type: "text", text: "Security audit" }],
          }),
        ])
      }
    },
  }
}
```

---

## 7. Advanced Patterns

### Concurrent Batch Processing

```typescript
// Process items in batches of N concurrent requests
async function processBatch(items: string[], batchSize: number) {
  const results = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const session = await client.session.create()
        return client.session.prompt({
          sessionID: session.data.id,
          parts: [{ type: "text", text: `Process: ${item}` }],
        })
      }),
    )

    results.push(...batchResults)
  }

  return results
}
```

### Parallel Agent Comparison

```typescript
// Run same task with multiple agents in parallel
async function compareAgents(task: string, agents: string[]) {
  const session = await client.session.create()

  const results = await Promise.all(
    agents.map((agent) =>
      client.session.prompt({
        sessionID: session.data.id,
        agent,
        parts: [{ type: "text", text: task }],
      }),
    ),
  )

  return results.map((result, i) => ({
    agent: agents[i],
    result,
  }))
}
```

### Cascading Parallel Requests

```typescript
// First wave: parallel analysis
const analyses = await Promise.all([
  analyzeWithAgent("code-review", code),
  analyzeWithAgent("performance", code),
  analyzeWithAgent("security", code),
])

// Second wave: parallel synthesis based on results
const synthesis = await Promise.all(
  analyses.map((analysis) => synthesizeWithAgent("summary", analysis.result)),
)
```

---

## 8. Key API Methods Reference

### Session Methods

- `session.create()` - Create new session
- `session.list()` - List all sessions
- `session.get()` - Get session details
- `session.update()` - Update session metadata
- `session.delete()` - Delete session
- `session.status()` - Get session status
- `session.fork()` - Fork session at message point
- `session.children()` - Get child sessions
- `session.abort()` - Abort active session

### Message Methods

- `session.prompt()` - Send message (blocking, streaming)
- `session.promptAsync()` - Send message (non-blocking)
- `session.messages()` - Get all messages
- `session.message()` - Get specific message
- `session.command()` - Send command
- `session.revert()` - Revert message
- `session.unrevert()` - Restore reverted message

### Agent Methods

- `app.agents()` - List available agents
- `app.skills()` - List available skills

### PTY Methods (for shell execution)

- `pty.create()` - Create pseudo-terminal
- `pty.list()` - List PTY sessions
- `pty.get()` - Get PTY details
- `pty.connect()` - Connect to PTY (WebSocket)
- `pty.update()` - Update PTY
- `pty.remove()` - Remove PTY

---

## 9. Error Handling & Best Practices

### Error Handling Pattern

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
  if (error instanceof Error) {
    console.error("Request failed:", error.message)
  }
}
```

### Best Practices for Parallel Requests

1. **Use `promptAsync()` for fire-and-forget** - Returns immediately
2. **Use `Promise.all()` for coordinated parallel** - Wait for all to complete
3. **Use `Promise.race()` for first-to-complete** - Get fastest result
4. **Batch large workloads** - Avoid overwhelming the system
5. **Reuse sessions** - Create once, send multiple messages
6. **Specify agents explicitly** - Don't rely on defaults
7. **Handle errors gracefully** - Wrap in try/catch
8. **Monitor resource usage** - Track concurrent sessions

---

## 10. Configuration & Customization

### Client Configuration

```typescript
const client = createOpencodeClient({
  baseUrl: "http://localhost:3000",
  directory: "/path/to/project", // Default directory
  headers: {
    Authorization: "Bearer token",
    "Custom-Header": "value",
  },
  fetch: customFetchImplementation, // Optional custom fetch
})
```

### Agent Configuration (in AGENTS.md or config)

```yaml
agent:
  build:
    model: gpt-4
    temperature: 0.7
    steps: 10
    description: "Build and compile code"
    mode: primary
    permission:
      bash: true
      file: true

  code-review:
    model: claude-3-opus
    description: "Review code quality"
    mode: subagent
    permission:
      file: true
```

---

## 11. Summary: What's Possible

### ✅ Fully Supported

- **Parallel session creation** - Create multiple sessions simultaneously
- **Parallel message sending** - Send messages to multiple sessions in parallel
- **Fire-and-forget async** - Use `promptAsync()` for non-blocking requests
- **Multi-agent delegation** - Use `AgentPartInput` to delegate to subagents
- **Session forking** - Create independent parallel execution branches
- **Batch processing** - Process multiple items concurrently
- **Agent comparison** - Run same task with multiple agents in parallel
- **Cascading requests** - Chain parallel operations

### 🎯 Recommended Patterns

1. **For independent parallel work**: Use `Promise.all()` with multiple sessions
2. **For background processing**: Use `promptAsync()`
3. **For agent delegation**: Use `AgentPartInput` or `SubtaskPartInput`
4. **For branching logic**: Use `session.fork()`
5. **For resource management**: Batch requests and reuse sessions

### 📊 Performance Considerations

- Each session is independent and can be processed in parallel
- `promptAsync()` returns immediately, processing happens server-side
- No built-in rate limiting in SDK (server may have limits)
- Concurrent requests scale with available resources
- Consider batching for very large workloads (100+ concurrent)

---

## 12. Example: Complete Multi-Agent Plugin

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const MultiAgentPlugin: Plugin = async (input) => {
  const { client, directory } = input

  return {
    tool: {
      analyzeCodeParallel: tool({
        description: "Analyze code with multiple agents in parallel",
        args: {
          code: tool.schema.string(),
          agents: tool.schema.array(tool.schema.string()).optional(),
        },
        async execute(args) {
          const agentsToUse = args.agents || ["code-review", "performance", "security"]

          // Create session
          const session = await client.session.create({ directory })

          // Run all agents in parallel
          const results = await Promise.all(
            agentsToUse.map((agent) =>
              client.session.prompt({
                sessionID: session.data.id,
                agent,
                parts: [
                  {
                    type: "text",
                    text: `Analyze this code:\n\n${args.code}`,
                  },
                ],
              }),
            ),
          )

          return {
            sessionId: session.data.id,
            analyses: results.map((result, i) => ({
              agent: agentsToUse[i],
              result,
            })),
          }
        },
      }),
    },
  }
}

export default MultiAgentPlugin
```

---

## References

- **SDK Location**: `/Users/james.morris/github/opencode/packages/sdk/js/`
- **Example**: `/Users/james.morris/github/opencode/packages/sdk/js/example/example.ts`
- **Plugin Types**: `/Users/james.morris/github/opencode/packages/plugin/src/index.ts`
- **Generated Types**: `/Users/james.morris/github/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`
- **Generated SDK**: `/Users/james.morris/github/opencode/packages/sdk/js/src/v2/gen/sdk.gen.ts`

# OpenCode SDK: Ready-to-Use Examples

## Example 1: Basic Parallel Agent Analysis

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function analyzeCodeParallel(code: string) {
  const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })

  // Create a session
  const session = await client.session.create()

  // Run three agents in parallel
  const [review, performance, security] = await Promise.all([
    client.session.prompt({
      sessionID: session.data.id,
      agent: "code-review",
      parts: [
        {
          type: "text",
          text: `Review this code for quality and best practices:\n\n${code}`,
        },
      ],
    }),
    client.session.prompt({
      sessionID: session.data.id,
      agent: "performance",
      parts: [
        {
          type: "text",
          text: `Analyze performance implications of this code:\n\n${code}`,
        },
      ],
    }),
    client.session.prompt({
      sessionID: session.data.id,
      agent: "security",
      parts: [
        {
          type: "text",
          text: `Perform security audit on this code:\n\n${code}`,
        },
      ],
    }),
  ])

  return {
    sessionId: session.data.id,
    codeReview: review,
    performanceAnalysis: performance,
    securityAudit: security,
  }
}

// Usage
const result = await analyzeCodeParallel(`
function processData(items) {
  for (let i = 0; i < items.length; i++) {
    console.log(items[i])
  }
}
`)
```

---

## Example 2: Batch File Processing

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"
import { readdir } from "fs/promises"
import { join } from "path"

async function analyzeFilesInDirectory(dirPath: string, agent: string = "code-review") {
  const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })

  // Get all TypeScript files
  const files = await readdir(dirPath)
  const tsFiles = files.filter((f) => f.endsWith(".ts"))

  // Process all files in parallel
  const results = await Promise.all(
    tsFiles.map(async (file) => {
      const session = await client.session.create()
      const filePath = join(dirPath, file)

      const analysis = await client.session.prompt({
        sessionID: session.data.id,
        agent,
        parts: [
          {
            type: "file",
            mime: "text/plain",
            url: `file://${filePath}`,
          },
          {
            type: "text",
            text: "Analyze this file and provide insights",
          },
        ],
      })

      return {
        file,
        sessionId: session.data.id,
        analysis,
      }
    }),
  )

  return results
}

// Usage
const analyses = await analyzeFilesInDirectory("./src")
console.log(`Analyzed ${analyses.length} files`)
```

---

## Example 3: Fire-and-Forget Background Tasks

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function triggerBackgroundAnalysis(code: string, sessionId: string) {
  const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })

  // Send multiple async requests (fire-and-forget)
  const tasks = [
    client.session.promptAsync({
      sessionID: sessionId,
      agent: "code-review",
      parts: [{ type: "text", text: `Review: ${code}` }],
    }),
    client.session.promptAsync({
      sessionID: sessionId,
      agent: "documentation",
      parts: [{ type: "text", text: `Document: ${code}` }],
    }),
    client.session.promptAsync({
      sessionID: sessionId,
      agent: "testing",
      parts: [{ type: "text", text: `Generate tests for: ${code}` }],
    }),
  ]

  // Return immediately, processing happens in background
  await Promise.all(tasks)

  return {
    message: "Analysis tasks queued",
    sessionId,
  }
}

// Usage
const result = await triggerBackgroundAnalysis("function foo() {}", "session-123")
console.log(result.message) // Logs immediately
```

---

## Example 4: Parallel Session Forking

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function exploreMultipleApproaches(problem: string) {
  const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })

  // Create parent session with initial analysis
  const parent = await client.session.create()

  await client.session.prompt({
    sessionID: parent.data.id,
    parts: [
      {
        type: "text",
        text: `Problem to solve: ${problem}`,
      },
    ],
  })

  // Fork into three parallel branches for different approaches
  const [branch1, branch2, branch3] = await Promise.all([
    client.session.fork({ sessionID: parent.data.id }),
    client.session.fork({ sessionID: parent.data.id }),
    client.session.fork({ sessionID: parent.data.id }),
  ])

  // Explore different solutions in parallel
  const [approach1, approach2, approach3] = await Promise.all([
    client.session.prompt({
      sessionID: branch1.data.id,
      agent: "architect",
      parts: [
        {
          type: "text",
          text: "Approach 1: Design a solution using microservices",
        },
      ],
    }),
    client.session.prompt({
      sessionID: branch2.data.id,
      agent: "architect",
      parts: [
        {
          type: "text",
          text: "Approach 2: Design a solution using monolithic architecture",
        },
      ],
    }),
    client.session.prompt({
      sessionID: branch3.data.id,
      agent: "architect",
      parts: [
        {
          type: "text",
          text: "Approach 3: Design a solution using serverless",
        },
      ],
    }),
  ])

  return {
    parentSessionId: parent.data.id,
    approaches: [
      { name: "Microservices", sessionId: branch1.data.id, analysis: approach1 },
      { name: "Monolithic", sessionId: branch2.data.id, analysis: approach2 },
      { name: "Serverless", sessionId: branch3.data.id, analysis: approach3 },
    ],
  }
}

// Usage
const result = await exploreMultipleApproaches("Build a real-time chat application")
```

---

## Example 5: Plugin with Parallel Tool

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const ParallelAnalyzerPlugin: Plugin = async (input) => {
  const { client, directory } = input

  return {
    tool: {
      multiAgentAnalysis: tool({
        description: "Analyze code with multiple specialized agents in parallel",
        args: {
          code: tool.schema.string().describe("Code to analyze"),
          agents: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Agents to use (default: code-review, performance, security)"),
        },
        async execute(args) {
          const agentList = args.agents || ["code-review", "performance", "security"]

          // Create session
          const session = await client.session.create({ directory })

          // Run all agents in parallel
          const results = await Promise.all(
            agentList.map((agent) =>
              client.session.prompt({
                sessionID: session.data.id,
                agent,
                parts: [
                  {
                    type: "text",
                    text: args.code,
                  },
                ],
              }),
            ),
          )

          // Format results
          const analysis = agentList.map((agent, index) => ({
            agent,
            result: results[index],
          }))

          return {
            sessionId: session.data.id,
            analysis,
            timestamp: new Date().toISOString(),
          }
        },
      }),
    },
  }
}

export default ParallelAnalyzerPlugin
```

---

## Example 6: Batch Processing with Concurrency Control

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function processBatchWithConcurrency(
  items: string[],
  batchSize: number = 3,
  agent: string = "build",
) {
  const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })
  const results = []

  // Process in batches to control concurrency
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}...`)

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const session = await client.session.create()

        return client.session.prompt({
          sessionID: session.data.id,
          agent,
          parts: [
            {
              type: "text",
              text: `Process this item: ${item}`,
            },
          ],
        })
      }),
    )

    results.push(...batchResults)
  }

  return results
}

// Usage: Process 100 items in batches of 5
const items = Array.from({ length: 100 }, (_, i) => `item-${i}`)
const results = await processBatchWithConcurrency(items, 5)
console.log(`Processed ${results.length} items`)
```

---

## Example 7: Compare Agent Performance

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function compareAgentPerformance(task: string, agents: string[]) {
  const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })

  // Create one session
  const session = await client.session.create()

  // Run all agents with the same task
  const startTime = Date.now()

  const results = await Promise.all(
    agents.map((agent) =>
      client.session.prompt({
        sessionID: session.data.id,
        agent,
        parts: [
          {
            type: "text",
            text: task,
          },
        ],
      }),
    ),
  )

  const totalTime = Date.now() - startTime

  // Compare results
  const comparison = agents.map((agent, index) => ({
    agent,
    result: results[index],
    responseTime: `${totalTime / agents.length}ms (avg)`,
  }))

  return {
    task,
    sessionId: session.data.id,
    totalTime: `${totalTime}ms`,
    comparison,
  }
}

// Usage
const comparison = await compareAgentPerformance("Write a function to sort an array", [
  "code-review",
  "performance",
  "documentation",
])
console.log(comparison)
```

---

## Example 8: Cascading Parallel Requests

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function cascadingAnalysis(code: string) {
  const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })

  // Phase 1: Parallel analysis
  const session = await client.session.create()

  const [review, performance, security] = await Promise.all([
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

  // Phase 2: Parallel synthesis based on results
  const [summary, recommendations, risks] = await Promise.all([
    client.session.prompt({
      sessionID: session.data.id,
      agent: "summary",
      parts: [
        {
          type: "text",
          text: `Summarize these analyses:\n\nCode Review: ${review}\n\nPerformance: ${performance}\n\nSecurity: ${security}`,
        },
      ],
    }),
    client.session.prompt({
      sessionID: session.data.id,
      agent: "recommendations",
      parts: [
        {
          type: "text",
          text: `Based on these analyses, provide recommendations:\n\nCode Review: ${review}\n\nPerformance: ${performance}`,
        },
      ],
    }),
    client.session.prompt({
      sessionID: session.data.id,
      agent: "risk-assessment",
      parts: [
        {
          type: "text",
          text: `Assess risks from these analyses:\n\nSecurity: ${security}\n\nPerformance: ${performance}`,
        },
      ],
    }),
  ])

  return {
    sessionId: session.data.id,
    phase1: { review, performance, security },
    phase2: { summary, recommendations, risks },
  }
}

// Usage
const analysis = await cascadingAnalysis("function foo() { /* code */ }")
```

---

## Example 9: Error Handling with Parallel Requests

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function robustParallelAnalysis(code: string) {
  const client = createOpencodeClient({ baseUrl: "http://localhost:3000" })

  const session = await client.session.create()

  // Use Promise.allSettled to handle individual failures
  const results = await Promise.allSettled([
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

  // Process results
  const analyses = {
    codeReview: null as any,
    performance: null as any,
    security: null as any,
    errors: [] as string[],
  }

  if (results[0].status === "fulfilled") {
    analyses.codeReview = results[0].value
  } else {
    analyses.errors.push(`Code review failed: ${results[0].reason}`)
  }

  if (results[1].status === "fulfilled") {
    analyses.performance = results[1].value
  } else {
    analyses.errors.push(`Performance analysis failed: ${results[1].reason}`)
  }

  if (results[2].status === "fulfilled") {
    analyses.security = results[2].value
  } else {
    analyses.errors.push(`Security audit failed: ${results[2].reason}`)
  }

  return {
    sessionId: session.data.id,
    analyses,
    hasErrors: analyses.errors.length > 0,
  }
}

// Usage
const result = await robustParallelAnalysis("function foo() {}")
if (result.hasErrors) {
  console.error("Some analyses failed:", result.analyses.errors)
}
```

---

## Example 10: Real-World: Multi-Agent Code Review System

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const CodeReviewPlugin: Plugin = async (input) => {
  const { client, directory } = input

  return {
    tool: {
      comprehensiveCodeReview: tool({
        description: "Perform comprehensive code review using multiple specialized agents",
        args: {
          filePath: tool.schema.string().describe("Path to file to review"),
          includeTests: tool.schema.boolean().optional().describe("Include test generation"),
        },
        async execute(args) {
          const session = await client.session.create({ directory })

          // Prepare file part
          const filePart = {
            type: "file" as const,
            mime: "text/plain",
            url: `file://${args.filePath}`,
          }

          // Run all review agents in parallel
          const reviewPromises = [
            client.session.prompt({
              sessionID: session.data.id,
              agent: "code-review",
              parts: [filePart, { type: "text", text: "Perform code quality review" }],
            }),
            client.session.prompt({
              sessionID: session.data.id,
              agent: "performance",
              parts: [filePart, { type: "text", text: "Analyze performance implications" }],
            }),
            client.session.prompt({
              sessionID: session.data.id,
              agent: "security",
              parts: [filePart, { type: "text", text: "Perform security audit" }],
            }),
            client.session.prompt({
              sessionID: session.data.id,
              agent: "documentation",
              parts: [filePart, { type: "text", text: "Review documentation and comments" }],
            }),
          ]

          // Add test generation if requested
          if (args.includeTests) {
            reviewPromises.push(
              client.session.prompt({
                sessionID: session.data.id,
                agent: "testing",
                parts: [filePart, { type: "text", text: "Generate comprehensive tests" }],
              }),
            )
          }

          // Execute all reviews in parallel
          const [quality, performance, security, documentation, tests] =
            await Promise.all(reviewPromises)

          return {
            sessionId: session.data.id,
            file: args.filePath,
            reviews: {
              quality,
              performance,
              security,
              documentation,
              ...(args.includeTests && { tests }),
            },
            timestamp: new Date().toISOString(),
          }
        },
      }),
    },
  }
}

export default CodeReviewPlugin
```

---

## Tips for Production Use

1. **Error Handling**: Use `Promise.allSettled()` instead of `Promise.all()` to handle partial failures
2. **Concurrency Control**: Batch large workloads to avoid overwhelming the system
3. **Session Reuse**: Create one session and send multiple messages to it
4. **Agent Specification**: Always specify agents explicitly, don't rely on defaults
5. **Monitoring**: Log session IDs and timestamps for debugging
6. **Cleanup**: Consider deleting old sessions to manage resources
7. **Timeouts**: Implement timeouts for long-running operations
8. **Caching**: Cache agent lists and configuration to reduce API calls

---

## Debugging

```typescript
// Log all requests
const client = createOpencodeClient({
  baseUrl: "http://localhost:3000",
  fetch: async (req) => {
    console.log("Request:", req.url, req.method)
    const res = await fetch(req)
    console.log("Response:", res.status)
    return res
  },
})

// List available agents
const agents = await client.app.agents()
console.log(
  "Available agents:",
  agents.map((a) => a.name),
)

// Get session details
const session = await client.session.get({ sessionID: "session-id" })
console.log("Session:", session)

// Get all messages in session
const messages = await client.session.messages({ sessionID: "session-id" })
console.log("Messages:", messages)
```

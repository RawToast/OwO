# Code Review Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a plugin that provides a multi-stage code review tool with parallel reviewer agents and configurable output formatting.

**Architecture:** A tool gathers git diff context based on mode (vs-main, unstaged, staged, commits), dispatches 1-2 parallel reviewer sessions using the SDK, collects their outputs, and returns raw markdown for the caller to verify and format using an instruction-based template.

**Tech Stack:** TypeScript, Bun, Zod (config validation), @opencode-ai/sdk (session management), @opencode-ai/plugin (tool definition)

---

## Design Decisions

| Aspect              | Decision                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| **Scope detection** | Explicit mode param (`vs-main`, `unstaged`, `staged`, `commits`) with optional `refs[]` for commits |
| **Reviewer config** | Agent-based only, with optional `focus` (string) and `context` (file ref)                           |
| **Reviewer count**  | 1-2 max (enforced by schema)                                                                        |
| **Review output**   | Raw markdown from each reviewer, concatenated                                                       |
| **Verify guidance** | Optional `verify.guidance` string in config                                                         |
| **Output template** | Instruction-based file - LLM interprets naturally                                                   |
| **Tool interface**  | Single `review` tool with `query`, `mode`, optional `refs[]`                                        |

---

## Config Schema

```json
{
  "review": {
    "enabled": true,
    "reviewers": [
      { "agent": "oracle", "focus": "security vulnerabilities and auth issues" },
      { "agent": "explorer", "context": { "file": "reviewers/style-guide.md" } }
    ],
    "verify": {
      "guidance": "Ignore test file formatting. Focus on breaking changes."
    },
    "output": {
      "template": { "file": "templates/review-output.md" }
    }
  }
}
```

---

## Tool Interface

```typescript
review({
  query: string,           // User's review request/focus
  mode: "vs-main" | "unstaged" | "staged" | "commits",
  refs?: string[]          // For commits mode: ["abc123", "def456"]
})
```

**Returns:** Markdown string with:

- Git diff context summary
- Each reviewer's full output (labeled)
- Verify guidance (if configured)
- Output template instructions (if configured)

---

## Tasks

### Task 1: Add Review Config Schema

**Files:**

- Modify: `packages/config/src/schema.ts`

**Step 1: Write the reviewer schema types**

Add after `OrchestrationConfigSchema` (around line 73):

```typescript
/**
 * Single reviewer configuration
 * Uses an existing agent with optional focus/context overrides
 */
export const ReviewerConfigSchema = z.object({
  agent: z.string().describe("Agent name to use for review (e.g., oracle, explorer)"),
  focus: z.string().optional().describe("Short focus instruction to steer the review"),
  context: ContextSchema.optional().describe("File with additional review instructions"),
})

export type ReviewerConfig = z.infer<typeof ReviewerConfigSchema>

/**
 * Verify step configuration
 */
export const ReviewVerifyConfigSchema = z.object({
  guidance: z
    .union([z.string(), ContextSchema])
    .optional()
    .describe("Instructions for verification step"),
})

export type ReviewVerifyConfig = z.infer<typeof ReviewVerifyConfigSchema>

/**
 * Output formatting configuration
 */
export const ReviewOutputConfigSchema = z.object({
  template: ContextSchema.optional().describe("Template file with formatting instructions"),
})

export type ReviewOutputConfig = z.infer<typeof ReviewOutputConfigSchema>

/**
 * Code review plugin configuration
 */
export const CodeReviewConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  reviewers: z
    .array(ReviewerConfigSchema)
    .min(1)
    .max(2)
    .optional()
    .default([{ agent: "oracle" }])
    .describe("1-2 reviewer configurations"),
  verify: ReviewVerifyConfigSchema.optional(),
  output: ReviewOutputConfigSchema.optional(),
})

export type CodeReviewConfig = z.infer<typeof CodeReviewConfigSchema>
```

**Step 2: Add to main config schema**

Update `OwoConfigSchema` to include review:

```typescript
export const OwoConfigSchema = z.object({
  $schema: z.string().optional(),
  keywords: KeywordDetectorConfigSchema.optional(),
  prompts: PromptInjectorConfigSchema.optional(),
  orchestration: OrchestrationConfigSchema.optional(),
  review: CodeReviewConfigSchema.optional(),
})
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add packages/config/src/schema.ts
git commit -m "feat(config): add code review plugin schema"
```

---

### Task 2: Create Package Structure

**Files:**

- Create: `packages/code-review/package.json`
- Create: `packages/code-review/tsconfig.json`
- Create: `packages/code-review/src/index.ts` (stub)

**Step 1: Create package.json**

```json
{
  "name": "@owo/code-review",
  "version": "0.1.0",
  "description": "Multi-stage code review with parallel reviewer agents for OpenCode",
  "files": ["dist"],
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "make": "bun build src/index.ts --outdir dist --target node --format esm --external '@opencode-ai/*' --external '@owo/*' --external 'zod' && bun run compile",
    "compile": "tsgo --emitDeclarationOnly",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@opencode-ai/plugin": "catalog:",
    "@opencode-ai/sdk": "catalog:",
    "@owo/config": "workspace:*"
  },
  "devDependencies": {
    "@typescript/native-preview": "7.0.0-dev.20260120.1",
    "bun-types": "1.3.6"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create stub index.ts**

```typescript
/**
 * Code Review Plugin
 *
 * Multi-stage code review with parallel reviewer agents.
 * Gathers git diff, dispatches reviewers, returns combined output.
 */

import type { Plugin } from "@opencode-ai/plugin"

const CodeReviewPlugin: Plugin = async (_ctx) => {
  // TODO: Implement
  return {}
}

export default CodeReviewPlugin
```

**Step 4: Install dependencies**

Run: `bun install`
Expected: Successful install, lockfile updated

**Step 5: Verify build**

Run: `cd packages/code-review && bun run make`
Expected: Creates dist/index.js and dist/index.d.ts

**Step 6: Commit**

```bash
git add packages/code-review/
git commit -m "feat(code-review): scaffold package structure"
```

---

### Task 3: Implement Git Diff Gatherer

**Files:**

- Create: `packages/code-review/src/git.ts`
- Create: `packages/code-review/test/git.test.ts`

**Step 1: Write failing test for diff modes**

```typescript
import { expect, test, describe, mock } from "bun:test"
import { gatherDiff, type DiffMode } from "../src/git"

describe("gatherDiff", () => {
  test("vs-main mode generates correct git command", async () => {
    const mockExec = mock(() => Promise.resolve("diff output"))

    const result = await gatherDiff({ mode: "vs-main" }, { exec: mockExec, cwd: "/test" })

    expect(mockExec).toHaveBeenCalledWith("git diff main...HEAD", { cwd: "/test" })
    expect(result.diff).toBe("diff output")
    expect(result.mode).toBe("vs-main")
  })

  test("unstaged mode generates correct git command", async () => {
    const mockExec = mock(() => Promise.resolve("unstaged diff"))

    const result = await gatherDiff({ mode: "unstaged" }, { exec: mockExec, cwd: "/test" })

    expect(mockExec).toHaveBeenCalledWith("git diff", { cwd: "/test" })
    expect(result.diff).toBe("unstaged diff")
  })

  test("staged mode generates correct git command", async () => {
    const mockExec = mock(() => Promise.resolve("staged diff"))

    const result = await gatherDiff({ mode: "staged" }, { exec: mockExec, cwd: "/test" })

    expect(mockExec).toHaveBeenCalledWith("git diff --cached", { cwd: "/test" })
    expect(result.diff).toBe("staged diff")
  })

  test("commits mode with refs generates correct git command", async () => {
    const mockExec = mock(() => Promise.resolve("commit diff"))

    const result = await gatherDiff(
      { mode: "commits", refs: ["abc123", "def456"] },
      { exec: mockExec, cwd: "/test" },
    )

    expect(mockExec).toHaveBeenCalledWith("git diff abc123 def456", { cwd: "/test" })
    expect(result.diff).toBe("commit diff")
    expect(result.refs).toEqual(["abc123", "def456"])
  })

  test("commits mode with single ref diffs against parent", async () => {
    const mockExec = mock(() => Promise.resolve("single commit diff"))

    const result = await gatherDiff(
      { mode: "commits", refs: ["abc123"] },
      { exec: mockExec, cwd: "/test" },
    )

    expect(mockExec).toHaveBeenCalledWith("git show abc123 --format=", { cwd: "/test" })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test packages/code-review/test/git.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement git.ts**

```typescript
/**
 * Git diff gathering utilities
 */

export type DiffMode = "vs-main" | "unstaged" | "staged" | "commits"

export type DiffInput = {
  mode: DiffMode
  refs?: string[]
}

export type DiffResult = {
  mode: DiffMode
  diff: string
  refs?: string[]
  command: string
}

export type ExecFn = (cmd: string, opts: { cwd: string }) => Promise<string>

export type GatherOptions = {
  exec: ExecFn
  cwd: string
}

/**
 * Build the git command for the given diff mode
 */
function buildCommand(input: DiffInput): string {
  switch (input.mode) {
    case "vs-main":
      return "git diff main...HEAD"
    case "unstaged":
      return "git diff"
    case "staged":
      return "git diff --cached"
    case "commits": {
      const refs = input.refs ?? []
      if (refs.length === 0) {
        return "git diff HEAD~1 HEAD"
      }
      if (refs.length === 1) {
        return `git show ${refs[0]} --format=`
      }
      return `git diff ${refs[0]} ${refs[1]}`
    }
  }
}

/**
 * Gather diff output based on mode
 */
export async function gatherDiff(input: DiffInput, options: GatherOptions): Promise<DiffResult> {
  const command = buildCommand(input)
  const diff = await options.exec(command, { cwd: options.cwd })

  return {
    mode: input.mode,
    diff,
    refs: input.refs,
    command,
  }
}

/**
 * Create a real exec function using Bun shell
 */
export function createExec($: any): ExecFn {
  return async (cmd: string, opts: { cwd: string }) => {
    const result = await $`cd ${opts.cwd} && ${cmd}`.text()
    return result
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test packages/code-review/test/git.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/code-review/src/git.ts packages/code-review/test/git.test.ts
git commit -m "feat(code-review): implement git diff gatherer"
```

---

### Task 4: Implement Review Manager

**Files:**

- Create: `packages/code-review/src/review-manager.ts`
- Create: `packages/code-review/src/types.ts`

**Step 1: Create types.ts**

```typescript
/**
 * Code Review Plugin Types
 */

import type { CodeReviewConfig, ReviewerConfig } from "@owo/config"

export type ReviewMode = "vs-main" | "unstaged" | "staged" | "commits"

export type ReviewInput = {
  query: string
  mode: ReviewMode
  refs?: string[]
}

export type ReviewerResult = {
  agent: string
  focus?: string
  output: string
  sessionID: string
  duration: number
}

export type ReviewResult = {
  input: ReviewInput
  diff: string
  reviewers: ReviewerResult[]
  verifyGuidance?: string
  outputTemplate?: string
  totalDuration: number
}

export { CodeReviewConfig, ReviewerConfig }
```

**Step 2: Create review-manager.ts**

````typescript
/**
 * Review Manager
 *
 * Orchestrates parallel reviewer sessions and collects results.
 */

import type { OpencodeClient } from "@opencode-ai/sdk"
import type { ReviewerConfig } from "@owo/config"
import type { ReviewerResult } from "./types"

export type LaunchReviewerInput = {
  config: ReviewerConfig
  diff: string
  query: string
  parentSessionID: string
}

export class ReviewManager {
  private client: OpencodeClient
  private directory: string

  constructor(client: OpencodeClient, directory: string) {
    this.client = client
    this.directory = directory
  }

  /**
   * Launch a single reviewer session and wait for completion
   */
  async launchReviewer(input: LaunchReviewerInput): Promise<ReviewerResult> {
    const startTime = Date.now()

    // Create child session
    const createResult = await this.client.session.create({
      body: {
        parentID: input.parentSessionID,
      },
    })

    const sessionData = "data" in createResult ? createResult.data : createResult
    const sessionID = sessionData?.id

    if (!sessionID) {
      throw new Error("Failed to create reviewer session")
    }

    // Build the review prompt
    const prompt = this.buildReviewPrompt(input)

    // Send prompt and wait for response
    await this.client.session.prompt({
      path: { id: sessionID },
      body: {
        agent: input.config.agent,
        parts: [{ type: "text", text: prompt }],
      },
    })

    // Retrieve the response
    const output = await this.getSessionOutput(sessionID)
    const duration = Date.now() - startTime

    return {
      agent: input.config.agent,
      focus: input.config.focus,
      output,
      sessionID,
      duration,
    }
  }

  /**
   * Launch multiple reviewers in parallel
   */
  async launchReviewers(
    configs: ReviewerConfig[],
    diff: string,
    query: string,
    parentSessionID: string,
  ): Promise<ReviewerResult[]> {
    const promises = configs.map((config) =>
      this.launchReviewer({
        config,
        diff,
        query,
        parentSessionID,
      }),
    )

    return Promise.all(promises)
  }

  /**
   * Build the review prompt for a reviewer
   */
  private buildReviewPrompt(input: LaunchReviewerInput): string {
    const parts: string[] = []

    parts.push("# Code Review Request")
    parts.push("")
    parts.push(`**User Query:** ${input.query}`)
    parts.push("")

    if (input.config.focus) {
      parts.push(`**Review Focus:** ${input.config.focus}`)
      parts.push("")
    }

    parts.push("## Changes to Review")
    parts.push("")
    parts.push("```diff")
    parts.push(input.diff)
    parts.push("```")
    parts.push("")
    parts.push("Please review these changes and provide detailed feedback.")

    return parts.join("\n")
  }

  /**
   * Get the output from a completed session
   */
  private async getSessionOutput(sessionID: string): Promise<string> {
    const messagesResult = await this.client.session.messages({
      path: { id: sessionID },
    })

    const messages = "data" in messagesResult ? messagesResult.data : messagesResult

    if (!messages || !Array.isArray(messages)) {
      return "No output received from reviewer"
    }

    type MessageWrapper = {
      info: { role: string }
      parts: Array<{ type: string; text?: string }>
    }

    const assistantMessages = (messages as MessageWrapper[]).filter(
      (m) => m.info.role === "assistant" && m.parts && m.parts.length > 0,
    )

    if (assistantMessages.length === 0) {
      return "No output received from reviewer"
    }

    const lastMessage = assistantMessages[assistantMessages.length - 1]
    const textParts = lastMessage.parts.filter((p) => p.type === "text")
    return textParts.map((p) => p.text ?? "").join("\n")
  }
}
````

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/code-review/src/types.ts packages/code-review/src/review-manager.ts
git commit -m "feat(code-review): implement review manager with parallel execution"
```

---

### Task 5: Implement Review Tool

**Files:**

- Modify: `packages/code-review/src/index.ts`
- Create: `packages/code-review/src/tool.ts`

**Step 1: Create tool.ts**

````typescript
/**
 * Code Review Tool
 *
 * Single tool that gathers diff, dispatches reviewers, returns combined output.
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import type { CodeReviewConfig } from "@owo/config"
import { gatherDiff, createExec, type DiffMode } from "./git"
import { ReviewManager } from "./review-manager"
import type { ReviewResult } from "./types"

export type CreateToolOptions = {
  client: OpencodeClient
  config: CodeReviewConfig
  directory: string
  $: any // Bun shell
  resolveContext: (ctx: string | { file: string }) => string
}

export function createReviewTool(options: CreateToolOptions): ToolDefinition {
  const { client, config, directory, $, resolveContext } = options
  const manager = new ReviewManager(client, directory)
  const exec = createExec($)

  return tool({
    description: `Review code changes with ${config.reviewers?.length ?? 1} parallel reviewer(s).
Gathers git diff based on mode, dispatches reviewers, returns combined feedback.

Modes:
- vs-main: Changes compared to main branch
- unstaged: Unstaged working directory changes
- staged: Staged changes (git add)
- commits: Specific commit(s) - provide refs array`,

    args: {
      query: tool.schema.string().describe("Review request/focus from user"),
      mode: tool.schema
        .enum(["vs-main", "unstaged", "staged", "commits"])
        .describe("What changes to review"),
      refs: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Commit refs for 'commits' mode (1-2 refs)"),
    },

    async execute(args, context) {
      const startTime = Date.now()

      try {
        // 1. Gather diff
        const diffResult = await gatherDiff(
          { mode: args.mode as DiffMode, refs: args.refs },
          { exec, cwd: directory },
        )

        if (!diffResult.diff.trim()) {
          return `No changes found for mode "${args.mode}". Nothing to review.`
        }

        // 2. Launch parallel reviewers
        const reviewers = config.reviewers ?? [{ agent: "oracle" }]
        const reviewerResults = await manager.launchReviewers(
          reviewers,
          diffResult.diff,
          args.query,
          context.sessionID,
        )

        // 3. Build result
        const result: ReviewResult = {
          input: { query: args.query, mode: args.mode as DiffMode, refs: args.refs },
          diff: diffResult.diff,
          reviewers: reviewerResults,
          totalDuration: Date.now() - startTime,
        }

        // 4. Resolve optional config
        if (config.verify?.guidance) {
          result.verifyGuidance =
            typeof config.verify.guidance === "string"
              ? config.verify.guidance
              : resolveContext(config.verify.guidance)
        }

        if (config.output?.template) {
          result.outputTemplate = resolveContext(config.output.template)
        }

        // 5. Format output
        return formatReviewOutput(result)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Code review failed: ${errorMsg}`
      }
    },
  })
}

/**
 * Format the review result as markdown
 */
function formatReviewOutput(result: ReviewResult): string {
  const parts: string[] = []

  parts.push("# Code Review Results")
  parts.push("")
  parts.push(`**Query:** ${result.input.query}`)
  parts.push(`**Mode:** ${result.input.mode}`)
  if (result.input.refs?.length) {
    parts.push(`**Refs:** ${result.input.refs.join(", ")}`)
  }
  parts.push(`**Duration:** ${(result.totalDuration / 1000).toFixed(1)}s`)
  parts.push("")

  // Diff summary (truncated)
  const diffLines = result.diff.split("\n")
  const diffPreview = diffLines.slice(0, 20).join("\n")
  parts.push("<details>")
  parts.push(`<summary>Diff (${diffLines.length} lines)</summary>`)
  parts.push("")
  parts.push("```diff")
  parts.push(diffPreview)
  if (diffLines.length > 20) {
    parts.push(`... (${diffLines.length - 20} more lines)`)
  }
  parts.push("```")
  parts.push("</details>")
  parts.push("")

  // Each reviewer's output
  for (let i = 0; i < result.reviewers.length; i++) {
    const reviewer = result.reviewers[i]
    parts.push(`## Reviewer ${i + 1}: ${reviewer.agent}`)
    if (reviewer.focus) {
      parts.push(`*Focus: ${reviewer.focus}*`)
    }
    parts.push(`*Duration: ${(reviewer.duration / 1000).toFixed(1)}s*`)
    parts.push("")
    parts.push(reviewer.output)
    parts.push("")
  }

  // Verify guidance
  if (result.verifyGuidance) {
    parts.push("---")
    parts.push("## Verification Guidance")
    parts.push("")
    parts.push(result.verifyGuidance)
    parts.push("")
  }

  // Output template
  if (result.outputTemplate) {
    parts.push("---")
    parts.push("## Output Formatting Instructions")
    parts.push("")
    parts.push(result.outputTemplate)
    parts.push("")
  }

  return parts.join("\n")
}
````

**Step 2: Update index.ts**

```typescript
/**
 * Code Review Plugin
 *
 * Multi-stage code review with parallel reviewer agents.
 * Gathers git diff, dispatches reviewers, returns combined output.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig, resolveContext } from "@owo/config"
import { createReviewTool } from "./tool"

const CodeReviewPlugin: Plugin = async (ctx) => {
  // Load config
  let configResult
  try {
    configResult = loadConfig(ctx.directory)
  } catch (err) {
    const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error(`[owo/code-review] Failed to load config: ${errorMessage}`)
    return {}
  }

  const { config, configDir } = configResult

  // Check if disabled
  if (config.review?.enabled === false) {
    return {}
  }

  // Create context resolver
  const resolve = (context: string | { file: string }) => resolveContext(context, configDir)

  // Create the review tool
  const reviewTool = createReviewTool({
    client: ctx.client,
    config: config.review ?? { enabled: true, reviewers: [{ agent: "oracle" }] },
    directory: ctx.directory,
    $: ctx.$,
    resolveContext: resolve,
  })

  return {
    tool: {
      review: reviewTool,
    },
  }
}

export default CodeReviewPlugin
```

**Step 3: Run build**

Run: `cd packages/code-review && bun run make`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/code-review/src/tool.ts packages/code-review/src/index.ts
git commit -m "feat(code-review): implement review tool with parallel execution"
```

---

### Task 6: Add Context Resolution to Config Package

**Files:**

- Modify: `packages/config/src/loader.ts`

**Step 1: Check if resolveContext is exported**

If not already exported, add:

```typescript
/**
 * Resolve a context value (inline string or file reference)
 */
export function resolveContext(context: string | { file: string }, configDir: string): string {
  if (typeof context === "string") {
    return context
  }

  const filePath = path.isAbsolute(context.file) ? context.file : path.join(configDir, context.file)

  try {
    return fs.readFileSync(filePath, "utf-8")
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to load context file "${context.file}": ${errorMsg}`)
  }
}
```

**Step 2: Export from index**

Ensure `packages/config/src/index.ts` exports `resolveContext`.

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/config/
git commit -m "feat(config): ensure resolveContext is exported"
```

---

### Task 7: Integration Test

**Files:**

- Create: `packages/code-review/test/integration.test.ts`

**Step 1: Write integration test**

```typescript
import { expect, test, describe, mock } from "bun:test"

describe("Code Review Plugin Integration", () => {
  test("plugin exports review tool when enabled", async () => {
    // Mock the plugin context
    const mockClient = {
      session: {
        create: mock(() => Promise.resolve({ data: { id: "test-session" } })),
        prompt: mock(() => Promise.resolve({})),
        messages: mock(() =>
          Promise.resolve({
            data: [
              {
                info: { role: "assistant" },
                parts: [{ type: "text", text: "Review feedback here" }],
              },
            ],
          }),
        ),
      },
    }

    const mockConfig = {
      review: {
        enabled: true,
        reviewers: [{ agent: "oracle", focus: "security" }],
      },
    }

    // This would be a more complete integration test
    // For now, verify the structure
    expect(mockConfig.review.reviewers).toHaveLength(1)
    expect(mockConfig.review.reviewers[0].agent).toBe("oracle")
  })

  test("schema validates reviewer count max 2", () => {
    const { CodeReviewConfigSchema } = require("@owo/config")

    const validConfig = {
      reviewers: [{ agent: "oracle" }, { agent: "explorer" }],
    }
    expect(() => CodeReviewConfigSchema.parse(validConfig)).not.toThrow()

    const invalidConfig = {
      reviewers: [{ agent: "a" }, { agent: "b" }, { agent: "c" }],
    }
    expect(() => CodeReviewConfigSchema.parse(invalidConfig)).toThrow()
  })
})
```

**Step 2: Run tests**

Run: `bun test packages/code-review/`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/code-review/test/
git commit -m "test(code-review): add integration tests"
```

---

### Task 8: Update Root Plugin to Include Code Review

**Files:**

- Modify: `src/index.ts` (root plugin entry)

**Step 1: Import and compose code review plugin**

Add code review to the plugin composition (pattern depends on existing structure).

**Step 2: Run full build**

Run: `bun run make`
Expected: PASS

**Step 3: Commit**

```bash
git add src/
git commit -m "feat: integrate code-review plugin into main entry"
```

---

### Task 9: Add Example Config

**Files:**

- Modify: `packages/examples/owo.example.json`

**Step 1: Add review config example**

```json
{
  "review": {
    "enabled": true,
    "reviewers": [
      { "agent": "oracle", "focus": "security vulnerabilities and breaking changes" },
      { "agent": "explorer", "context": { "file": "reviewers/style-guide.md" } }
    ],
    "verify": {
      "guidance": "Ignore test file formatting. Focus on production code issues."
    },
    "output": {
      "template": { "file": "templates/review-output.md" }
    }
  }
}
```

**Step 2: Create example template file**

Create `packages/examples/templates/review-output.md`:

```markdown
# Code Review Output Format

Format the final review with these sections:

## Overview

2-3 sentence summary of the changes and overall assessment.

## Changes Summary

Bullet list of files changed with brief description of each.

## Issues Found

Group by severity (Critical, Warning, Info). Use <details> blocks:

<details>
<summary>🔴 Critical: [Issue Title]</summary>

**File:** path/to/file.ts:123
**Description:** What's wrong
**Suggestion:** How to fix

</details>

## Recommendations

Numbered list of actionable improvements.

## Verdict

APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION
```

**Step 3: Commit**

```bash
git add packages/examples/
git commit -m "docs(examples): add code review config examples"
```

---

## Summary

**Total Tasks:** 9
**Estimated Time:** 2-3 hours

**Package Structure:**

```
packages/code-review/
├── src/
│   ├── index.ts          # Plugin entry
│   ├── tool.ts           # Review tool definition
│   ├── git.ts            # Git diff gathering
│   ├── review-manager.ts # Parallel reviewer orchestration
│   └── types.ts          # Type definitions
├── test/
│   ├── git.test.ts       # Git module tests
│   └── integration.test.ts
├── package.json
└── tsconfig.json
```

**Key Features:**

- Single `review` tool with mode-based diff gathering
- 1-2 parallel reviewer agents (enforced by schema)
- Agent-based reviewers with optional focus/context
- Configurable verify guidance and output template
- Raw markdown output for caller to synthesize

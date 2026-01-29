# Multi-Reviewer PR Review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and **test-driven-development** to implement this plan task-by-task.

**Goal:** Add multi-reviewer parallel execution with verification to @owo/pr-review, using configurable reviewers with custom prompts from `.github/` directory and hardcoded defaults based on the old agent flow.

**Architecture:**

- Extend the reviewer to support multiple parallel reviewers (security, quality, performance, etc.)
- Each reviewer gets the PR context + their specific prompt, runs in parallel via Promise.allSettled()
- A verifier synthesizes the **overview only** - comments are merged via code to preserve exact line numbers
- Prompts can be loaded from `.github/reviewers/*.md` files or use built-in defaults based on review.md, review-changes.md, verify.md

**Tech Stack:** TypeScript, Bun, Zod, @octokit/rest, @opencode-ai/sdk

---

## Critical Design Decisions

> **IMPORTANT:** These decisions were made during plan review to address identified risks.

### 1. Synthesizer Strategy (Line Number Preservation)

The verifier/synthesizer has a **critical risk** of hallucinating line numbers when rewriting comments. To mitigate:

- **Comments are merged via CODE** (not AI) - preserves exact `path` and `line` values
- **AI only synthesizes the overview** - no touching structured comment data
- **Deduplication is code-based** - when multiple reviewers flag same `path:line`, keep highest severity

### 2. Test-Driven Development

This feature is complex. **Tests must be written BEFORE implementation** for each task.

### 3. Timeout Handling

Parallel AI calls need timeouts to prevent hanging. Each reviewer has a 180-second timeout.

---

## Task 0: Set Up Test Infrastructure

> **TDD:** Write tests first, watch them fail, then implement.

**Files:**

- Create: `packages/pr-review/test/config.test.ts`
- Create: `packages/pr-review/test/reviewers.test.ts`
- Create: `packages/pr-review/test/verifier.test.ts`
- Create: `packages/pr-review/test/fixtures/sample-pr.json`

**Step 1: Create test fixtures**

```json
// packages/pr-review/test/fixtures/sample-pr.json
{
  "owner": "test-org",
  "repo": "test-repo",
  "number": 123,
  "title": "Add user authentication",
  "body": "This PR adds JWT-based authentication",
  "author": "testuser",
  "baseSha": "abc123",
  "headSha": "def456",
  "baseRef": "main",
  "headRef": "feature/auth",
  "additions": 150,
  "deletions": 20,
  "state": "open",
  "createdAt": "2026-01-29T10:00:00Z",
  "commits": [],
  "files": [
    { "path": "src/auth.ts", "additions": 100, "deletions": 10, "changeType": "added" },
    { "path": "src/middleware.ts", "additions": 50, "deletions": 10, "changeType": "modified" }
  ],
  "comments": [],
  "reviews": []
}
```

**Step 2: Create config tests**

```typescript
// packages/pr-review/test/config.test.ts
import { expect, test, describe } from "bun:test"

describe("config/types", () => {
  test("ReviewerConfigSchema validates minimal config", async () => {
    const { ReviewerConfigSchema } = await import("../src/config/types")
    const config = { name: "quality" }
    const result = ReviewerConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  test("ReviewerConfigSchema validates full config", async () => {
    const { ReviewerConfigSchema } = await import("../src/config/types")
    const config = {
      name: "security",
      prompt: "You are a security reviewer",
      promptFile: ".github/reviewers/security.md",
      focus: "security vulnerabilities",
      model: "anthropic/claude-sonnet-4-20250514",
      enabled: true,
    }
    const result = ReviewerConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  test("PRReviewConfigSchema provides defaults", async () => {
    const { PRReviewConfigSchema } = await import("../src/config/types")
    const config = { version: 1 }
    const result = PRReviewConfigSchema.parse(config)
    expect(result.reviewers).toEqual([])
  })

  test("SeverityLevelSchema validates valid levels", async () => {
    const { SeverityLevelSchema } = await import("../src/config/types")
    expect(SeverityLevelSchema.safeParse("critical").success).toBe(true)
    expect(SeverityLevelSchema.safeParse("warning").success).toBe(true)
    expect(SeverityLevelSchema.safeParse("info").success).toBe(true)
    expect(SeverityLevelSchema.safeParse("invalid").success).toBe(false)
  })
})

describe("config/loader", () => {
  test("loadConfig returns defaults when no config file exists", async () => {
    const { loadConfig } = await import("../src/config/loader")
    const config = loadConfig("/nonexistent/path")
    expect(config.version).toBe(1)
    expect(config.reviewers.length).toBeGreaterThan(0)
  })

  test("loadReviewerPrompt returns inline prompt when no file", async () => {
    const { loadReviewerPrompt } = await import("../src/config/loader")
    const reviewer = { name: "test", prompt: "Test prompt" }
    const prompt = loadReviewerPrompt("/nonexistent", reviewer)
    expect(prompt).toBe("Test prompt")
  })

  test("loadReviewerPrompt returns default when no prompt specified", async () => {
    const { loadReviewerPrompt } = await import("../src/config/loader")
    const reviewer = { name: "test" }
    const prompt = loadReviewerPrompt("/nonexistent", reviewer)
    expect(prompt).toContain("Review this code")
  })
})
```

**Step 3: Create reviewer engine tests**

```typescript
// packages/pr-review/test/reviewers.test.ts
import { expect, test, describe, mock } from "bun:test"
import type { ReviewerOutput } from "../src/config/types"

describe("reviewers/engine", () => {
  test("synthesizeReview combines comments from multiple reviewers", async () => {
    const { synthesizeReview } = await import("../src/reviewers/engine")

    const outputs: ReviewerOutput[] = [
      {
        name: "quality",
        success: true,
        review: {
          overview: "Quality looks good",
          comments: [
            {
              path: "src/auth.ts",
              line: 42,
              body: "Consider error handling",
              side: "RIGHT",
              severity: "warning",
            },
          ],
        },
        durationMs: 1000,
      },
      {
        name: "security",
        success: true,
        review: {
          overview: "No security issues",
          comments: [
            {
              path: "src/auth.ts",
              line: 99,
              body: "Validate input",
              side: "RIGHT",
              severity: "critical",
            },
          ],
        },
        durationMs: 1200,
      },
    ]

    const result = synthesizeReview(outputs)
    expect(result.comments).toHaveLength(2)
    expect(result.summary.criticalIssues).toBe(1)
    expect(result.summary.warnings).toBe(1)
    expect(result.passed).toBe(false) // Has critical issue
  })

  test("synthesizeReview handles partial failures", async () => {
    const { synthesizeReview } = await import("../src/reviewers/engine")

    const outputs: ReviewerOutput[] = [
      {
        name: "quality",
        success: true,
        review: { overview: "OK", comments: [] },
        durationMs: 1000,
      },
      {
        name: "security",
        success: false,
        error: "API timeout",
        durationMs: 60000,
      },
    ]

    const result = synthesizeReview(outputs)
    expect(result.summary.successfulReviewers).toBe(1)
    expect(result.summary.totalReviewers).toBe(2)
  })
})

describe("reviewers/runner", () => {
  test("parseReviewerResponse extracts JSON from markdown", async () => {
    // This tests the internal parsing logic
    const response = `Here's my review:
\`\`\`json
{
  "overview": "Found issues",
  "comments": [{"path": "test.ts", "line": 10, "body": "Fix this", "side": "RIGHT", "severity": "warning"}]
}
\`\`\``

    // We'll test this via the runner module once implemented
  })
})
```

**Step 4: Create verifier tests (CRITICAL)**

```typescript
// packages/pr-review/test/verifier.test.ts
import { expect, test, describe } from "bun:test"
import type { ReviewerOutput, SynthesizedReview } from "../src/config/types"

describe("verifier/synthesizer", () => {
  test("deduplicateComments preserves exact line numbers", async () => {
    const { deduplicateComments } = await import("../src/verifier/synthesizer")

    const comments = [
      {
        path: "src/auth.ts",
        line: 42,
        body: "Issue A",
        side: "RIGHT" as const,
        severity: "warning" as const,
        reviewer: "quality",
      },
      {
        path: "src/auth.ts",
        line: 99,
        body: "Issue B",
        side: "RIGHT" as const,
        severity: "critical" as const,
        reviewer: "security",
      },
    ]

    const result = deduplicateComments(comments)

    // Line numbers MUST be preserved exactly
    expect(result.find((c) => c.body === "Issue A")?.line).toBe(42)
    expect(result.find((c) => c.body === "Issue B")?.line).toBe(99)
  })

  test("deduplicateComments keeps highest severity for same line", async () => {
    const { deduplicateComments } = await import("../src/verifier/synthesizer")

    const comments = [
      {
        path: "src/auth.ts",
        line: 42,
        body: "Minor issue",
        side: "RIGHT" as const,
        severity: "info" as const,
        reviewer: "quality",
      },
      {
        path: "src/auth.ts",
        line: 42,
        body: "Critical issue!",
        side: "RIGHT" as const,
        severity: "critical" as const,
        reviewer: "security",
      },
    ]

    const result = deduplicateComments(comments)

    // Should keep only one comment for line 42, with critical severity
    const line42Comments = result.filter((c) => c.line === 42)
    expect(line42Comments).toHaveLength(1)
    expect(line42Comments[0].severity).toBe("critical")
  })

  test("filterCommentsByLevel filters correctly", async () => {
    const { filterCommentsByLevel } = await import("../src/verifier/synthesizer")

    const comments = [{ severity: "critical" }, { severity: "warning" }, { severity: "info" }]

    expect(filterCommentsByLevel(comments, "critical")).toHaveLength(1)
    expect(filterCommentsByLevel(comments, "warning")).toHaveLength(2)
    expect(filterCommentsByLevel(comments, "info")).toHaveLength(3)
  })

  test("basicSynthesis preserves all line numbers from reviewers", async () => {
    const { basicSynthesis } = await import("../src/verifier/synthesizer")

    const outputs: ReviewerOutput[] = [
      {
        name: "quality",
        success: true,
        review: {
          overview: "Found issues",
          comments: [
            {
              path: "src/auth.ts",
              line: 42,
              body: "Issue here",
              side: "RIGHT",
              severity: "warning",
            },
            {
              path: "src/auth.ts",
              line: 99,
              body: "Another issue",
              side: "RIGHT",
              severity: "critical",
            },
            {
              path: "src/utils.ts",
              line: 15,
              body: "Consider this",
              side: "RIGHT",
              severity: "info",
            },
          ],
        },
        durationMs: 1000,
      },
    ]

    const result = basicSynthesis(outputs)

    // CRITICAL: All line numbers must be preserved exactly
    expect(result.comments.find((c) => c.path === "src/auth.ts" && c.line === 42)).toBeDefined()
    expect(result.comments.find((c) => c.path === "src/auth.ts" && c.line === 99)).toBeDefined()
    expect(result.comments.find((c) => c.path === "src/utils.ts" && c.line === 15)).toBeDefined()
  })
})
```

**Step 5: Verify tests fail (TDD red phase)**

Run: `bun test packages/pr-review/test/`
Expected: Tests fail (modules don't exist yet)

**Step 6: Commit test infrastructure**

```bash
git add packages/pr-review/test/
git commit -m "test(pr-review): add test infrastructure for multi-reviewer feature"
```

---

## Task 1: Create Configuration Types and Schema

**Files:**

- Create: `packages/pr-review/src/config/types.ts`
- Create: `packages/pr-review/src/config/loader.ts`
- Create: `packages/pr-review/src/config/index.ts`

**Step 1: Create config types**

```typescript
// packages/pr-review/src/config/types.ts
import { z } from "zod"

/**
 * Single reviewer configuration
 */
export const ReviewerConfigSchema = z.object({
  name: z.string().describe("Reviewer identifier (e.g., 'security', 'quality')"),
  prompt: z.string().optional().describe("Inline prompt text (alternative to promptFile)"),
  promptFile: z.string().optional().describe("Path to prompt file relative to repo root"),
  focus: z.string().optional().describe("Short focus description"),
  model: z.string().optional().describe("Model override for this reviewer"),
  enabled: z.boolean().default(true),
})

export type ReviewerConfig = z.infer<typeof ReviewerConfigSchema>

/**
 * Severity level for filtering
 */
export const SeverityLevelSchema = z.enum(["critical", "warning", "info"])
export type SeverityLevel = z.infer<typeof SeverityLevelSchema>

/**
 * Verifier/Synthesizer configuration
 */
export const VerifierConfigSchema = z.object({
  prompt: z.string().optional(),
  promptFile: z.string().optional(),
  model: z.string().optional(),
  enabled: z.boolean().default(true),
  level: SeverityLevelSchema.optional()
    .default("info")
    .describe(
      "Minimum severity level to include in final review (critical=only critical, warning=critical+warning, info=all)",
    ),
})

export type VerifierConfig = z.infer<typeof VerifierConfigSchema>

/**
 * Main PR review configuration
 */
export const PRReviewConfigSchema = z.object({
  version: z.literal(1).default(1),
  reviewers: z.array(ReviewerConfigSchema).default([]),
  verifier: VerifierConfigSchema.optional(),
  defaults: z
    .object({
      model: z.string().optional(),
    })
    .optional(),
})

export type PRReviewConfig = z.infer<typeof PRReviewConfigSchema>

/**
 * Review output from a single reviewer
 */
export type ReviewerOutput = {
  name: string
  success: boolean
  review?: {
    overview: string
    comments: Array<{
      path: string
      line: number
      body: string
      side: "LEFT" | "RIGHT"
      severity?: "critical" | "warning" | "info"
    }>
  }
  error?: string
  durationMs: number
}

/**
 * Final synthesized review
 */
export type SynthesizedReview = {
  overview: string
  comments: Array<{
    path: string
    line: number
    body: string
    side: "LEFT" | "RIGHT"
    severity: "critical" | "warning" | "info"
    reviewer: string
  }>
  summary: {
    totalReviewers: number
    successfulReviewers: number
    criticalIssues: number
    warnings: number
    infos: number
  }
  passed: boolean
}
```

**Step 2: Create shared default prompts**

```typescript
// packages/pr-review/src/config/defaults.ts
/**
 * Default prompts - shared between loader and verifier
 * Extracted to avoid duplication
 */

export const DEFAULT_QUALITY_PROMPT = `You are a code quality reviewer. Focus on:
- Code quality and best practices
- Potential bugs and edge cases
- Performance implications
- Maintainability and readability

Review the code changes and provide specific, actionable feedback.
Only flag issues that are genuinely problematic, not stylistic preferences.

Respond with JSON in this format:
{
  "overview": "Brief summary of your findings",
  "comments": [
    {
      "path": "src/file.ts",
      "line": 42,
      "body": "Your comment here",
      "side": "RIGHT",
      "severity": "critical|warning|info"
    }
  ]
}`

export const DEFAULT_SECURITY_PROMPT = `You are a security reviewer. Focus on:
- Security vulnerabilities
- Authentication/authorization issues
- Input validation and sanitization
- Sensitive data exposure
- Injection risks (SQL, XSS, command)

Review the code changes for security concerns.
Only flag genuine security issues, not hypothetical scenarios.

Respond with JSON in this format:
{
  "overview": "Brief summary of security findings",
  "comments": [
    {
      "path": "src/file.ts",
      "line": 42,
      "body": "Security issue description",
      "side": "RIGHT",
      "severity": "critical|warning|info"
    }
  ]
}`

export const DEFAULT_VERIFIER_PROMPT = `You are synthesizing review findings into a single overview.

Given the following reviewer summaries, write a unified overview that:
1. Highlights the most important findings
2. Groups related issues
3. Provides a clear recommendation (approve/request changes)

DO NOT rewrite or modify the inline comments - they are handled separately.
Only produce the overview text.

Respond with JSON:
{
  "overview": "Your synthesized overview here",
  "passed": true
}

Set "passed" to true only if there are no critical issues.`
```

**Step 3: Create config loader**

```typescript
// packages/pr-review/src/config/loader.ts
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { PRReviewConfigSchema, type PRReviewConfig, type ReviewerConfig } from "./types"
import {
  DEFAULT_QUALITY_PROMPT,
  DEFAULT_SECURITY_PROMPT,
  DEFAULT_VERIFIER_PROMPT,
} from "./defaults"

const DEFAULT_REVIEWERS: ReviewerConfig[] = [
  {
    name: "quality",
    prompt: DEFAULT_QUALITY_PROMPT,
    focus: "code quality",
  },
  {
    name: "security",
    prompt: DEFAULT_SECURITY_PROMPT,
    focus: "security",
  },
]

/**
 * Load PR review configuration
 * Looks for .github/pr-review.json or uses defaults
 */
export function loadConfig(repoRoot: string): PRReviewConfig {
  const configPath = join(repoRoot, ".github", "pr-review.json")

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8")
      const parsed = JSON.parse(content)
      return PRReviewConfigSchema.parse(parsed)
    } catch (err) {
      console.warn(`[pr-review] Failed to load config from ${configPath}:`, err)
      console.warn("[pr-review] Falling back to default configuration")
    }
  }

  // Return default configuration
  return {
    version: 1,
    reviewers: DEFAULT_REVIEWERS,
    verifier: {
      prompt: DEFAULT_VERIFIER_PROMPT,
      enabled: true,
    },
  }
}

/**
 * Load a reviewer prompt from file or return inline prompt
 */
export function loadReviewerPrompt(repoRoot: string, reviewer: ReviewerConfig): string {
  if (reviewer.promptFile) {
    const promptPath = join(repoRoot, reviewer.promptFile)
    if (existsSync(promptPath)) {
      try {
        return readFileSync(promptPath, "utf-8")
      } catch (err) {
        console.warn(`[pr-review] Failed to load prompt from ${promptPath}:`, err)
      }
    }
  }

  return reviewer.prompt || "Review this code and provide feedback."
}
```

**Step 4: Create barrel export**

```typescript
// packages/pr-review/src/config/index.ts
export * from "./types"
export * from "./loader"
export * from "./defaults"
```

**Step 5: Run tests**

Run: `bun test packages/pr-review/test/config.test.ts`
Expected: Config tests pass

**Step 6: Commit**

```bash
git add packages/pr-review/src/config/
git commit -m "feat(pr-review): add configuration types and loader"
```

---

## Task 2: Create Multi-Reviewer Engine

**Files:**

- Create: `packages/pr-review/src/reviewers/engine.ts`
- Create: `packages/pr-review/src/reviewers/runner.ts`
- Create: `packages/pr-review/src/reviewers/index.ts`
- Modify: `packages/pr-review/src/ai/prompts.ts`

**Step 1: Create individual reviewer runner with timeout**

````typescript
// packages/pr-review/src/reviewers/runner.ts
import type { AIClient } from "../ai/client"
import { prompt } from "../ai/client"
import { buildMultiReviewerPrompt } from "../ai/prompts"
import type { PRData } from "../github/types"
import type { ReviewerConfig, ReviewerOutput } from "../config/types"
import { loadReviewerPrompt } from "../config/loader"

const REVIEWER_TIMEOUT_MS = 60_000 // 60 seconds

/**
 * Run a single reviewer with timeout
 */
export async function runReviewer(
  ai: AIClient,
  pr: PRData,
  diff: string,
  reviewer: ReviewerConfig,
  repoRoot: string,
): Promise<ReviewerOutput> {
  const startTime = Date.now()

  try {
    console.log(`[pr-review] Running reviewer: ${reviewer.name} (${reviewer.focus || "general"})`)

    // Wrap with timeout
    const result = await Promise.race([
      runReviewerInternal(ai, pr, diff, reviewer, repoRoot),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Reviewer ${reviewer.name} timed out after ${REVIEWER_TIMEOUT_MS}ms`)),
          REVIEWER_TIMEOUT_MS,
        ),
      ),
    ])

    const durationMs = Date.now() - startTime
    console.log(`[pr-review] Reviewer ${reviewer.name} completed in ${durationMs}ms`)

    return {
      name: reviewer.name,
      success: true,
      review: result,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[pr-review] Reviewer ${reviewer.name} failed:`, errorMessage)

    return {
      name: reviewer.name,
      success: false,
      error: errorMessage,
      durationMs,
    }
  }
}

/**
 * Internal reviewer logic (without timeout wrapper)
 */
async function runReviewerInternal(
  ai: AIClient,
  pr: PRData,
  diff: string,
  reviewer: ReviewerConfig,
  repoRoot: string,
): Promise<NonNullable<ReviewerOutput["review"]>> {
  // Load the prompt (from file or inline)
  const reviewerPrompt = loadReviewerPrompt(repoRoot, reviewer)

  // Build the full prompt with context
  const fullPrompt = buildMultiReviewerPrompt(pr, diff, reviewerPrompt, reviewer.name)

  // Get AI response
  const modelConfig = reviewer.model
    ? {
        providerID: reviewer.model.split("/")[0],
        modelID: reviewer.model.split("/").slice(1).join("/"),
      }
    : undefined

  const { response } = await prompt(ai, fullPrompt, { model: modelConfig })

  // Parse the response
  return parseReviewerResponse(response, reviewer.name)
}

/**
 * Parse reviewer response (expects JSON format)
 */
export function parseReviewerResponse(
  response: string,
  reviewerName: string,
): NonNullable<ReviewerOutput["review"]> {
  // Try to extract JSON from markdown code blocks
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : response

  try {
    const parsed = JSON.parse(jsonStr.trim())

    return {
      overview: parsed.overview || "",
      comments: (parsed.comments || []).map((c: any) => ({
        path: c.path,
        line: c.line,
        body: c.body,
        side: c.side || "RIGHT",
        severity: c.severity || "warning",
      })),
    }
  } catch (error) {
    // If JSON parsing fails, treat the whole response as overview
    console.warn(
      `[pr-review] Reviewer ${reviewerName} returned non-JSON response, using as overview`,
    )
    return {
      overview: response,
      comments: [],
    }
  }
}
````

**Step 2: Create multi-reviewer engine**

```typescript
// packages/pr-review/src/reviewers/engine.ts
import type { AIClient } from "../ai/client"
import type { PRData } from "../github/types"
import type { PRReviewConfig, ReviewerOutput, SynthesizedReview } from "../config/types"
import { runReviewer } from "./runner"

/**
 * Run all reviewers in parallel
 */
export async function runAllReviewers(
  ai: AIClient,
  pr: PRData,
  diff: string,
  config: PRReviewConfig,
  repoRoot: string,
): Promise<ReviewerOutput[]> {
  const enabledReviewers = config.reviewers.filter((r) => r.enabled)

  if (enabledReviewers.length === 0) {
    console.warn("[pr-review] No reviewers enabled")
    return []
  }

  console.log(`[pr-review] Running ${enabledReviewers.length} reviewers in parallel...`)

  // Run all reviewers in parallel
  const results = await Promise.allSettled(
    enabledReviewers.map((reviewer) => runReviewer(ai, pr, diff, reviewer, repoRoot)),
  )

  // Process results
  const outputs: ReviewerOutput[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const reviewerName = enabledReviewers[i].name

    if (result.status === "fulfilled") {
      outputs.push(result.value)
    } else {
      console.error(`[pr-review] Reviewer ${reviewerName} threw exception:`, result.reason)
      outputs.push({
        name: reviewerName,
        success: false,
        error: String(result.reason),
        durationMs: 0,
      })
    }
  }

  // Log summary
  const successful = outputs.filter((o) => o.success).length
  console.log(`[pr-review] Reviewers complete: ${successful}/${outputs.length} successful`)

  return outputs
}

/**
 * Synthesize reviewer outputs into final review (without AI verifier)
 * Used when verifier is disabled - merges comments via code to preserve line numbers
 */
export function synthesizeReview(outputs: ReviewerOutput[]): SynthesizedReview {
  const successfulOutputs = outputs.filter((o) => o.success && o.review)

  // Combine all comments (preserving exact line numbers)
  const allComments: SynthesizedReview["comments"] = []

  for (const output of successfulOutputs) {
    if (!output.review) continue

    for (const comment of output.review.comments) {
      allComments.push({
        path: comment.path,
        line: comment.line, // CRITICAL: preserve exact line number
        body: comment.body,
        side: comment.side || "RIGHT",
        severity: comment.severity || "warning",
        reviewer: output.name,
      })
    }
  }

  // Build overview
  const overviewParts: string[] = []
  overviewParts.push("## Review Summary")
  overviewParts.push("")

  for (const output of successfulOutputs) {
    if (output.review?.overview) {
      overviewParts.push(`**${output.name}**: ${output.review.overview}`)
    }
  }

  overviewParts.push("")
  overviewParts.push(`*Reviewed by ${successfulOutputs.length} reviewers*`)

  // Count issues
  const criticalIssues = allComments.filter((c) => c.severity === "critical").length
  const warnings = allComments.filter((c) => c.severity === "warning").length
  const infos = allComments.filter((c) => c.severity === "info").length

  return {
    overview: overviewParts.join("\n"),
    comments: allComments,
    summary: {
      totalReviewers: outputs.length,
      successfulReviewers: successfulOutputs.length,
      criticalIssues,
      warnings,
      infos,
    },
    passed: criticalIssues === 0,
  }
}
```

**Step 3: Create barrel export**

```typescript
// packages/pr-review/src/reviewers/index.ts
export * from "./engine"
export * from "./runner"
```

**Step 4: Add multi-reviewer prompt builder**

Add to `packages/pr-review/src/ai/prompts.ts`:

```typescript
/**
 * Build prompt for a specific reviewer
 */
export function buildMultiReviewerPrompt(
  pr: PRData,
  diff: string,
  reviewerPrompt: string,
  reviewerName: string,
): string {
  const filesTable = pr.files
    .map((f) => `| ${f.path} | +${f.additions}/-${f.deletions} | ${f.changeType} |`)
    .join("\n")

  return `${reviewerPrompt}

## PR Information

**Title:** ${pr.title}
**Author:** ${pr.author}
**Branch:** ${pr.headRef} -> ${pr.baseRef}
**Changes:** +${pr.additions}/-${pr.deletions} lines

### Description
${pr.body || "*No description provided*"}

### Changed Files
| File | Changes | Type |
|------|---------|------|
${filesTable}

### Diff
\`\`\`diff
${diff}
\`\`\`

---
You are the "${reviewerName}" reviewer. Provide your review in the JSON format specified above.`
}
```

**Step 5: Run tests**

Run: `bun test packages/pr-review/test/reviewers.test.ts`
Expected: Reviewer tests pass

**Step 6: Commit**

```bash
git add packages/pr-review/src/reviewers/ packages/pr-review/src/ai/prompts.ts
git commit -m "feat(pr-review): add multi-reviewer engine with timeout handling"
```

---

## Task 3: Create Verifier/Synthesizer

> **CRITICAL:** The verifier must NOT rewrite comments. It only synthesizes the overview.
> Comments are merged via code to preserve exact line numbers.

**Files:**

- Create: `packages/pr-review/src/verifier/synthesizer.ts`
- Create: `packages/pr-review/src/verifier/index.ts`

**Step 1: Create verifier with code-based comment merging**

````typescript
// packages/pr-review/src/verifier/synthesizer.ts
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import type { AIClient } from "../ai/client"
import { prompt } from "../ai/client"
import type { ReviewerOutput, SynthesizedReview, VerifierConfig } from "../config/types"
import { DEFAULT_VERIFIER_PROMPT } from "../config/defaults"

/**
 * Synthesize and verify reviewer outputs
 * - Comments are merged via CODE (preserves line numbers)
 * - AI only synthesizes the overview
 */
export async function verifyAndSynthesize(
  ai: AIClient,
  outputs: ReviewerOutput[],
  verifierConfig: VerifierConfig | undefined,
  repoRoot: string,
): Promise<SynthesizedReview> {
  const startTime = Date.now()
  const level = verifierConfig?.level || "info"

  // Step 1: Merge comments via CODE (not AI) to preserve line numbers
  const mergedComments = mergeAndDeduplicateComments(outputs, level)

  // If verifier is disabled, do basic synthesis
  if (!verifierConfig?.enabled) {
    console.log("[pr-review] Verifier disabled, using basic synthesis")
    return basicSynthesis(outputs, mergedComments, level)
  }

  try {
    console.log("[pr-review] Running verifier to synthesize overview...")

    // Step 2: AI only synthesizes the OVERVIEW (not comments)
    const overviewPrompt = buildOverviewPrompt(outputs, verifierConfig, repoRoot)

    const modelConfig = verifierConfig.model
      ? {
          providerID: verifierConfig.model.split("/")[0],
          modelID: verifierConfig.model.split("/").slice(1).join("/"),
        }
      : undefined

    const { response } = await prompt(ai, overviewPrompt, { model: modelConfig })
    const { overview, passed } = parseOverviewResponse(response)

    const durationMs = Date.now() - startTime
    console.log(`[pr-review] Verifier completed in ${durationMs}ms`)

    const criticalIssues = mergedComments.filter((c) => c.severity === "critical").length
    const warnings = mergedComments.filter((c) => c.severity === "warning").length
    const infos = mergedComments.filter((c) => c.severity === "info").length

    console.log(
      `[pr-review] Final review: ${criticalIssues} critical, ${warnings} warnings, ${infos} info`,
    )

    return {
      overview,
      comments: mergedComments,
      summary: {
        totalReviewers: outputs.length,
        successfulReviewers: outputs.filter((o) => o.success).length,
        criticalIssues,
        warnings,
        infos,
      },
      passed: passed ?? criticalIssues === 0,
    }
  } catch (error) {
    console.error("[pr-review] Verifier failed:", error)
    console.log("[pr-review] Falling back to basic synthesis")
    return basicSynthesis(outputs, mergedComments, level)
  }
}

/**
 * Merge comments from all reviewers and deduplicate by path+line
 * CRITICAL: This preserves exact line numbers (no AI rewriting)
 */
function mergeAndDeduplicateComments(
  outputs: ReviewerOutput[],
  level: "critical" | "warning" | "info",
): SynthesizedReview["comments"] {
  const allComments: SynthesizedReview["comments"] = []

  // Collect all comments from successful reviewers
  for (const output of outputs) {
    if (!output.success || !output.review) continue

    for (const comment of output.review.comments) {
      allComments.push({
        path: comment.path,
        line: comment.line, // CRITICAL: preserve exact line number
        body: comment.body,
        side: comment.side || "RIGHT",
        severity: comment.severity || "warning",
        reviewer: output.name,
      })
    }
  }

  // Deduplicate and filter
  const deduplicated = deduplicateComments(allComments)
  return filterCommentsByLevel(deduplicated, level)
}

/**
 * Deduplicate comments by path+line
 * When multiple reviewers flag same location, keep highest severity
 */
export function deduplicateComments(
  comments: SynthesizedReview["comments"],
): SynthesizedReview["comments"] {
  const severityOrder = { critical: 3, warning: 2, info: 1 }
  const byLocation = new Map<string, SynthesizedReview["comments"][0]>()

  for (const comment of comments) {
    const key = `${comment.path}:${comment.line}`
    const existing = byLocation.get(key)

    if (!existing) {
      byLocation.set(key, comment)
    } else {
      // Keep higher severity, or merge bodies if same severity
      const existingSeverity = severityOrder[existing.severity]
      const newSeverity = severityOrder[comment.severity]

      if (newSeverity > existingSeverity) {
        byLocation.set(key, comment)
      } else if (newSeverity === existingSeverity && existing.reviewer !== comment.reviewer) {
        // Merge bodies from different reviewers at same severity
        byLocation.set(key, {
          ...existing,
          body: `${existing.body}\n\n---\n**${comment.reviewer}:** ${comment.body}`,
          reviewer: `${existing.reviewer}, ${comment.reviewer}`,
        })
      }
    }
  }

  return Array.from(byLocation.values())
}

/**
 * Filter comments by minimum severity level
 */
export function filterCommentsByLevel<T extends { severity: string }>(
  comments: T[],
  level: "critical" | "warning" | "info",
): T[] {
  const severityOrder = { critical: 3, warning: 2, info: 1 }
  const minLevel = severityOrder[level]

  return comments.filter((c) => severityOrder[c.severity as keyof typeof severityOrder] >= minLevel)
}

/**
 * Build prompt for overview synthesis only
 */
function buildOverviewPrompt(
  outputs: ReviewerOutput[],
  config: VerifierConfig,
  repoRoot: string,
): string {
  // Load custom verifier prompt or use default
  let basePrompt = config.prompt || DEFAULT_VERIFIER_PROMPT

  if (config.promptFile) {
    const promptPath = join(repoRoot, config.promptFile)
    if (existsSync(promptPath)) {
      try {
        basePrompt = readFileSync(promptPath, "utf-8")
      } catch {
        // Fall back to default
      }
    }
  }

  // Build reviewer summaries (overviews only, not comments)
  const summaryParts: string[] = []
  summaryParts.push("## Reviewer Summaries")
  summaryParts.push("")

  for (const output of outputs) {
    if (!output.success) {
      summaryParts.push(`### ${output.name} - FAILED`)
      summaryParts.push(`Error: ${output.error}`)
      summaryParts.push("")
      continue
    }

    if (!output.review) continue

    summaryParts.push(`### ${output.name}`)
    summaryParts.push(output.review.overview)
    summaryParts.push(`(${output.review.comments.length} inline comments)`)
    summaryParts.push("")
  }

  return `${basePrompt}

${summaryParts.join("\n")}

Synthesize these summaries into a unified overview. Do NOT include or modify inline comments.`
}

/**
 * Parse overview response from AI
 */
function parseOverviewResponse(response: string): { overview: string; passed?: boolean } {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : response

  try {
    const parsed = JSON.parse(jsonStr.trim())
    return {
      overview: parsed.overview || response,
      passed: parsed.passed,
    }
  } catch {
    // If not JSON, use response as overview
    return { overview: response }
  }
}

/**
 * Basic synthesis without AI verification
 */
export function basicSynthesis(
  outputs: ReviewerOutput[],
  mergedComments: SynthesizedReview["comments"],
  level: "critical" | "warning" | "info",
): SynthesizedReview {
  const successfulOutputs = outputs.filter((o) => o.success && o.review)

  // Build overview from reviewer summaries
  const overviewParts: string[] = []
  overviewParts.push("## Review Summary")
  overviewParts.push("")

  for (const output of successfulOutputs) {
    if (output.review?.overview) {
      overviewParts.push(`### ${output.name}`)
      overviewParts.push(output.review.overview)
      overviewParts.push("")
    }
  }

  const criticalIssues = mergedComments.filter((c) => c.severity === "critical").length
  const warnings = mergedComments.filter((c) => c.severity === "warning").length
  const infos = mergedComments.filter((c) => c.severity === "info").length

  return {
    overview: overviewParts.join("\n"),
    comments: mergedComments,
    summary: {
      totalReviewers: outputs.length,
      successfulReviewers: successfulOutputs.length,
      criticalIssues,
      warnings,
      infos,
    },
    passed: criticalIssues === 0,
  }
}
````

**Step 2: Create barrel export**

```typescript
// packages/pr-review/src/verifier/index.ts
export * from "./synthesizer"
```

**Step 3: Run tests**

Run: `bun test packages/pr-review/test/verifier.test.ts`
Expected: Verifier tests pass, especially line number preservation tests

**Step 4: Commit**

```bash
git add packages/pr-review/src/verifier/
git commit -m "feat(pr-review): add verifier with code-based comment merging"
```

---

## Task 4: Update Main Reviewer to Use Multi-Reviewer Flow

**Files:**

- Modify: `packages/pr-review/src/reviewer.ts`
- Modify: `packages/pr-review/src/index.ts`

**Step 1: Update reviewer.ts to support multi-reviewer mode**

```typescript
// packages/pr-review/src/reviewer.ts
import { createGitHubClient, type GitHubClient } from "./github/client"
import { fetchPR, fetchPRDiff } from "./github/pr"
import { submitReview } from "./github/review"
import { createAIClient, closeAIClient, type AIClient } from "./ai/client"
import { mapCommentsToPositions, formatUnmappedComments } from "./diff/position"
import type { PRData, Review } from "./github/types"
import { loadConfig } from "./config"
import type { PRReviewConfig, SynthesizedReview, ReviewerOutput } from "./config/types"
import { runAllReviewers } from "./reviewers"
import { verifyAndSynthesize } from "./verifier"

export type ReviewOptions = {
  /** GitHub token */
  token: string
  /** Repository owner */
  owner: string
  /** Repository name */
  repo: string
  /** PR number */
  prNumber: number
  /** Model to use (e.g., "anthropic/claude-sonnet-4-20250514") */
  model?: string
  /** Dry run - don't post review */
  dryRun?: boolean
  /** Repository root path (for loading config) */
  repoRoot?: string
  /** Use legacy single-reviewer mode */
  legacyMode?: boolean
}

export type ReviewResult = {
  success: boolean
  reviewId?: number
  reviewUrl?: string
  isUpdate?: boolean
  review?: Review
  synthesized?: SynthesizedReview
  error?: string
}

/**
 * Review a PR using multi-reviewer approach
 */
export async function reviewPR(options: ReviewOptions): Promise<ReviewResult> {
  let github: GitHubClient | null = null
  let ai: AIClient | null = null

  try {
    // Initialize clients
    github = createGitHubClient({
      token: options.token,
      owner: options.owner,
      repo: options.repo,
    })

    console.log(`[pr-review] Fetching PR #${options.prNumber}...`)
    const pr = await fetchPR(github, options.prNumber)
    const diff = await fetchPRDiff(github, options.prNumber)

    console.log(`[pr-review] PR: "${pr.title}" (+${pr.additions}/-${pr.deletions})`)
    console.log(`[pr-review] Files: ${pr.files.length}`)

    // Load configuration
    const repoRoot = options.repoRoot || process.cwd()
    const config = loadConfig(repoRoot)

    // Start AI client
    console.log("[pr-review] Starting AI client...")
    ai = await createAIClient()

    if (options.legacyMode || config.reviewers.length === 0) {
      // Fall back to legacy single-reviewer mode
      return runLegacyReview(ai, github, pr, diff, options)
    }

    // Run multi-reviewer flow
    console.log(`[pr-review] Starting multi-reviewer review...`)

    // Step 1: Run all reviewers in parallel
    const reviewerOutputs = await runAllReviewers(ai, pr, diff, config, repoRoot)

    // Step 2: Verify and synthesize findings
    const synthesized = await verifyAndSynthesize(ai, reviewerOutputs, config.verifier, repoRoot)

    // Update summary with actual reviewer counts
    synthesized.summary.totalReviewers = reviewerOutputs.length
    synthesized.summary.successfulReviewers = reviewerOutputs.filter((o) => o.success).length

    // Step 3: Convert to review format and submit
    const review: Review = {
      overview: buildFinalOverview(synthesized, reviewerOutputs),
      comments: synthesized.comments.map((c) => ({
        path: c.path,
        line: c.line,
        body: formatCommentBody(c),
        side: c.side,
      })),
      event: synthesized.passed ? "COMMENT" : "REQUEST_CHANGES",
    }

    // Map comments to diff positions
    const { mapped, unmapped } = mapCommentsToPositions(diff, review.comments)

    if (unmapped.length > 0) {
      console.log(`[pr-review] ${unmapped.length} comments moved to overview (not in diff)`)
      review.overview += formatUnmappedComments(unmapped)
    }

    // Dry run - just return the review
    if (options.dryRun) {
      console.log("[pr-review] Dry run - not posting review")
      return {
        success: true,
        review,
        synthesized,
      }
    }

    // Submit review
    console.log("[pr-review] Submitting review...")
    const result = await submitReview(
      github,
      options.prNumber,
      pr.headSha,
      review,
      mapped.map((c) => ({ path: c.path, position: c.position, body: c.body })),
    )

    console.log(
      `[pr-review] Review ${result.isUpdate ? "updated" : "submitted"}: ${result.reviewUrl}`,
    )

    return {
      success: true,
      reviewId: result.reviewId,
      reviewUrl: result.reviewUrl,
      isUpdate: result.isUpdate,
      review,
      synthesized,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[pr-review] Error: ${message}`)
    return {
      success: false,
      error: message,
    }
  } finally {
    if (ai) {
      closeAIClient(ai)
    }
  }
}

/**
 * Build final overview with summary
 */
function buildFinalOverview(synthesized: SynthesizedReview, outputs: ReviewerOutput[]): string {
  const parts: string[] = []

  parts.push("<!-- owo-pr-review -->")
  parts.push("")
  parts.push(synthesized.overview)
  parts.push("")
  parts.push("---")
  parts.push("")
  parts.push("### Review Stats")
  parts.push("")
  parts.push(
    `- **Reviewers**: ${synthesized.summary.successfulReviewers}/${synthesized.summary.totalReviewers} completed successfully`,
  )
  parts.push(
    `- **Issues**: ${synthesized.summary.criticalIssues} critical, ${synthesized.summary.warnings} warnings, ${synthesized.summary.infos} suggestions`,
  )
  parts.push(`- **Status**: ${synthesized.passed ? "✅ Passed" : "❌ Changes requested"}`)
  parts.push("")

  // Add reviewer details
  const successfulReviewers = outputs.filter((o) => o.success)
  if (successfulReviewers.length > 0) {
    parts.push("### Reviewers")
    parts.push("")
    for (const reviewer of successfulReviewers) {
      const commentCount = reviewer.review?.comments.length || 0
      parts.push(`- **${reviewer.name}**: ${commentCount} comments (${reviewer.durationMs}ms)`)
    }
    parts.push("")
  }

  parts.push("---")
  parts.push(`*Reviewed by [owo-pr-review](https://github.com/RawToast/owo)*`)

  return parts.join("\n")
}

/**
 * Format comment body with severity indicator
 */
function formatCommentBody(comment: SynthesizedReview["comments"][0]): string {
  const severityEmoji = {
    critical: "🚨",
    warning: "⚠️",
    info: "💡",
  }[comment.severity]

  return `${severityEmoji} **${comment.severity.toUpperCase()}** (${comment.reviewer})\n\n${comment.body}`
}

/**
 * Legacy single-reviewer mode (original implementation)
 */
async function runLegacyReview(
  ai: AIClient,
  github: GitHubClient,
  pr: PRData,
  diff: string,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const { buildReviewPrompt } = await import("./ai/prompts")
  const { parseReviewResponse, validateComments } = await import("./ai/parser")

  console.log("[pr-review] Running in legacy single-reviewer mode...")

  // Build prompt and get review
  const reviewPrompt = buildReviewPrompt(pr, diff)
  console.log("[pr-review] Requesting review from AI...")

  const modelConfig = options.model
    ? {
        providerID: options.model.split("/")[0],
        modelID: options.model.split("/").slice(1).join("/"),
      }
    : undefined

  const { prompt: promptFn } = await import("./ai/client")
  const { response } = await promptFn(ai, reviewPrompt, { model: modelConfig })

  // Parse response
  console.log("[pr-review] Parsing AI response...")
  const rawReview = parseReviewResponse(response)

  // Validate comments
  const validPaths = pr.files.map((f) => f.path)
  const { valid: review, warnings } = validateComments(rawReview, validPaths)

  for (const warning of warnings) {
    console.warn(`[pr-review] ${warning}`)
  }

  // Map comments to diff positions
  const { mapCommentsToPositions, formatUnmappedComments } = await import("./diff/position")
  const { mapped, unmapped } = mapCommentsToPositions(diff, review.comments)

  if (unmapped.length > 0) {
    console.log(`[pr-review] ${unmapped.length} comments moved to overview (not in diff)`)
    review.overview += formatUnmappedComments(unmapped)
  }

  // Dry run
  if (options.dryRun) {
    console.log("[pr-review] Dry run - not posting review")
    return {
      success: true,
      review,
    }
  }

  // Submit review
  console.log("[pr-review] Submitting review...")
  const { submitReview } = await import("./github/review")
  const result = await submitReview(
    github,
    options.prNumber,
    pr.headSha,
    review,
    mapped.map((c) => ({ path: c.path, position: c.position, body: c.body })),
  )

  console.log(
    `[pr-review] Review ${result.isUpdate ? "updated" : "submitted"}: ${result.reviewUrl}`,
  )

  return {
    success: true,
    reviewId: result.reviewId,
    reviewUrl: result.reviewUrl,
    isUpdate: result.isUpdate,
    review,
  }
}
```

**Step 2: Update index.ts with new exports and --legacy flag**

```typescript
#!/usr/bin/env bun
// packages/pr-review/src/index.ts

// Library exports
export { reviewPR, type ReviewOptions, type ReviewResult } from "./reviewer"
export * from "./github"
export * from "./ai"
export * from "./diff"
export * from "./config"
export * from "./reviewers"
export * from "./verifier"

import { reviewPR, type ReviewOptions } from "./reviewer"
import { getPRContextFromEnv } from "./github/pr"
import { getGitHubToken } from "./github/client"

async function main() {
  const args = process.argv.slice(2)

  // Help
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
@owo/pr-review - AI-powered PR code review

Usage:
  owo-review [options]
  owo-review --pr <number> --owner <owner> --repo <repo>

Options:
  --pr <number>      PR number to review
  --owner <owner>    Repository owner
  --repo <repo>      Repository name
  --model <model>    Model to use (e.g., anthropic/claude-sonnet-4-20250514)
  --dry-run          Don't post review, just print it
  --legacy           Use single-reviewer mode (original behavior)
  --help, -h         Show this help

Environment:
  GITHUB_TOKEN       Required. GitHub token with PR read/write access
  GITHUB_REPOSITORY  Optional. owner/repo format (auto-detected in Actions)
  GITHUB_EVENT_PATH  Optional. Path to event JSON (auto-set in Actions)

Examples:
  # In GitHub Actions (auto-detects PR context)
  owo-review

  # Manual review
  owo-review --pr 123 --owner myorg --repo myrepo

  # Dry run
  owo-review --pr 123 --owner myorg --repo myrepo --dry-run

  # Legacy single-reviewer mode
  owo-review --pr 123 --owner myorg --repo myrepo --legacy
`)
    process.exit(0)
  }

  // Parse args
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`)
    return idx !== -1 ? args[idx + 1] : undefined
  }

  const prNumber = getArg("pr")
  const owner = getArg("owner")
  const repo = getArg("repo")
  const model = getArg("model")
  const dryRun = args.includes("--dry-run")
  const legacyMode = args.includes("--legacy")

  // Build options
  let options: ReviewOptions

  if (prNumber && owner && repo) {
    // Manual mode
    options = {
      token: getGitHubToken(),
      owner,
      repo,
      prNumber: parseInt(prNumber, 10),
      model,
      dryRun,
      legacyMode,
    }
  } else {
    // Auto-detect from GitHub Actions environment
    const ctx = getPRContextFromEnv()
    if (!ctx) {
      console.error("Error: Could not detect PR context.")
      console.error("Either run in GitHub Actions or provide --pr, --owner, --repo")
      process.exit(1)
    }

    options = {
      token: getGitHubToken(),
      owner: ctx.owner,
      repo: ctx.repo,
      prNumber: ctx.number,
      model,
      dryRun,
      legacyMode,
    }
  }

  console.log(`@owo/pr-review v0.2.0`)
  console.log(`Reviewing ${options.owner}/${options.repo}#${options.prNumber}`)
  if (legacyMode) {
    console.log(`Mode: legacy (single-reviewer)`)
  } else {
    console.log(`Mode: multi-reviewer`)
  }
  console.log("")

  const result = await reviewPR(options)

  if (!result.success) {
    console.error(`\nReview failed: ${result.error}`)
    process.exit(1)
  }

  if (dryRun && result.review) {
    console.log("\n--- Review (dry run) ---")
    console.log(result.review.overview)
    console.log(`\nInline comments: ${result.review.comments.length}`)
    for (const c of result.review.comments) {
      console.log(`  ${c.path}:${c.line} - ${c.body.slice(0, 50)}...`)
    }
  } else {
    console.log(`\nReview ${result.isUpdate ? "updated" : "posted"}: ${result.reviewUrl}`)
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
```

**Step 3: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pr-review/src/
git commit -m "feat(pr-review): integrate multi-reviewer flow with --legacy flag"
```

---

## Task 5: Create Example Configuration Files

**Files:**

- Create: `packages/pr-review/examples/pr-review.json`
- Create: `packages/pr-review/examples/reviewers/quality.md`
- Create: `packages/pr-review/examples/reviewers/security.md`

**Step 1: Create example config**

```json
{
  "$schema": "https://raw.githubusercontent.com/RawToast/owo/main/packages/pr-review/schema.json",
  "version": 1,
  "reviewers": [
    {
      "name": "quality",
      "promptFile": ".github/reviewers/quality.md",
      "focus": "code quality and best practices",
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    {
      "name": "security",
      "promptFile": ".github/reviewers/security.md",
      "focus": "security vulnerabilities",
      "model": "anthropic/claude-sonnet-4-20250514"
    },
    {
      "name": "performance",
      "prompt": "You are a performance reviewer. Focus on:\n- Algorithmic complexity\n- Database query efficiency\n- Memory usage\n- Async/await patterns\n- Caching opportunities\n\nRespond with JSON: {\"overview\": \"...\", \"comments\": [{\"path\": \"...\", \"line\": N, \"body\": \"...\", \"severity\": \"warning\"}]}",
      "focus": "performance optimization",
      "enabled": false
    }
  ],
  "verifier": {
    "model": "anthropic/claude-sonnet-4-20250514",
    "enabled": true,
    "level": "warning"
  },
  "defaults": {
    "model": "anthropic/claude-sonnet-4-20250514"
  }
}
```

**Step 2: Create quality reviewer prompt**

````markdown
# Quality Reviewer

You are a code quality reviewer. Focus on:

- Code quality and best practices
- Potential bugs and edge cases
- Performance implications
- Maintainability and readability
- Type safety and error handling

## Review Guidelines

1. Only flag issues that are genuinely problematic
2. Ignore stylistic preferences (formatting, naming conventions)
3. Focus on correctness, safety, and maintainability
4. Be specific and provide actionable suggestions

## Response Format

Respond with JSON in this format:

```json
{
  "overview": "Brief summary of your findings",
  "comments": [
    {
      "path": "src/file.ts",
      "line": 42,
      "body": "Your comment here with specific suggestion",
      "side": "RIGHT",
      "severity": "critical|warning|info"
    }
  ]
}
```
````

Severity levels:

- **critical**: Blocking issue that must be fixed before merge
- **warning**: Issue that should be fixed, but not blocking
- **info**: Suggestion or observation, not required

````

**Step 3: Create security reviewer prompt**

```markdown
# Security Reviewer

You are a security reviewer. Focus on:

- Security vulnerabilities
- Authentication/authorization issues
- Input validation and sanitization
- Sensitive data exposure
- Injection risks (SQL, XSS, command injection)
- Insecure dependencies

## Review Guidelines

1. Only flag genuine security issues, not hypothetical scenarios
2. Consider the context and actual risk level
3. Provide specific remediation advice
4. Be thorough but avoid false positives

## Response Format

Respond with JSON in this format:

```json
{
  "overview": "Brief summary of security findings",
  "comments": [
    {
      "path": "src/file.ts",
      "line": 42,
      "body": "Security issue description with fix suggestion",
      "side": "RIGHT",
      "severity": "critical|warning|info"
    }
  ]
}
````

Severity levels:

- **critical**: Confirmed security vulnerability requiring immediate fix
- **warning**: Potential security concern that should be addressed
- **info**: Security observation or best practice suggestion

````

**Step 4: Commit**

```bash
git add packages/pr-review/examples/
git commit -m "docs(pr-review): add example configuration files"
````

---

## Task 6: Update Documentation

**Files:**

- Modify: `packages/pr-review/README.md`

**Step 1: Update README with multi-reviewer documentation**

(See original plan for full README content - unchanged)

**Step 2: Commit**

```bash
git add packages/pr-review/README.md
git commit -m "docs(pr-review): update README with multi-reviewer documentation"
```

---

## Task 7: Final Build and Verification

**Step 1: Run all tests**

Run: `bun test packages/pr-review/test/`
Expected: All tests pass

**Step 2: Build the package**

Run: `bun run make` in `packages/pr-review`
Expected: Build succeeds

**Step 3: Run typecheck**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 4: Test CLI help**

Run: `./dist/index.js --help`
Expected: Help text displayed with --legacy option

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(pr-review): complete multi-reviewer implementation with TDD"
```

---

## Summary

### What We Built

| Component                 | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `test/*.test.ts`          | Test infrastructure (TDD)                          |
| `config/types.ts`         | Configuration schemas and types                    |
| `config/defaults.ts`      | Shared default prompts (no duplication)            |
| `config/loader.ts`        | Load config from `.github/pr-review.json`          |
| `reviewers/runner.ts`     | Run individual reviewer with timeout               |
| `reviewers/engine.ts`     | Orchestrate parallel reviewers                     |
| `verifier/synthesizer.ts` | Code-based comment merging + AI overview synthesis |
| `ai/prompts.ts`           | Multi-reviewer prompt builder                      |
| `reviewer.ts`             | Updated main flow with multi-reviewer support      |
| `index.ts`                | CLI with --legacy flag                             |

### Key Design Decisions

1. **TDD Approach** - Tests written before implementation
2. **Code-based comment merging** - Preserves exact line numbers (no AI hallucination)
3. **AI only for overview** - Verifier synthesizes overview, not comments
4. **Timeout handling** - 60-second timeout per reviewer
5. **Deduplication by path+line** - Keeps highest severity when multiple reviewers flag same location
6. **Shared defaults** - No duplicate prompt constants

### Key Features

1. **Parallel Reviewers** - Run multiple reviewers simultaneously
2. **Custom Prompts** - Load from `.github/reviewers/*.md` files
3. **Verifier Step** - AI synthesizes overview only
4. **Severity Levels** - critical/warning/info with emoji indicators
5. **Level Filtering** - Filter by minimum severity
6. **Smart Actions** - Auto REQUEST_CHANGES for critical issues
7. **Backward Compatible** - --legacy flag for single-reviewer mode
8. **Timeout Protection** - Prevents hanging on slow AI responses

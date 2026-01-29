# Multi-Reviewer PR Review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-reviewer parallel execution with verification to @owo/pr-review, using configurable reviewers with custom prompts from `.github/` directory and hardcoded defaults based on the old agent flow.

**Architecture:** 
- Extend the reviewer to support multiple parallel reviewers (security, quality, performance, etc.)
- Each reviewer gets the PR context + their specific prompt, runs in parallel via Promise.allSettled()
- A verifier synthesizes and validates all findings before posting
- Prompts can be loaded from `.github/reviewers/*.md` files or use built-in defaults based on review.md, review-changes.md, verify.md

**Tech Stack:** TypeScript, Bun, Zod, @octokit/rest, @opencode-ai/sdk

---

## Task 1: Create Configuration Types and Schema

**Files:**
- Create: `packages/pr-review/src/config/types.ts`
- Create: `packages/pr-review/src/config/loader.ts`
- Modify: `packages/pr-review/src/github/types.ts` (add ReviewerConfig reference)

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
  level: SeverityLevelSchema.optional().default("info").describe(
    "Minimum severity level to include in final review (critical=only critical, warning=critical+warning, info=all)"
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
  defaults: z.object({
    model: z.string().optional(),
  }).optional(),
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

**Step 2: Create config loader**

```typescript
// packages/pr-review/src/config/loader.ts
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { PRReviewConfigSchema, type PRReviewConfig, type ReviewerConfig } from "./types"

const DEFAULT_REVIEWERS: ReviewerConfig[] = [
  {
    name: "quality",
    prompt: `You are a code quality reviewer. Focus on:
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
}`,
    focus: "code quality",
  },
  {
    name: "security",
    prompt: `You are a security reviewer. Focus on:
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
}`,
    focus: "security",
  },
]

const DEFAULT_VERIFIER_PROMPT = `You are a review verifier. Your job is to:
1. Review the findings from multiple reviewers
2. Remove duplicate or overlapping comments
3. Verify that comments are accurate and relevant
4. Ensure severity levels are appropriate
5. Synthesize a final overview

Given multiple reviewer outputs, produce a final review that:
- Has a clear, concise overview
- Contains only verified, accurate comments
- Uses appropriate severity levels
- Is well-organized and actionable

Respond with JSON in this format:
{
  "overview": "Synthesized overview of all findings",
  "comments": [
    {
      "path": "src/file.ts",
      "line": 42,
      "body": "Verified comment",
      "side": "RIGHT",
      "severity": "critical|warning|info",
      "reviewer": "name of original reviewer"
    }
  ],
  "passed": false
}

Set "passed" to true only if there are no critical issues and the code is acceptable to merge.`

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

**Step 3: Create barrel export**

```typescript
// packages/pr-review/src/config/index.ts
export * from "./types"
export * from "./loader"
```

**Step 4: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/pr-review/src/config/
git commit -m "feat(pr-review): add configuration types and loader"
```

---

## Task 2: Create Multi-Reviewer Engine

**Files:**
- Create: `packages/pr-review/src/reviewers/engine.ts`
- Create: `packages/pr-review/src/reviewers/runner.ts`

**Step 1: Create individual reviewer runner**

```typescript
// packages/pr-review/src/reviewers/runner.ts
import type { AIClient } from "../ai/client"
import { prompt } from "../ai/client"
import { buildMultiReviewerPrompt } from "../ai/prompts"
import type { PRData } from "../github/types"
import type { ReviewerConfig, ReviewerOutput } from "../config/types"
import { loadReviewerPrompt } from "../config/loader"

/**
 * Run a single reviewer
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
    const parsed = parseReviewerResponse(response, reviewer.name)
    
    const durationMs = Date.now() - startTime
    console.log(`[pr-review] Reviewer ${reviewer.name} completed in ${durationMs}ms`)
    
    return {
      name: reviewer.name,
      success: true,
      review: parsed,
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
 * Parse reviewer response (expects JSON format)
 */
function parseReviewerResponse(response: string, reviewerName: string): NonNullable<ReviewerOutput["review"]> {
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
    console.warn(`[pr-review] Reviewer ${reviewerName} returned non-JSON response, using as overview`)
    return {
      overview: response,
      comments: [],
    }
  }
}
```

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
 * Synthesize reviewer outputs into final review (without verifier)
 * Used when verifier is disabled
 */
export function synthesizeReview(outputs: ReviewerOutput[]): SynthesizedReview {
  const successfulOutputs = outputs.filter((o) => o.success && o.review)
  
  // Combine all comments
  const allComments: SynthesizedReview["comments"] = []
  
  for (const output of successfulOutputs) {
    if (!output.review) continue
    
    for (const comment of output.review.comments) {
      allComments.push({
        ...comment,
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

Modify `packages/pr-review/src/ai/prompts.ts` to add:

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

**Step 5: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/pr-review/src/reviewers/ packages/pr-review/src/ai/prompts.ts
git commit -m "feat(pr-review): add multi-reviewer engine"
```

---

## Task 3: Create Verifier/Synthesizer

**Files:**
- Create: `packages/pr-review/src/verifier/synthesizer.ts`

**Step 1: Create verifier**

```typescript
// packages/pr-review/src/verifier/synthesizer.ts
import type { AIClient } from "../ai/client"
import { prompt } from "../ai/client"
import type { ReviewerOutput, SynthesizedReview, VerifierConfig } from "../config/types"
import { loadReviewerPrompt } from "../config/loader"

/**
 * Synthesize and verify reviewer outputs using AI
 */
export async function verifyAndSynthesize(
  ai: AIClient,
  outputs: ReviewerOutput[],
  verifierConfig: VerifierConfig | undefined,
  repoRoot: string,
): Promise<SynthesizedReview> {
  const startTime = Date.now()
  
  // If verifier is disabled, do basic synthesis
  if (!verifierConfig?.enabled) {
    console.log("[pr-review] Verifier disabled, using basic synthesis")
    return basicSynthesis(outputs)
  }
  
  try {
    console.log("[pr-review] Running verifier to synthesize findings...")
    
    // Build the verification prompt
    const verificationPrompt = buildVerificationPrompt(outputs, verifierConfig, repoRoot)
    
    // Get AI response
    const modelConfig = verifierConfig.model
      ? {
          providerID: verifierConfig.model.split("/")[0],
          modelID: verifierConfig.model.split("/").slice(1).join("/"),
        }
      : undefined
    
    const { response } = await prompt(ai, verificationPrompt, { model: modelConfig })
    
    // Parse the response
    const synthesized = parseSynthesizedResponse(response, verifierConfig.level)
    
    const durationMs = Date.now() - startTime
    console.log(`[pr-review] Verifier completed in ${durationMs}ms`)
    console.log(`[pr-review] Final review: ${synthesized.summary.criticalIssues} critical, ${synthesized.summary.warnings} warnings, ${synthesized.summary.infos} info`)
    
    return synthesized
  } catch (error) {
    console.error("[pr-review] Verifier failed:", error)
    console.log("[pr-review] Falling back to basic synthesis")
    return basicSynthesis(outputs, verifierConfig.level)
  }
}

/**
 * Build verification prompt
 */
function buildVerificationPrompt(
  outputs: ReviewerOutput[],
  config: VerifierConfig,
  repoRoot: string,
): string {
  // Load custom verifier prompt or use default
  let basePrompt = config.prompt || DEFAULT_VERIFIER_PROMPT
  
  if (config.promptFile) {
    const promptPath = `${repoRoot}/${config.promptFile}`
    try {
      const fs = require("fs")
      if (fs.existsSync(promptPath)) {
        basePrompt = fs.readFileSync(promptPath, "utf-8")
      }
    } catch {
      // Fall back to default
    }
  }
  
  // Build reviewer findings section
  const findingsParts: string[] = []
  findingsParts.push("## Reviewer Findings")
  findingsParts.push("")
  
  for (const output of outputs) {
    if (!output.success) {
      findingsParts.push(`### ${output.name} - FAILED`)
      findingsParts.push(`Error: ${output.error}`)
      findingsParts.push("")
      continue
    }
    
    if (!output.review) continue
    
    findingsParts.push(`### ${output.name}`)
    findingsParts.push("")
    findingsParts.push("Overview:")
    findingsParts.push(output.review.overview)
    findingsParts.push("")
    
    if (output.review.comments.length > 0) {
      findingsParts.push("Comments:")
      for (const comment of output.review.comments) {
        findingsParts.push(`- ${comment.path}:${comment.line} (${comment.severity || "warning"}): ${comment.body.slice(0, 100)}...`)
      }
    }
    findingsParts.push("")
  }
  
  return `${basePrompt}

${findingsParts.join("\n")}

Synthesize these findings into a final review.`
}

/**
 * Parse synthesized response and filter by severity level
 */
function parseSynthesizedResponse(
  response: string,
  level: "critical" | "warning" | "info" = "info",
): SynthesizedReview {
  // Try to extract JSON
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : response
  
  try {
    const parsed = JSON.parse(jsonStr.trim())
    
    const allComments = (parsed.comments || []).map((c: any) => ({
      path: c.path,
      line: c.line,
      body: c.body,
      side: c.side || "RIGHT",
      severity: c.severity || "warning",
      reviewer: c.reviewer || "verifier",
    }))
    
    // Filter comments by severity level
    const filteredComments = filterCommentsByLevel(allComments, level)
    
    const criticalIssues = filteredComments.filter((c) => c.severity === "critical").length
    const warnings = filteredComments.filter((c) => c.severity === "warning").length
    const infos = filteredComments.filter((c) => c.severity === "info").length
    
    // Add level filter notice to overview if filtering occurred
    let overview = parsed.overview || ""
    if (filteredComments.length < allComments.length) {
      const filteredCount = allComments.length - filteredComments.length
      overview += `\n\n*(Filtered to ${level}+ severity, ${filteredCount} lower-severity items hidden)*`
    }
    
    return {
      overview,
      comments: filteredComments,
      summary: {
        totalReviewers: 0, // Will be set by caller
        successfulReviewers: 0,
        criticalIssues,
        warnings,
        infos,
      },
      passed: parsed.passed ?? (criticalIssues === 0),
    }
  } catch (error) {
    // If parsing fails, return empty review
    console.warn("[pr-review] Failed to parse verifier response as JSON")
    return {
      overview: response,
      comments: [],
      summary: {
        totalReviewers: 0,
        successfulReviewers: 0,
        criticalIssues: 0,
        warnings: 0,
        infos: 0,
      },
      passed: true,
    }
  }
}

/**
 * Filter comments by minimum severity level
 */
function filterCommentsByLevel(
  comments: Array<{ severity: string }>,
  level: "critical" | "warning" | "info",
): typeof comments {
  const severityOrder = { critical: 3, warning: 2, info: 1 }
  const minLevel = severityOrder[level]
  
  return comments.filter((c) => severityOrder[c.severity as keyof typeof severityOrder] >= minLevel)
}

/**
 * Basic synthesis without AI verification
 */
function basicSynthesis(
  outputs: ReviewerOutput[],
  level: "critical" | "warning" | "info" = "info",
): SynthesizedReview {
  const successfulOutputs = outputs.filter((o) => o.success && o.review)
  
  const allComments: SynthesizedReview["comments"] = []
  
  for (const output of successfulOutputs) {
    if (!output.review) continue
    
    for (const comment of output.review.comments) {
      allComments.push({
        path: comment.path,
        line: comment.line,
        body: comment.body,
        side: comment.side || "RIGHT",
        severity: comment.severity || "warning",
        reviewer: output.name,
      })
    }
  }
  
  // Filter comments by severity level
  const filteredComments = filterCommentsByLevel(allComments, level)
  
  // Build overview
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
  
  // Add level filter notice if filtering occurred
  if (filteredComments.length < allComments.length) {
    const filteredCount = allComments.length - filteredComments.length
    overviewParts.push(`*(Filtered to ${level}+ severity, ${filteredCount} lower-severity items hidden)*`)
    overviewParts.push("")
  }
  
  const criticalIssues = filteredComments.filter((c) => c.severity === "critical").length
  const warnings = filteredComments.filter((c) => c.severity === "warning").length
  const infos = filteredComments.filter((c) => c.severity === "info").length
  
  return {
    overview: overviewParts.join("\n"),
    comments: filteredComments,
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

const DEFAULT_VERIFIER_PROMPT = `You are a review verifier. Your job is to:
1. Review the findings from multiple reviewers
2. Remove duplicate or overlapping comments
3. Verify that comments are accurate and relevant
4. Ensure severity levels are appropriate
5. Synthesize a final overview

Given multiple reviewer outputs, produce a final review that:
- Has a clear, concise overview
- Contains only verified, accurate comments
- Uses appropriate severity levels (critical = blocking issue, warning = should fix, info = suggestion)
- Is well-organized and actionable

Respond with JSON in this format:
{
  "overview": "Synthesized overview of all findings",
  "comments": [
    {
      "path": "src/file.ts",
      "line": 42,
      "body": "Verified comment",
      "side": "RIGHT",
      "severity": "critical|warning|info",
      "reviewer": "name of original reviewer"
    }
  ],
  "passed": false
}

Set "passed" to true only if there are no critical issues and the code is acceptable to merge.`
```

**Step 2: Create barrel export**

```typescript
// packages/pr-review/src/verifier/index.ts
export * from "./synthesizer"
```

**Step 3: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pr-review/src/verifier/
git commit -m "feat(pr-review): add verifier and synthesizer"
```

---

## Task 4: Update Main Reviewer to Use Multi-Reviewer Flow

**Files:**
- Modify: `packages/pr-review/src/reviewer.ts`

**Step 1: Update reviewer.ts to support multi-reviewer mode**

Replace the content of `packages/pr-review/src/reviewer.ts`:

```typescript
// packages/pr-review/src/reviewer.ts
import { createGitHubClient, type GitHubClient } from "./github/client"
import { fetchPR, fetchPRDiff } from "./github/pr"
import { submitReview } from "./github/review"
import { createAIClient, closeAIClient, type AIClient } from "./ai/client"
import { mapCommentsToPositions, formatUnmappedComments } from "./diff/position"
import type { PRData, Review } from "./github/types"
import { loadConfig, type PRReviewConfig, type SynthesizedReview } from "./config"
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
function buildFinalOverview(
  synthesized: SynthesizedReview,
  outputs: import("./config/types").ReviewerOutput[],
): string {
  const parts: string[] = []
  
  parts.push("<!-- owo-pr-review -->")
  parts.push("")
  parts.push(synthesized.overview)
  parts.push("")
  parts.push("---")
  parts.push("")
  parts.push("### Review Stats")
  parts.push("")
  parts.push(`- **Reviewers**: ${synthesized.summary.successfulReviewers}/${synthesized.summary.totalReviewers} completed successfully`)
  parts.push(`- **Issues**: ${synthesized.summary.criticalIssues} critical, ${synthesized.summary.warnings} warnings, ${synthesized.summary.infos} suggestions`)
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
function formatCommentBody(
  comment: import("./config/types").SynthesizedReview["comments"][0],
): string {
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
  // Import legacy prompt builder
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

**Step 2: Update barrel exports**

Modify `packages/pr-review/src/index.ts` to export new types:

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

// CLI implementation...
// (rest of the file unchanged)
```

**Step 3: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pr-review/src/
git commit -m "feat(pr-review): integrate multi-reviewer flow into main reviewer"
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
      "model": "anthropic/claude-opus-4-20250514"
    },
    {
      "name": "performance",
      "prompt": "You are a performance reviewer. Focus on:\n- Algorithmic complexity\n- Database query efficiency\n- Memory usage\n- Async/await patterns\n- Caching opportunities",
      "focus": "performance optimization",
      "enabled": false
    }
  ],
  "verifier": {
    "promptFile": ".github/reviewers/verifier.md",
    "model": "anthropic/claude-sonnet-4-20250514",
    "enabled": true
  },
  "defaults": {
    "model": "anthropic/claude-sonnet-4-20250514"
  }
}
```

**Step 2: Create quality reviewer prompt**

```markdown
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

Severity levels:
- **critical**: Blocking issue that must be fixed before merge
- **warning**: Issue that should be fixed, but not blocking
- **info**: Suggestion or observation, not required
```

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
```

Severity levels:
- **critical**: Confirmed security vulnerability requiring immediate fix
- **warning**: Potential security concern that should be addressed
- **info**: Security observation or best practice suggestion
```

**Step 4: Commit**

```bash
git add packages/pr-review/examples/
git commit -m "docs(pr-review): add example configuration files"
```

---

## Task 6: Update Documentation

**Files:**
- Modify: `packages/pr-review/README.md`

**Step 1: Update README with multi-reviewer documentation**

Replace the README content:

```markdown
# @owo/pr-review

AI-powered PR code review using opencode SDK + Octokit with multi-reviewer support.

## Features

- 🤖 **Multi-Reviewer Mode** - Run security, quality, and performance reviewers in parallel
- ✅ **Verifier Step** - AI synthesizes and validates all reviewer findings
- 📝 **Inline Comments** - Comments on specific lines in the diff with severity levels
- 🔄 **Review Updates** - Updates existing reviews instead of creating duplicates
- ⚙️ **Configurable** - Custom prompts via `.github/reviewers/*.md` files
- 🎯 **Smart Actions** - Auto REQUEST_CHANGES for critical issues
- 🚀 **Multiple Modes** - GitHub Action, CLI tool, or library

## Quick Start

### GitHub Action

```yaml
name: PR Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - uses: RawToast/owo/packages/pr-review@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          model: anthropic/claude-sonnet-4-20250514
```

### Configuration

Create `.github/pr-review.json`:

```json
{
  "reviewers": [
    {
      "name": "quality",
      "promptFile": ".github/reviewers/quality.md",
      "focus": "code quality"
    },
    {
      "name": "security",
      "promptFile": ".github/reviewers/security.md",
      "focus": "security"
    }
  ],
  "verifier": {
    "enabled": true
  }
}
```

Create `.github/reviewers/quality.md`:

```markdown
You are a code quality reviewer. Focus on:
- Code quality and best practices
- Potential bugs and edge cases
- Performance implications

Respond with JSON:
{
  "overview": "Summary",
  "comments": [{"path": "file.ts", "line": 42, "body": "...", "severity": "warning"}]
}
```

### CLI

```bash
# Install
bun add @owo/pr-review

# Review with default reviewers
GITHUB_TOKEN=ghp_xxx owo-review --pr 123 --owner myorg --repo myrepo

# Dry run
owo-review --pr 123 --owner myorg --repo myrepo --dry-run

# Legacy single-reviewer mode
owo-review --pr 123 --owner myorg --repo myrepo --legacy
```

### Library

```typescript
import { reviewPR } from "@owo/pr-review"

const result = await reviewPR({
  token: process.env.GITHUB_TOKEN,
  owner: "myorg",
  repo: "myrepo",
  prNumber: 123,
  repoRoot: "/path/to/repo", // For loading .github/pr-review.json
})

console.log(result.synthesized?.passed) // true if no critical issues
console.log(result.synthesized?.summary) // Review stats
```

## How It Works

1. **Fetch PR** - Gets PR data and diff from GitHub API
2. **Load Config** - Reads `.github/pr-review.json` or uses defaults
3. **Parallel Review** - All enabled reviewers analyze the code simultaneously
4. **Verify** - AI synthesizes findings, removes duplicates, validates severity
5. **Post Review** - Submits review with inline comments and overview

## Default Reviewers

If no config is found, uses these built-in reviewers:

- **quality** - Code quality, bugs, edge cases, performance
- **security** - Security vulnerabilities, auth issues, injection risks

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub token with PR read/write |
| `GITHUB_REPOSITORY` | No | Auto-set in Actions |
| `GITHUB_EVENT_PATH` | No | Auto-set in Actions |

## License

MIT
```

**Step 2: Commit**

```bash
git add packages/pr-review/README.md
git commit -m "docs(pr-review): update README with multi-reviewer documentation"
```

---

## Task 7: Final Build and Verification

**Step 1: Build the package**

Run: `bun run make` in `packages/pr-review`
Expected: Build succeeds

**Step 2: Run typecheck**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 3: Test CLI help**

Run: `./dist/index.js --help`
Expected: Help text displayed

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(pr-review): complete multi-reviewer implementation with verification"
```

---

## Summary

### What We Built

| Component | Purpose |
|-----------|---------|
| `config/types.ts` | Configuration schemas and types |
| `config/loader.ts` | Load config from `.github/pr-review.json` |
| `reviewers/runner.ts` | Run individual reviewer |
| `reviewers/engine.ts` | Orchestrate parallel reviewers |
| `verifier/synthesizer.ts` | Verify and synthesize findings |
| `ai/prompts.ts` | Multi-reviewer prompt builder |
| `reviewer.ts` | Updated main flow with multi-reviewer support |

### Key Features

1. **Parallel Reviewers** - Run multiple reviewers simultaneously
2. **Custom Prompts** - Load from `.github/reviewers/*.md` files
3. **Verifier Step** - AI validates and synthesizes all findings
4. **Severity Levels** - critical/warning/info with emoji indicators
5. **Smart Actions** - Auto REQUEST_CHANGES for critical issues
6. **Backward Compatible** - Legacy mode for single-reviewer

### Next Steps (Future)

- [ ] Add tests for multi-reviewer engine
- [ ] Add JSON schema for config validation
- [ ] Support review threads/conversations
- [ ] Add caching for AI responses
- [ ] Support incremental reviews (only new commits)

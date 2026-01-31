# File Context for Reviewers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give PR reviewers access to full file content (not just diffs) by reading from local filesystem.

**Architecture:** Add a `context` module that reads changed files from disk, then inject this context into reviewer prompts alongside the existing diff. Config controls whether context is enabled and size limits.

**Tech Stack:** TypeScript, Bun, Zod for config schema

---

## Task 1: Add Context Config Schema

**Files:**

- Modify: `packages/pr-review/src/config/types.ts`

**Step 1: Add ContextConfig schema to types.ts**

Add after `ResolutionConfigSchema` (around line 93):

```typescript
/**
 * File context configuration
 */
export const ContextConfigSchema = z.object({
  enabled: z.boolean().default(true).describe("Enable full file context for reviewers"),
  maxFileSizeKb: z
    .number()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Maximum file size to include (KB)"),
  maxTotalSizeKb: z
    .number()
    .min(10)
    .max(5000)
    .default(500)
    .describe("Maximum total context size (KB)"),
  include: z
    .object({
      changedFiles: z.boolean().default(true).describe("Include full content of changed files"),
    })
    .default({}),
})

export type ContextConfig = z.infer<typeof ContextConfigSchema>
```

**Step 2: Add context to PRReviewConfigSchema**

Update `PRReviewConfigSchema` to include context:

```typescript
export const PRReviewConfigSchema = z.object({
  version: z.literal(1).default(1),
  reviewers: z.array(ReviewerConfigSchema).default([]),
  verifier: VerifierConfigSchema.optional(),
  resolution: ResolutionConfigSchema.optional(),
  context: ContextConfigSchema.optional(),
  defaults: z
    .object({
      model: z
        .string()
        .regex(/^[^/]+\/[^/]+$/, "Model must be in 'provider/model' format")
        .optional(),
    })
    .optional(),
})
```

**Step 3: Run typecheck**

Run: `bun run compile`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add packages/pr-review/src/config/types.ts
git commit -m "feat(pr-review): add context config schema"
```

---

## Task 2: Create Context Fetcher Module

**Files:**

- Create: `packages/pr-review/src/context/types.ts`
- Create: `packages/pr-review/src/context/fetcher.ts`
- Create: `packages/pr-review/src/context/index.ts`

**Step 1: Create types.ts**

```typescript
/**
 * File content with metadata
 */
export type FileContext = {
  path: string
  content: string
  sizeBytes: number
  truncated: boolean
}

/**
 * Result of fetching context
 */
export type ContextResult = {
  files: FileContext[]
  totalSizeBytes: number
  skippedFiles: string[]
  skippedReason: Map<string, string>
}
```

**Step 2: Create fetcher.ts**

```typescript
import { existsSync, readFileSync, statSync } from "fs"
import { join } from "path"
import type { ContextConfig } from "../config/types"
import type { ContextResult, FileContext } from "./types"

const DEFAULT_MAX_FILE_SIZE_KB = 100
const DEFAULT_MAX_TOTAL_SIZE_KB = 500

/**
 * Fetch file context from local filesystem
 */
export function fetchLocalContext(
  repoRoot: string,
  changedPaths: string[],
  config?: ContextConfig,
): ContextResult {
  const maxFileSizeBytes = (config?.maxFileSizeKb ?? DEFAULT_MAX_FILE_SIZE_KB) * 1024
  const maxTotalSizeBytes = (config?.maxTotalSizeKb ?? DEFAULT_MAX_TOTAL_SIZE_KB) * 1024

  const files: FileContext[] = []
  const skippedFiles: string[] = []
  const skippedReason = new Map<string, string>()
  let totalSizeBytes = 0

  for (const relativePath of changedPaths) {
    const fullPath = join(repoRoot, relativePath)

    // Check if file exists
    if (!existsSync(fullPath)) {
      skippedFiles.push(relativePath)
      skippedReason.set(relativePath, "file not found (possibly deleted)")
      continue
    }

    // Check file size
    const stats = statSync(fullPath)
    if (stats.size > maxFileSizeBytes) {
      skippedFiles.push(relativePath)
      skippedReason.set(
        relativePath,
        `file too large (${Math.round(stats.size / 1024)}KB > ${config?.maxFileSizeKb ?? DEFAULT_MAX_FILE_SIZE_KB}KB)`,
      )
      continue
    }

    // Check total size limit
    if (totalSizeBytes + stats.size > maxTotalSizeBytes) {
      skippedFiles.push(relativePath)
      skippedReason.set(relativePath, "total context size limit reached")
      continue
    }

    // Read file content
    try {
      const content = readFileSync(fullPath, "utf-8")
      files.push({
        path: relativePath,
        content,
        sizeBytes: stats.size,
        truncated: false,
      })
      totalSizeBytes += stats.size
    } catch (error) {
      skippedFiles.push(relativePath)
      skippedReason.set(
        relativePath,
        `read error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return {
    files,
    totalSizeBytes,
    skippedFiles,
    skippedReason,
  }
}

/**
 * Check if we're in a valid repo root (has the changed files)
 */
export function canFetchLocalContext(repoRoot: string, changedPaths: string[]): boolean {
  if (!repoRoot || changedPaths.length === 0) {
    return false
  }

  // Check if at least one changed file exists locally
  for (const relativePath of changedPaths) {
    const fullPath = join(repoRoot, relativePath)
    if (existsSync(fullPath)) {
      return true
    }
  }

  return false
}
```

**Step 3: Create index.ts**

```typescript
export * from "./types"
export * from "./fetcher"
```

**Step 4: Run typecheck**

Run: `bun run compile`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pr-review/src/context/
git commit -m "feat(pr-review): add context fetcher module"
```

---

## Task 3: Write Tests for Context Fetcher

**Files:**

- Create: `packages/pr-review/test/context/fetcher.test.ts`
- Create: `packages/pr-review/test/context/fixtures/sample.ts`
- Create: `packages/pr-review/test/context/fixtures/large.txt`

**Step 1: Create test fixtures**

Create `packages/pr-review/test/context/fixtures/sample.ts`:

```typescript
export function hello() {
  return "world"
}
```

Create `packages/pr-review/test/context/fixtures/large.txt`:

```
(Generate 150KB of text - just repeat "Lorem ipsum dolor sit amet. " many times)
```

Actually, we'll generate this in the test setup.

**Step 2: Write the test file**

```typescript
import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"

const FIXTURES_DIR = join(import.meta.dir, "fixtures")

describe("context/fetcher", () => {
  beforeAll(() => {
    // Ensure fixtures directory exists
    if (!existsSync(FIXTURES_DIR)) {
      mkdirSync(FIXTURES_DIR, { recursive: true })
    }

    // Create sample.ts
    writeFileSync(
      join(FIXTURES_DIR, "sample.ts"),
      'export function hello() {\n  return "world"\n}\n',
    )

    // Create large.txt (150KB)
    const largeContent = "Lorem ipsum dolor sit amet. ".repeat(6000)
    writeFileSync(join(FIXTURES_DIR, "large.txt"), largeContent)

    // Create small.txt
    writeFileSync(join(FIXTURES_DIR, "small.txt"), "Small file content")
  })

  afterAll(() => {
    // Clean up generated fixtures
    rmSync(join(FIXTURES_DIR, "large.txt"), { force: true })
    rmSync(join(FIXTURES_DIR, "small.txt"), { force: true })
  })

  test("fetchLocalContext reads existing files", async () => {
    const { fetchLocalContext } = await import("../../src/context/fetcher")

    const result = fetchLocalContext(FIXTURES_DIR, ["sample.ts"])

    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe("sample.ts")
    expect(result.files[0].content).toContain("hello")
    expect(result.skippedFiles).toHaveLength(0)
  })

  test("fetchLocalContext skips missing files", async () => {
    const { fetchLocalContext } = await import("../../src/context/fetcher")

    const result = fetchLocalContext(FIXTURES_DIR, ["nonexistent.ts", "sample.ts"])

    expect(result.files).toHaveLength(1)
    expect(result.skippedFiles).toContain("nonexistent.ts")
    expect(result.skippedReason.get("nonexistent.ts")).toContain("not found")
  })

  test("fetchLocalContext skips files exceeding size limit", async () => {
    const { fetchLocalContext } = await import("../../src/context/fetcher")

    const result = fetchLocalContext(FIXTURES_DIR, ["large.txt"], {
      enabled: true,
      maxFileSizeKb: 100,
      maxTotalSizeKb: 500,
      include: { changedFiles: true },
    })

    expect(result.files).toHaveLength(0)
    expect(result.skippedFiles).toContain("large.txt")
    expect(result.skippedReason.get("large.txt")).toContain("too large")
  })

  test("fetchLocalContext respects total size limit", async () => {
    const { fetchLocalContext } = await import("../../src/context/fetcher")

    // small.txt is tiny, so first one should succeed
    // Then we hit the limit
    const result = fetchLocalContext(FIXTURES_DIR, ["small.txt", "sample.ts"], {
      enabled: true,
      maxFileSizeKb: 100,
      maxTotalSizeKb: 0.01, // Very small limit (10 bytes)
      include: { changedFiles: true },
    })

    expect(result.files).toHaveLength(1)
    expect(result.skippedFiles).toHaveLength(1)
    expect(result.skippedReason.get("sample.ts")).toContain("total context size limit")
  })

  test("canFetchLocalContext returns true when files exist", async () => {
    const { canFetchLocalContext } = await import("../../src/context/fetcher")

    expect(canFetchLocalContext(FIXTURES_DIR, ["sample.ts"])).toBe(true)
    expect(canFetchLocalContext(FIXTURES_DIR, ["nonexistent.ts", "sample.ts"])).toBe(true)
  })

  test("canFetchLocalContext returns false when no files exist", async () => {
    const { canFetchLocalContext } = await import("../../src/context/fetcher")

    expect(canFetchLocalContext(FIXTURES_DIR, ["nonexistent.ts"])).toBe(false)
    expect(canFetchLocalContext(FIXTURES_DIR, [])).toBe(false)
    expect(canFetchLocalContext("", ["sample.ts"])).toBe(false)
  })
})
```

**Step 3: Run tests**

Run: `bun test packages/pr-review/test/context/`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/pr-review/test/context/
git commit -m "test(pr-review): add context fetcher tests"
```

---

## Task 4: Update Prompts to Include File Context

**Files:**

- Modify: `packages/pr-review/src/ai/prompts.ts`

**Step 1: Add helper function to format file context**

Add at the top of the file (after imports):

````typescript
import type { FileContext } from "../context/types"

/**
 * Format file context for inclusion in prompts
 */
export function formatFileContext(files: FileContext[], skippedFiles: string[]): string {
  if (files.length === 0) {
    return ""
  }

  const parts: string[] = []
  parts.push("### Full File Context")
  parts.push("")
  parts.push("The following files are included in full for additional context:")
  parts.push("")

  for (const file of files) {
    const ext = file.path.split(".").pop() || ""
    parts.push(`<details>`)
    parts.push(`<summary>${file.path} (${Math.round(file.sizeBytes / 1024)}KB)</summary>`)
    parts.push("")
    parts.push("```" + ext)
    parts.push(file.content)
    parts.push("```")
    parts.push("")
    parts.push("</details>")
    parts.push("")
  }

  if (skippedFiles.length > 0) {
    parts.push(`*${skippedFiles.length} files skipped (too large or not found)*`)
    parts.push("")
  }

  return parts.join("\n")
}
````

**Step 2: Update buildMultiReviewerPrompt to accept file context**

Modify the function signature and body:

```typescript
export function buildMultiReviewerPrompt(
  pr: PRData,
  diff: string,
  reviewerPrompt: string,
  reviewerName: string,
  fileContext?: { files: FileContext[]; skippedFiles: string[] },
): string {
  const filesTable = pr.files
    .map((f) => `| ${f.path} | +${f.additions}/-${f.deletions} | ${f.changeType} |`)
    .join("\n")

  const annotatedDiff = annotateDiffWithLineNumbers(diff)
  const contextSection = fileContext
    ? formatFileContext(fileContext.files, fileContext.skippedFiles)
    : ""

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

${contextSection}

### Diff

Lines are prefixed with \`R{num}|\` for new file lines (RIGHT side) and \`L{num}|\` for old file lines (LEFT side).

\`\`\`diff
${annotatedDiff}
\`\`\`

---
You are the "${reviewerName}" reviewer. Provide your review in the JSON format specified above.`
}
```

**Step 3: Run typecheck**

Run: `bun run compile`
Expected: PASS (will have errors until we update callers)

**Step 4: Commit**

```bash
git add packages/pr-review/src/ai/prompts.ts
git commit -m "feat(pr-review): add file context to reviewer prompts"
```

---

## Task 5: Wire Context into Reviewer Runner

**Files:**

- Modify: `packages/pr-review/src/reviewers/runner.ts`
- Modify: `packages/pr-review/src/reviewers/engine.ts`

**Step 1: Update runner.ts to accept context**

Add import and update function signature:

```typescript
import type { FileContext } from "../context/types"

// Update runReviewer signature
export async function runReviewer(
  ai: AIClient,
  pr: PRData,
  diff: string,
  reviewer: ReviewerConfig,
  repoRoot: string,
  fileContext?: { files: FileContext[]; skippedFiles: string[] },
): Promise<ReviewerOutput> {
  // ... existing code, pass fileContext to runReviewerInternal
}

// Update runReviewerInternal
async function runReviewerInternal(
  ai: AIClient,
  pr: PRData,
  diff: string,
  reviewer: ReviewerConfig,
  repoRoot: string,
  fileContext?: { files: FileContext[]; skippedFiles: string[] },
): Promise<NonNullable<ReviewerOutput["review"]>> {
  const reviewerPrompt = loadReviewerPrompt(repoRoot, reviewer)
  const fullPrompt = buildMultiReviewerPrompt(pr, diff, reviewerPrompt, reviewer.name, fileContext)
  // ... rest unchanged
}
```

**Step 2: Update engine.ts to fetch and pass context**

```typescript
import { fetchLocalContext, canFetchLocalContext } from "../context/fetcher"
import type { ContextConfig } from "../config/types"

export async function runAllReviewers(
  ai: AIClient,
  pr: PRData,
  diff: string,
  config: PRReviewConfig,
  repoRoot: string,
): Promise<ReviewerOutput[]> {
  const enabledReviewers = config.reviewers.filter((reviewer) => reviewer.enabled !== false)

  if (enabledReviewers.length === 0) {
    console.warn("[pr-review] No reviewers enabled")
    return []
  }

  // Fetch file context if enabled
  let fileContext: { files: FileContext[]; skippedFiles: string[] } | undefined
  const contextConfig = config.context

  if (contextConfig?.enabled !== false) {
    const changedPaths = pr.files.filter((f) => f.changeType !== "DELETED").map((f) => f.path)

    if (canFetchLocalContext(repoRoot, changedPaths)) {
      console.log(`[pr-review] Fetching file context for ${changedPaths.length} files...`)
      const result = fetchLocalContext(repoRoot, changedPaths, contextConfig)
      fileContext = { files: result.files, skippedFiles: result.skippedFiles }
      console.log(
        `[pr-review] Loaded ${result.files.length} files (${Math.round(result.totalSizeBytes / 1024)}KB), skipped ${result.skippedFiles.length}`,
      )
    } else {
      console.log("[pr-review] Local file context not available, using diff only")
    }
  }

  console.log(`[pr-review] Running ${enabledReviewers.length} reviewers in parallel...`)

  const results = await Promise.allSettled(
    enabledReviewers.map((reviewer) => runReviewer(ai, pr, diff, reviewer, repoRoot, fileContext)),
  )

  // ... rest unchanged
}
```

**Step 3: Add import for FileContext type in engine.ts**

```typescript
import type { FileContext } from "../context/types"
```

**Step 4: Run typecheck**

Run: `bun run compile`
Expected: PASS

**Step 5: Run existing tests**

Run: `bun test packages/pr-review/test/reviewers.test.ts`
Expected: PASS (existing tests should still work)

**Step 6: Commit**

```bash
git add packages/pr-review/src/reviewers/
git commit -m "feat(pr-review): wire file context into reviewer pipeline"
```

---

## Task 6: Add --source-dir CLI Flag

**Files:**

- Modify: `packages/pr-review/src/reviewer.ts`
- Modify: `packages/pr-review/src/index.ts`

**Step 1: Add sourceDir to ReviewOptions**

In `reviewer.ts`, update the `ReviewOptions` type:

```typescript
export type ReviewOptions = {
  /** GitHub token */
  token: string
  /** Repository owner */
  owner: string
  /** Repository name */
  repo: string
  /** PR number */
  prNumber: number
  /** Path to config file or directory containing .github/pr-review.json */
  configPath?: string
  /** Model to use (e.g., "anthropic/claude-sonnet-4-20250514") */
  model?: string
  /** Dry run - don't post review */
  dryRun?: boolean
  /** Repository root path (for loading config) - deprecated, use configPath */
  repoRoot?: string
  /** Use legacy single-reviewer mode */
  legacyMode?: boolean
  /** Source directory for reading file context (defaults to configPath or cwd) */
  sourceDir?: string
}
```

**Step 2: Use sourceDir in reviewPR function**

In `reviewer.ts`, update the `reviewPR` function to use `sourceDir`:

Find where `repoRoot` is used and update:

```typescript
// Load configuration
const { config, repoRoot: configRepoRoot } = loadConfigFromPath(
  options.configPath || options.repoRoot,
)

// Use explicit sourceDir, or fall back to config directory
const sourceDir = options.sourceDir || configRepoRoot
```

Then pass `sourceDir` instead of `repoRoot` to `runAllReviewers`:

```typescript
const reviewerOutputs = await runAllReviewers(ai, pr, diff, config, sourceDir)
```

And to `verifyAndSynthesize`:

```typescript
const synthesized = await verifyAndSynthesize(ai, reviewerOutputs, config.verifier, sourceDir, pr)
```

**Step 3: Add --source-dir to CLI**

In `index.ts`, update the help text:

```typescript
  --source-dir <dir> Directory containing source files for context (defaults to --config dir or cwd)
```

Add argument parsing:

```typescript
const sourceDir = getArg("source-dir")
```

Pass to options:

```typescript
options = {
  token: getGitHubToken(),
  owner,
  repo,
  prNumber: parseInt(prNumber, 10),
  configPath,
  model,
  dryRun,
  legacyMode,
  sourceDir,
}
```

And for auto-detect mode:

```typescript
options = {
  token: getGitHubToken(),
  owner: ctx.owner,
  repo: ctx.repo,
  prNumber: ctx.number,
  configPath,
  model,
  dryRun,
  legacyMode,
  sourceDir,
}
```

**Step 4: Run typecheck**

Run: `bun run compile`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pr-review/src/reviewer.ts packages/pr-review/src/index.ts
git commit -m "feat(pr-review): add --source-dir CLI flag for file context"
```

---

## Task 7: Regenerate JSON Schema

**Files:**

- Run: `packages/pr-review/scripts/generate-schema.ts`

**Step 1: Regenerate schema**

Run: `bun run packages/pr-review/scripts/generate-schema.ts`
Expected: Updates `packages/pr-review/schema.json`

**Step 2: Verify schema includes context**

Check that `schema.json` now has the `context` property with `enabled`, `maxFileSizeKb`, `maxTotalSizeKb`, and `include` fields.

**Step 3: Commit**

```bash
git add packages/pr-review/schema.json
git commit -m "chore(pr-review): regenerate schema with context config"
```

---

## Task 8: Update README

**Files:**

- Modify: `packages/pr-review/README.md`

**Step 1: Add context section to README**

Add after the "Verifier Options" section:

```markdown
### File Context Options

Reviewers can access full file content (not just diffs) for better context:

\`\`\`json
{
"context": {
"enabled": true,
"maxFileSizeKb": 100,
"maxTotalSizeKb": 500
}
}
\`\`\`

| Option           | Default | Description                                 |
| ---------------- | ------- | ------------------------------------------- |
| `enabled`        | `true`  | Enable/disable full file context            |
| `maxFileSizeKb`  | `100`   | Skip files larger than this (KB)            |
| `maxTotalSizeKb` | `500`   | Maximum total context size across all files |

**Note:** File context requires the repository to be checked out locally (automatic in GitHub Actions with `actions/checkout`).

**CLI Usage:**
\`\`\`bash

# Review a PR with source files from a specific directory

owo-review --pr 123 --owner myorg --repo myrepo --source-dir /path/to/checkout

# Useful for testing: review a remote PR using local files

owo-review --pr 456 --owner other-org --repo other-repo --source-dir ~/code/other-repo
\`\`\`
```

**Step 2: Update "How It Works" section**

Change step 1 to:

```markdown
1. **Fetch** PR metadata, commits, diff hunks, and full file content
```

**Step 3: Commit**

```bash
git add packages/pr-review/README.md
git commit -m "docs(pr-review): document file context feature"
```

---

## Task 9: Integration Test

**Files:**

- Create: `packages/pr-review/test/context/integration.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, expect, test } from "bun:test"
import type { PRData } from "../../src/github/types"

describe("context integration", () => {
  test("buildMultiReviewerPrompt includes file context when provided", async () => {
    const { buildMultiReviewerPrompt } = await import("../../src/ai/prompts")

    const pr: PRData = {
      owner: "test",
      repo: "test",
      number: 1,
      title: "Test PR",
      body: "Test body",
      author: "tester",
      baseSha: "abc",
      headSha: "def",
      baseRef: "main",
      headRef: "feature",
      additions: 10,
      deletions: 5,
      state: "OPEN",
      createdAt: "2024-01-01",
      commits: [],
      files: [{ path: "src/test.ts", additions: 10, deletions: 5, changeType: "MODIFIED" }],
      comments: [],
      reviews: [],
    }

    const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
+import { foo } from "./foo"
 export function test() {
   return true
 }`

    const fileContext = {
      files: [
        {
          path: "src/test.ts",
          content: 'import { foo } from "./foo"\nexport function test() {\n  return true\n}',
          sizeBytes: 100,
          truncated: false,
        },
      ],
      skippedFiles: [],
    }

    const prompt = buildMultiReviewerPrompt(
      pr,
      diff,
      "You are a code reviewer.",
      "quality",
      fileContext,
    )

    expect(prompt).toContain("### Full File Context")
    expect(prompt).toContain("src/test.ts")
    expect(prompt).toContain('import { foo } from "./foo"')
    expect(prompt).toContain("<details>")
  })

  test("buildMultiReviewerPrompt works without file context", async () => {
    const { buildMultiReviewerPrompt } = await import("../../src/ai/prompts")

    const pr: PRData = {
      owner: "test",
      repo: "test",
      number: 1,
      title: "Test PR",
      body: "",
      author: "tester",
      baseSha: "abc",
      headSha: "def",
      baseRef: "main",
      headRef: "feature",
      additions: 1,
      deletions: 0,
      state: "OPEN",
      createdAt: "2024-01-01",
      commits: [],
      files: [],
      comments: [],
      reviews: [],
    }

    const prompt = buildMultiReviewerPrompt(pr, "diff content", "Review this.", "test")

    expect(prompt).not.toContain("### Full File Context")
    expect(prompt).toContain("diff content")
  })
})
```

**Step 2: Run all tests**

Run: `bun test packages/pr-review/test/`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/pr-review/test/context/integration.test.ts
git commit -m "test(pr-review): add context integration tests"
```

---

## Summary

After completing all tasks:

1. **Config schema** supports `context.enabled`, `context.maxFileSizeKb`, `context.maxTotalSizeKb`
2. **Context fetcher** reads files from local disk with size limits
3. **Prompts** include full file content in collapsible sections
4. **Reviewer pipeline** automatically fetches context when available
5. **CLI flag** `--source-dir` allows specifying where to read files from
6. **Tests** cover fetcher logic and prompt integration
7. **Docs** explain the feature and configuration

The feature is **opt-out** (enabled by default) and gracefully degrades when local files aren't available.

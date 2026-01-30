# Multi-Line PR Comments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from deprecated `position` parameter to modern `line`/`side` API and add multi-line comment range support.

**Architecture:** Update type definitions to support optional `start_line`/`start_side` for ranges, simplify position mapping (no longer need diff position calculation), and update GitHub API calls to use modern parameters.

**Tech Stack:** TypeScript, Zod schemas, GitHub REST API (Octokit), bun:test

---

## Task 1: Update Type Definitions

**Files:**
- Modify: `packages/pr-review/src/github/types.ts:56-63`
- Modify: `packages/pr-review/src/config/types.ts:80-95,100-118`

**Step 1: Update InlineCommentSchema in github/types.ts**

Add optional `start_line` and `start_side` fields for multi-line ranges:

```typescript
export const InlineCommentSchema = z.object({
  path: z.string().describe("File path relative to repo root"),
  line: z.number().describe("Line number (end line for multi-line ranges)"),
  body: z.string().describe("Comment content (markdown supported)"),
  side: z.enum(["LEFT", "RIGHT"]).default("RIGHT").describe("Which side of diff"),
  start_line: z.number().optional().describe("Start line for multi-line comment range"),
  start_side: z.enum(["LEFT", "RIGHT"]).optional().describe("Side for start line (defaults to same as side)"),
})
```

**Step 2: Update ReviewerOutput comment type in config/types.ts**

Update the comment array type in `ReviewerOutput` (around line 85-91):

```typescript
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
      start_line?: number
      start_side?: "LEFT" | "RIGHT"
    }>
  }
  error?: string
  durationMs: number
}
```

**Step 3: Update SynthesizedReview comment type in config/types.ts**

Update the comment array type in `SynthesizedReview` (around line 102-108):

```typescript
export type SynthesizedReview = {
  overview: string
  comments: Array<{
    path: string
    line: number
    body: string
    side: "LEFT" | "RIGHT"
    severity: "critical" | "warning" | "info"
    reviewer: string
    start_line?: number
    start_side?: "LEFT" | "RIGHT"
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

**Step 4: Run typecheck**

Run: `bun run compile`
Expected: Type errors in files that use these types (we'll fix in subsequent tasks)

---

## Task 2: Simplify Position Mapping

**Files:**
- Modify: `packages/pr-review/src/diff/position.ts`
- Create: `packages/pr-review/test/diff/position.test.ts`

The key insight: with modern `line`/`side` API, we don't need to calculate diff positions anymore! We just need to verify the line exists in the diff.

**Step 1: Write tests for new position validation**

```typescript
import { describe, expect, test } from "bun:test"
import { validateCommentLines, mapCommentsToLines } from "../../src/diff/position"
import type { InlineComment } from "../../src/github/types"

const SAMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..abcdefg 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,8 @@ export function authenticate(user: string) {
   const token = generateToken(user)
+  // New validation
+  validateToken(token)
   return token
 }
@@ -20,3 +22,7 @@ function generateToken(user: string) {
   return hash(user + Date.now())
 }
+
+function validateToken(token: string) {
+  if (!token) throw new Error("Invalid token")
+}
`

describe("diff/position", () => {
  describe("validateCommentLines", () => {
    test("validates single line in diff (RIGHT side)", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 12, "RIGHT")
      expect(result.valid).toBe(true)
    })

    test("validates single line in diff (LEFT side)", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 10, "LEFT")
      expect(result.valid).toBe(true)
    })

    test("rejects line not in diff", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 100, "RIGHT")
      expect(result.valid).toBe(false)
    })

    test("validates multi-line range", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 13, "RIGHT", 11, "RIGHT")
      expect(result.valid).toBe(true)
    })

    test("rejects range where start_line not in diff", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 13, "RIGHT", 5, "RIGHT")
      expect(result.valid).toBe(false)
    })

    test("rejects unknown file", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "unknown.ts", 10, "RIGHT")
      expect(result.valid).toBe(false)
    })
  })

  describe("mapCommentsToLines", () => {
    test("maps valid single-line comments", () => {
      const comments: InlineComment[] = [
        { path: "src/auth.ts", line: 12, body: "Nice!", side: "RIGHT" },
      ]
      const { mapped, unmapped } = mapCommentsToLines(SAMPLE_DIFF, comments)
      expect(mapped).toHaveLength(1)
      expect(unmapped).toHaveLength(0)
      expect(mapped[0].line).toBe(12)
    })

    test("maps valid multi-line comments", () => {
      const comments: InlineComment[] = [
        { path: "src/auth.ts", line: 13, body: "This block", side: "RIGHT", start_line: 11, start_side: "RIGHT" },
      ]
      const { mapped, unmapped } = mapCommentsToLines(SAMPLE_DIFF, comments)
      expect(mapped).toHaveLength(1)
      expect(mapped[0].start_line).toBe(11)
      expect(mapped[0].line).toBe(13)
    })

    test("moves invalid comments to unmapped", () => {
      const comments: InlineComment[] = [
        { path: "src/auth.ts", line: 100, body: "Not in diff", side: "RIGHT" },
      ]
      const { mapped, unmapped } = mapCommentsToLines(SAMPLE_DIFF, comments)
      expect(mapped).toHaveLength(0)
      expect(unmapped).toHaveLength(1)
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test packages/pr-review/test/diff/position.test.ts`
Expected: FAIL (functions don't exist yet)

**Step 3: Implement new position validation**

Replace the content of `packages/pr-review/src/diff/position.ts`:

```typescript
import parseDiff from "parse-diff"
import type { InlineComment } from "../github/types"

type ValidationResult = {
  valid: boolean
  reason?: string
}

/**
 * Check if a line (or line range) exists in the diff for a given file
 * 
 * With modern GitHub API, we use actual line numbers (not diff positions).
 * This function validates that the lines exist in the diff.
 */
export function validateCommentLines(
  diffContent: string,
  filePath: string,
  line: number,
  side: "LEFT" | "RIGHT",
  startLine?: number,
  startSide?: "LEFT" | "RIGHT",
): ValidationResult {
  const files = parseDiff(diffContent)

  const file = files.find((f) => {
    const toPath = f.to?.replace(/^b\//, "")
    const fromPath = f.from?.replace(/^a\//, "")
    return toPath === filePath || fromPath === filePath
  })

  if (!file) {
    return { valid: false, reason: `File ${filePath} not found in diff` }
  }

  // Collect all line numbers present in the diff
  const rightLines = new Set<number>()
  const leftLines = new Set<number>()

  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      if ((change.type === "add" || change.type === "normal") && "ln2" in change) {
        rightLines.add(change.ln2)
      }
      if ((change.type === "del" || change.type === "normal") && "ln1" in change) {
        leftLines.add(change.ln1)
      }
    }
  }

  // Validate end line
  const endLineSet = side === "RIGHT" ? rightLines : leftLines
  if (!endLineSet.has(line)) {
    return { valid: false, reason: `Line ${line} not found in diff (${side} side)` }
  }

  // Validate start line if multi-line
  if (startLine !== undefined) {
    const startLineSet = (startSide || side) === "RIGHT" ? rightLines : leftLines
    if (!startLineSet.has(startLine)) {
      return { valid: false, reason: `Start line ${startLine} not found in diff` }
    }
  }

  return { valid: true }
}

/**
 * Validate and map comments - returns comments with line numbers (no position conversion needed)
 * 
 * Unlike the old position-based approach, we just validate lines exist in the diff.
 * The GitHub API now accepts actual line numbers directly.
 */
export function mapCommentsToLines(
  diffContent: string,
  comments: InlineComment[],
): {
  mapped: InlineComment[]
  unmapped: InlineComment[]
} {
  const mapped: InlineComment[] = []
  const unmapped: InlineComment[] = []

  for (const comment of comments) {
    const result = validateCommentLines(
      diffContent,
      comment.path,
      comment.line,
      comment.side,
      comment.start_line,
      comment.start_side,
    )

    if (result.valid) {
      mapped.push(comment)
    } else {
      unmapped.push(comment)
    }
  }

  return { mapped, unmapped }
}

/**
 * @deprecated Use mapCommentsToLines instead. Kept for backward compatibility.
 */
export function mapCommentsToPositions(
  diffContent: string,
  comments: InlineComment[],
): {
  mapped: Array<InlineComment & { position: number }>
  unmapped: InlineComment[]
} {
  const { mapped, unmapped } = mapCommentsToLines(diffContent, comments)
  
  // For backward compatibility, add a dummy position (not used by modern API)
  return {
    mapped: mapped.map((c, i) => ({ ...c, position: i + 1 })),
    unmapped,
  }
}

/**
 * Format unmapped comments for inclusion in overview
 */
export function formatUnmappedComments(unmapped: InlineComment[]): string {
  if (unmapped.length === 0) return ""

  const commentLines: string[] = []

  for (const comment of unmapped) {
    const lineRange = comment.start_line 
      ? `${comment.start_line}-${comment.line}`
      : `${comment.line}`
    commentLines.push(`### \`${comment.path}:${lineRange}\``)
    commentLines.push("")
    commentLines.push(comment.body)
    commentLines.push("")
  }

  const lines = [
    "",
    "<details>",
    `<summary>Additional Notes (${unmapped.length} comments for lines not in diff)</summary>`,
    "",
    ...commentLines,
    "</details>",
  ]

  return lines.join("\n")
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test packages/pr-review/test/diff/position.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pr-review/src/diff/position.ts packages/pr-review/test/diff/position.test.ts
git commit -m "refactor(pr-review): simplify position mapping for modern GitHub API"
```

---

## Task 3: Update GitHub Review API Calls

**Files:**
- Modify: `packages/pr-review/src/github/review.ts:83-107,138-149`

**Step 1: Update addReviewComments function signature and implementation**

Change from `position` to `line`/`side` with optional range support:

```typescript
export async function addReviewComments(
  client: GitHubClient,
  prNumber: number,
  commitId: string,
  comments: Array<{
    path: string
    line: number
    body: string
    side: "LEFT" | "RIGHT"
    start_line?: number
    start_side?: "LEFT" | "RIGHT"
  }>,
): Promise<void> {
  for (const comment of comments) {
    try {
      await client.rest.pulls.createReviewComment({
        owner: client.owner,
        repo: client.repo,
        pull_number: prNumber,
        commit_id: commitId,
        path: comment.path,
        line: comment.line,
        side: comment.side,
        ...(comment.start_line && {
          start_line: comment.start_line,
          start_side: comment.start_side || comment.side,
        }),
        body: `${COMMENT_MARKER}\n${comment.body}`,
      })
    } catch (err: any) {
      const lineRange = comment.start_line
        ? `${comment.start_line}-${comment.line}`
        : `${comment.line}`
      console.warn(
        `[pr-review] Failed to add comment on ${comment.path}:${lineRange}:`,
        err.message,
      )
    }
  }
}
```

**Step 2: Update submitReview function to use new comment format**

Update the `comments` parameter in `createReview` call (around line 138-149):

```typescript
  const { data } = await client.rest.pulls.createReview({
    owner: client.owner,
    repo: client.repo,
    pull_number: prNumber,
    commit_id: commitId,
    body,
    event: review.event,
    comments: mappedComments.map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side,
      ...(c.start_line && {
        start_line: c.start_line,
        start_side: c.start_side || c.side,
      }),
      body: `${COMMENT_MARKER}\n${c.body}`,
    })),
  })
```

**Step 3: Run typecheck**

Run: `bun run compile`
Expected: May have errors in reviewer.ts (we'll fix next)

---

## Task 4: Update Reviewer Integration

**Files:**
- Modify: `packages/pr-review/src/reviewer.ts:126,145-151`

**Step 1: Update comment mapping in reviewPR function**

Change from `mapCommentsToPositions` to `mapCommentsToLines` and update the mapped comment format:

First, update the import at the top of the file:

```typescript
import { mapCommentsToLines, formatUnmappedComments } from "./diff/position"
```

Then update the mapping call (around line 126):

```typescript
    // Map comments to validate they exist in diff
    const { mapped, unmapped } = mapCommentsToLines(diff, review.comments)
```

Then update the submitReview call (around line 145-151):

```typescript
    // Submit review
    console.log("[pr-review] Submitting review...")
    const result = await submitReview(
      github,
      options.prNumber,
      pr.headSha,
      review,
      mapped.map((c) => ({
        path: c.path,
        line: c.line,
        body: c.body,
        side: c.side,
        start_line: c.start_line,
        start_side: c.start_side,
      })),
    )
```

**Step 2: Update legacy review function similarly**

In `runLegacyReview` function (around line 279-304), update the mapping:

```typescript
  // Map comments to validate they exist in diff
  const { mapped, unmapped } = mapCommentsToLines(diff, review.comments)

  // ... unmapped handling stays the same ...

  // Submit review
  console.log("[pr-review] Submitting review...")
  const { submitReview: submitLegacyReview } = await import("./github/review")
  const result = await submitLegacyReview(
    github,
    options.prNumber,
    pr.headSha,
    review,
    mapped.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
      side: c.side,
      start_line: c.start_line,
      start_side: c.start_side,
    })),
  )
```

**Step 3: Run typecheck**

Run: `bun run compile`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/pr-review/src/github/review.ts packages/pr-review/src/reviewer.ts
git commit -m "feat(pr-review): use modern line/side API instead of deprecated position"
```

---

## Task 5: Update AI Prompts for Multi-Line Support

**Files:**
- Modify: `packages/pr-review/src/ai/prompts.ts:42-56,118-125`

**Step 1: Update JSON format in buildReviewPrompt**

Update the response format section to include multi-line support:

```typescript
## Response Format

Respond with valid JSON in this exact format:
\`\`\`json
{
  "overview": "Your markdown overview here...",
  "comments": [
    {
      "path": "path/to/file.ts",
      "line": 42,
      "body": "Your comment here",
      "side": "RIGHT"
    },
    {
      "path": "path/to/file.ts",
      "start_line": 10,
      "line": 15,
      "body": "This entire block needs refactoring because...",
      "side": "RIGHT"
    }
  ],
  "event": "COMMENT"
}
\`\`\`

**Important:**
- \`line\` is the line number (or end line for multi-line comments)
- \`start_line\` (optional) marks the beginning of a multi-line range
- \`side\` should be "RIGHT" for new/modified code, "LEFT" for deleted code
- Use multi-line comments when feedback applies to a block of code (e.g., a function, loop, or related lines)
- Only comment on lines that appear in the diff
- Be constructive and specific
- Focus on: bugs, security, performance, readability, best practices
```

**Step 2: Update buildQuickReviewPrompt similarly**

Add the multi-line format to the quick review prompt as well.

**Step 3: Commit**

```bash
git add packages/pr-review/src/ai/prompts.ts
git commit -m "docs(pr-review): update AI prompts to support multi-line comment ranges"
```

---

## Task 6: Update Response Parser

**Files:**
- Modify: `packages/pr-review/src/reviewers/runner.ts:94-103`

**Step 1: Update parseReviewerResponse to handle start_line**

```typescript
    return {
      overview: parsed.overview || "",
      comments: (parsed.comments || []).map((comment: any) => ({
        path: comment.path,
        line: comment.line,
        body: comment.body,
        side: comment.side || "RIGHT",
        severity: comment.severity || "warning",
        ...(comment.start_line && {
          start_line: comment.start_line,
          start_side: comment.start_side || comment.side || "RIGHT",
        }),
      })),
    }
```

**Step 2: Commit**

```bash
git add packages/pr-review/src/reviewers/runner.ts
git commit -m "feat(pr-review): parse multi-line comment ranges from reviewer responses"
```

---

## Task 7: Update Existing Tests

**Files:**
- Modify: `packages/pr-review/test/reviewers.test.ts`

**Step 1: Add test for multi-line comments**

Add a new test case:

```typescript
  test("synthesizeReview handles multi-line comments", async () => {
    const { synthesizeReview } = await import("../src/reviewers/engine")

    const outputs: ReviewerOutput[] = [
      {
        name: "quality",
        success: true,
        review: {
          overview: "Found a block that needs work",
          comments: [
            {
              path: "src/auth.ts",
              line: 50,
              start_line: 42,
              body: "This entire function needs refactoring",
              side: "RIGHT",
              severity: "warning",
            },
          ],
        },
        durationMs: 1000,
      },
    ]

    const result = synthesizeReview(outputs)
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].start_line).toBe(42)
    expect(result.comments[0].line).toBe(50)
  })
```

**Step 2: Run all tests**

Run: `bun test packages/pr-review/`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/pr-review/test/reviewers.test.ts
git commit -m "test(pr-review): add test for multi-line comment handling"
```

---

## Task 8: Final Verification

**Step 1: Run full test suite**

Run: `bun test packages/pr-review/`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `bun run compile`
Expected: PASS

**Step 3: Run linter**

Run: `bun run lint`
Expected: PASS (or only unrelated warnings)

**Step 4: Build**

Run: `bun run build`
Expected: PASS

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/github/types.ts` | Add `start_line`, `start_side` to InlineCommentSchema |
| `src/config/types.ts` | Add range fields to ReviewerOutput and SynthesizedReview |
| `src/diff/position.ts` | Replace position calculation with line validation |
| `src/github/review.ts` | Use `line`/`side` API instead of deprecated `position` |
| `src/reviewer.ts` | Use new mapCommentsToLines function |
| `src/ai/prompts.ts` | Document multi-line format for AI reviewers |
| `src/reviewers/runner.ts` | Parse start_line from responses |
| `test/diff/position.test.ts` | New tests for line validation |
| `test/reviewers.test.ts` | Add multi-line comment test |

## Migration Notes

- The deprecated `position` parameter is no longer used
- Existing single-line comments continue to work (start_line is optional)
- AI reviewers will start using multi-line ranges when appropriate
- No breaking changes to external API

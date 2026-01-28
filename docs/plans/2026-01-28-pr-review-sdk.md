# PR Review SDK Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone PR reviewer using opencode SDK + Octokit, replacing the plugin-based approach that required forking opencode.

**Architecture:**

- Use `@opencode-ai/sdk` to run the AI agent programmatically
- Use `@octokit/rest` for all GitHub API interactions (fetch PR, post reviews)
- Clean separation: Octokit handles GitHub, SDK handles AI, our code orchestrates
- Can run as GitHub Action OR standalone CLI

**Tech Stack:**

- `@opencode-ai/sdk` - AI agent
- `@octokit/rest` - GitHub API
- `bun` - Runtime
- `zod` - Schema validation
- `parse-diff` - Diff position mapping (reuse from github-reviewer)

**Reference Code:**

- `packages/github-reviewer/` - Our existing plugin-based implementation
- `/Users/jim/Github/opencode/packages/opencode/src/cli/cmd/github.ts` - opencode's GitHub command (excellent patterns for PR/issue handling)

---

## Architecture Overview

```
packages/pr-review/
├── src/
│   ├── index.ts              # Main entry point & CLI
│   ├── reviewer.ts           # Core review orchestration
│   ├── github/
│   │   ├── client.ts         # Octokit wrapper
│   │   ├── pr.ts             # PR fetching (GraphQL + REST)
│   │   ├── review.ts         # Review posting/updating
│   │   └── types.ts          # GitHub-specific types
│   ├── ai/
│   │   ├── client.ts         # opencode SDK wrapper
│   │   ├── prompts.ts        # Review prompts
│   │   └── parser.ts         # Parse AI response to review format
│   └── diff/
│       └── position.ts       # Line-to-position mapping (from github-reviewer)
├── action.yml                # GitHub Action definition
├── package.json
└── tsconfig.json
```

---

## Task 1: Project Setup

**Files:**

- Create: `packages/pr-review/package.json`
- Create: `packages/pr-review/tsconfig.json`
- Create: `packages/pr-review/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@owo/pr-review",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "owo-review": "./dist/index.js"
  },
  "scripts": {
    "make": "bun build ./src/index.ts --outdir ./dist --target node --external '@opencode-ai/sdk' --external '@octokit/rest' --external '@octokit/graphql' --external 'zod' --external 'parse-diff'",
    "compile": "tsgo --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@octokit/graphql": "^8.2.1",
    "@octokit/rest": "^21.1.1",
    "@opencode-ai/sdk": "^0.1.0",
    "parse-diff": "^0.11.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@types/bun": "latest",
    "typescript": "^5.8.2"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create minimal entry point**

```typescript
#!/usr/bin/env bun
// packages/pr-review/src/index.ts

console.log("@owo/pr-review - PR Review with opencode SDK")

// TODO: Implement CLI
export {}
```

**Step 4: Install dependencies**

Run: `bun install`

**Step 5: Verify build**

Run: `bun run make` in `packages/pr-review`
Expected: `dist/index.js` created

**Step 6: Commit**

```bash
git add packages/pr-review/
git commit -m "feat(pr-review): scaffold new package with SDK approach"
```

---

## Task 2: GitHub Types & Client

**Files:**

- Create: `packages/pr-review/src/github/types.ts`
- Create: `packages/pr-review/src/github/client.ts`

**Step 1: Create GitHub types**

Port and enhance types from opencode's github.ts:

```typescript
// packages/pr-review/src/github/types.ts
import { z } from "zod"

/**
 * PR context - minimal info needed to review
 */
export type PRContext = {
  owner: string
  repo: string
  number: number
  title: string
  body: string
  author: string
  baseSha: string
  headSha: string
  baseRef: string
  headRef: string
}

/**
 * Full PR data from GraphQL
 */
export type PRData = PRContext & {
  additions: number
  deletions: number
  state: string
  createdAt: string
  commits: Array<{
    oid: string
    message: string
    author: { name: string; email: string }
  }>
  files: Array<{
    path: string
    additions: number
    deletions: number
    changeType: string
  }>
  comments: Array<{
    id: string
    body: string
    author: string
    createdAt: string
  }>
  reviews: Array<{
    id: number
    author: string
    body: string
    state: string
    submittedAt: string
  }>
}

/**
 * Inline comment for review
 */
export const InlineCommentSchema = z.object({
  path: z.string().describe("File path relative to repo root"),
  line: z.number().describe("Line number in the NEW version of the file"),
  body: z.string().describe("Comment content (markdown supported)"),
  side: z.enum(["LEFT", "RIGHT"]).default("RIGHT").describe("Which side of diff"),
})

export type InlineComment = z.infer<typeof InlineCommentSchema>

/**
 * Review to submit
 */
export const ReviewSchema = z.object({
  overview: z.string().describe("Markdown overview/summary"),
  comments: z.array(InlineCommentSchema).default([]),
  event: z.enum(["COMMENT", "APPROVE", "REQUEST_CHANGES"]).default("COMMENT"),
})

export type Review = z.infer<typeof ReviewSchema>

/**
 * Existing review on PR (for updates)
 */
export type ExistingReview = {
  id: number
  commentIds: number[]
}
```

**Step 2: Create GitHub client**

```typescript
// packages/pr-review/src/github/client.ts
import { Octokit } from "@octokit/rest"
import { graphql } from "@octokit/graphql"

export type GitHubClient = {
  rest: Octokit
  graphql: typeof graphql
  owner: string
  repo: string
}

/**
 * Create GitHub client from token
 */
export function createGitHubClient(options: {
  token: string
  owner: string
  repo: string
}): GitHubClient {
  const rest = new Octokit({ auth: options.token })
  const gql = graphql.defaults({
    headers: { authorization: `token ${options.token}` },
  })

  return {
    rest,
    graphql: gql,
    owner: options.owner,
    repo: options.repo,
  }
}

/**
 * Get token from environment
 */
export function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required")
  }
  return token
}

/**
 * Parse owner/repo from GITHUB_REPOSITORY env var
 */
export function parseGitHubRepository(): { owner: string; repo: string } {
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) {
    throw new Error("GITHUB_REPOSITORY environment variable is required")
  }
  const [owner, repo] = repository.split("/")
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY format: ${repository}`)
  }
  return { owner, repo }
}
```

**Step 3: Verify types compile**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pr-review/src/github/
git commit -m "feat(pr-review): add GitHub types and client"
```

---

## Task 3: PR Fetching with GraphQL

**Files:**

- Create: `packages/pr-review/src/github/pr.ts`

**Step 1: Create PR fetching module**

Port the GraphQL query from opencode's github.ts:

```typescript
// packages/pr-review/src/github/pr.ts
import type { GitHubClient } from "./client"
import type { PRData, PRContext } from "./types"

// GraphQL query for PR data (from opencode github.ts)
const PR_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      title
      body
      author { login }
      baseRefName
      headRefName
      baseRefOid
      headRefOid
      createdAt
      additions
      deletions
      state
      commits(first: 100) {
        totalCount
        nodes {
          commit {
            oid
            message
            author { name email }
          }
        }
      }
      files(first: 100) {
        nodes {
          path
          additions
          deletions
          changeType
        }
      }
      comments(first: 100) {
        nodes {
          id
          databaseId
          body
          author { login }
          createdAt
        }
      }
      reviews(first: 100) {
        nodes {
          id
          databaseId
          author { login }
          body
          state
          submittedAt
        }
      }
    }
  }
}
`

type PRQueryResponse = {
  repository: {
    pullRequest: {
      title: string
      body: string
      author: { login: string }
      baseRefName: string
      headRefName: string
      baseRefOid: string
      headRefOid: string
      createdAt: string
      additions: number
      deletions: number
      state: string
      commits: {
        totalCount: number
        nodes: Array<{
          commit: {
            oid: string
            message: string
            author: { name: string; email: string }
          }
        }>
      }
      files: {
        nodes: Array<{
          path: string
          additions: number
          deletions: number
          changeType: string
        }>
      }
      comments: {
        nodes: Array<{
          id: string
          databaseId: string
          body: string
          author: { login: string }
          createdAt: string
        }>
      }
      reviews: {
        nodes: Array<{
          id: string
          databaseId: string
          author: { login: string }
          body: string
          state: string
          submittedAt: string
        }>
      }
    }
  }
}

/**
 * Fetch full PR data via GraphQL
 */
export async function fetchPR(client: GitHubClient, prNumber: number): Promise<PRData> {
  const result = await client.graphql<PRQueryResponse>(PR_QUERY, {
    owner: client.owner,
    repo: client.repo,
    number: prNumber,
  })

  const pr = result.repository.pullRequest
  if (!pr) {
    throw new Error(`PR #${prNumber} not found`)
  }

  return {
    owner: client.owner,
    repo: client.repo,
    number: prNumber,
    title: pr.title,
    body: pr.body || "",
    author: pr.author.login,
    baseSha: pr.baseRefOid,
    headSha: pr.headRefOid,
    baseRef: pr.baseRefName,
    headRef: pr.headRefName,
    additions: pr.additions,
    deletions: pr.deletions,
    state: pr.state,
    createdAt: pr.createdAt,
    commits: pr.commits.nodes.map((n) => ({
      oid: n.commit.oid,
      message: n.commit.message,
      author: n.commit.author,
    })),
    files: pr.files.nodes,
    comments: pr.comments.nodes.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author.login,
      createdAt: c.createdAt,
    })),
    reviews: pr.reviews.nodes.map((r) => ({
      id: parseInt(r.databaseId),
      author: r.author.login,
      body: r.body,
      state: r.state,
      submittedAt: r.submittedAt,
    })),
  }
}

/**
 * Get PR diff via REST API
 */
export async function fetchPRDiff(client: GitHubClient, prNumber: number): Promise<string> {
  const { data } = await client.rest.pulls.get({
    owner: client.owner,
    repo: client.repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  })
  // When format is "diff", data is a string
  return data as unknown as string
}

/**
 * Get minimal PR context from GitHub Actions environment
 */
export function getPRContextFromEnv(): PRContext | null {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) return null

  try {
    const fs = require("fs")
    const event = JSON.parse(fs.readFileSync(eventPath, "utf-8"))
    const pr = event.pull_request
    if (!pr) return null

    const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/")

    return {
      owner,
      repo,
      number: pr.number,
      title: pr.title,
      body: pr.body || "",
      author: pr.user.login,
      baseSha: pr.base.sha,
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      headRef: pr.head.ref,
    }
  } catch {
    return null
  }
}
```

**Step 2: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/pr-review/src/github/pr.ts
git commit -m "feat(pr-review): add PR fetching with GraphQL"
```

---

## Task 4: Review Posting

**Files:**

- Create: `packages/pr-review/src/github/review.ts`

**Step 1: Create review posting module**

Port from github-reviewer with improvements:

```typescript
// packages/pr-review/src/github/review.ts
import type { GitHubClient } from "./client"
import type { Review, InlineComment, ExistingReview } from "./types"

// Marker to identify our reviews for updates
const REVIEW_MARKER = "<!-- owo-pr-review -->"

/**
 * Get the review marker
 */
export function getReviewMarker(): string {
  return REVIEW_MARKER
}

/**
 * Find existing review by marker
 */
export async function findExistingReview(
  client: GitHubClient,
  prNumber: number,
): Promise<ExistingReview | null> {
  try {
    const { data: reviews } = await client.rest.pulls.listReviews({
      owner: client.owner,
      repo: client.repo,
      pull_number: prNumber,
      per_page: 100,
    })

    const ourReview = reviews.find((r) => r.body?.includes(REVIEW_MARKER))
    if (!ourReview) return null

    const { data: allComments } = await client.rest.pulls.listReviewComments({
      owner: client.owner,
      repo: client.repo,
      pull_number: prNumber,
      per_page: 100,
    })

    const reviewComments = allComments.filter((c) => c.pull_request_review_id === ourReview.id)

    return {
      id: ourReview.id,
      commentIds: reviewComments.map((c) => c.id),
    }
  } catch (error) {
    console.error("[pr-review] Error finding existing review:", error)
    return null
  }
}

/**
 * Delete review comments
 */
export async function deleteReviewComments(
  client: GitHubClient,
  commentIds: number[],
): Promise<void> {
  await Promise.all(
    commentIds.map((id) =>
      client.rest.pulls
        .deleteReviewComment({
          owner: client.owner,
          repo: client.repo,
          comment_id: id,
        })
        .catch((err) => {
          console.warn(`[pr-review] Failed to delete comment ${id}:`, err.message)
        }),
    ),
  )
}

/**
 * Update existing review body
 */
export async function updateReviewBody(
  client: GitHubClient,
  prNumber: number,
  reviewId: number,
  body: string,
): Promise<void> {
  await client.rest.pulls.updateReview({
    owner: client.owner,
    repo: client.repo,
    pull_number: prNumber,
    review_id: reviewId,
    body,
  })
}

/**
 * Add comments to a PR (standalone, not part of a review)
 */
export async function addReviewComments(
  client: GitHubClient,
  prNumber: number,
  commitId: string,
  comments: Array<{ path: string; position: number; body: string }>,
): Promise<void> {
  for (const comment of comments) {
    try {
      await client.rest.pulls.createReviewComment({
        owner: client.owner,
        repo: client.repo,
        pull_number: prNumber,
        commit_id: commitId,
        path: comment.path,
        position: comment.position,
        body: comment.body,
      })
    } catch (err: any) {
      console.warn(
        `[pr-review] Failed to add comment on ${comment.path}:${comment.position}:`,
        err.message,
      )
    }
  }
}

/**
 * Submit or update a review
 */
export async function submitReview(
  client: GitHubClient,
  prNumber: number,
  commitId: string,
  review: Review,
  mappedComments: Array<{ path: string; position: number; body: string }>,
): Promise<{ reviewId: number; reviewUrl: string; isUpdate: boolean }> {
  // Build final body with marker
  const body = `${review.overview}\n\n${REVIEW_MARKER}\n---\n*Reviewed by [owo-pr-review](https://github.com/RawToast/owo) | ${mappedComments.length} inline comments*`

  // Check for existing review
  const existing = await findExistingReview(client, prNumber)

  if (existing) {
    // Update existing review
    if (existing.commentIds.length > 0) {
      await deleteReviewComments(client, existing.commentIds)
    }

    await updateReviewBody(client, prNumber, existing.id, body)

    if (mappedComments.length > 0) {
      await addReviewComments(client, prNumber, commitId, mappedComments)
    }

    return {
      reviewId: existing.id,
      reviewUrl: `https://github.com/${client.owner}/${client.repo}/pull/${prNumber}#pullrequestreview-${existing.id}`,
      isUpdate: true,
    }
  }

  // Create new review
  const { data } = await client.rest.pulls.createReview({
    owner: client.owner,
    repo: client.repo,
    pull_number: prNumber,
    commit_id: commitId,
    body,
    event: review.event,
    comments: mappedComments,
  })

  return {
    reviewId: data.id,
    reviewUrl: `https://github.com/${client.owner}/${client.repo}/pull/${prNumber}#pullrequestreview-${data.id}`,
    isUpdate: false,
  }
}
```

**Step 2: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/pr-review/src/github/review.ts
git commit -m "feat(pr-review): add review posting with update support"
```

---

## Task 5: Diff Position Mapping

**Files:**

- Create: `packages/pr-review/src/diff/position.ts`

**Step 1: Create diff position mapping**

Port from github-reviewer:

```typescript
// packages/pr-review/src/diff/position.ts
import parseDiff from "parse-diff"
import type { InlineComment } from "../github/types"

/**
 * Map a file line number to a diff position
 *
 * GitHub API requires "position" which is the line number within the diff hunk,
 * NOT the actual file line number.
 */
export function mapLineToPosition(
  diffContent: string,
  filePath: string,
  lineNumber: number,
  side: "LEFT" | "RIGHT" = "RIGHT",
): number | null {
  const files = parseDiff(diffContent)

  const file = files.find((f) => {
    const toPath = f.to?.replace(/^b\//, "")
    const fromPath = f.from?.replace(/^a\//, "")
    return toPath === filePath || fromPath === filePath
  })

  if (!file) return null

  let position = 0

  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      position++

      if (side === "RIGHT") {
        if ((change.type === "add" || change.type === "normal") && "ln2" in change) {
          if (change.ln2 === lineNumber) return position
        }
      } else {
        if ((change.type === "del" || change.type === "normal") && "ln1" in change) {
          if (change.ln1 === lineNumber) return position
        }
      }
    }
  }

  return null
}

/**
 * Map multiple comments to their diff positions
 */
export function mapCommentsToPositions(
  diffContent: string,
  comments: InlineComment[],
): {
  mapped: Array<InlineComment & { position: number }>
  unmapped: InlineComment[]
} {
  const mapped: Array<InlineComment & { position: number }> = []
  const unmapped: InlineComment[] = []

  for (const comment of comments) {
    const position = mapLineToPosition(diffContent, comment.path, comment.line, comment.side)

    if (position !== null) {
      mapped.push({ ...comment, position })
    } else {
      unmapped.push(comment)
    }
  }

  return { mapped, unmapped }
}

/**
 * Format unmapped comments for inclusion in overview
 */
export function formatUnmappedComments(unmapped: InlineComment[]): string {
  if (unmapped.length === 0) return ""

  const lines = [
    "",
    "## Additional Notes",
    "",
    "*The following comments are for lines not in the current diff:*",
    "",
  ]

  for (const comment of unmapped) {
    lines.push(`### \`${comment.path}:${comment.line}\``)
    lines.push("")
    lines.push(comment.body)
    lines.push("")
  }

  return lines.join("\n")
}
```

**Step 2: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/pr-review/src/diff/
git commit -m "feat(pr-review): add diff position mapping"
```

---

## Task 6: AI Client with opencode SDK

**Files:**

- Create: `packages/pr-review/src/ai/client.ts`
- Create: `packages/pr-review/src/ai/prompts.ts`

**Step 1: Create AI client wrapper**

```typescript
// packages/pr-review/src/ai/client.ts
import { createOpencode } from "@opencode-ai/sdk"

export type AIClient = Awaited<ReturnType<typeof createOpencode>>

/**
 * Create opencode AI client
 */
export async function createAIClient(): Promise<AIClient> {
  return await createOpencode()
}

/**
 * Send a prompt and get response
 */
export async function prompt(
  client: AIClient,
  message: string,
  options?: {
    sessionId?: string
    model?: { providerID: string; modelID: string }
  },
): Promise<{ sessionId: string; response: string }> {
  // Create or reuse session
  const session = options?.sessionId
    ? { id: options.sessionId }
    : (await client.client.session.create()).data

  // Send prompt
  const result = await client.client.session.prompt({
    path: { id: session.id },
    body: {
      parts: [{ type: "text", text: message }],
      ...(options?.model && { model: options.model }),
    },
  })

  // Extract text response
  const textPart = result.data.parts?.find((p: any) => p.type === "text")
  if (!textPart || textPart.type !== "text") {
    throw new Error("No text response from AI")
  }

  return {
    sessionId: session.id,
    response: textPart.text,
  }
}

/**
 * Close the AI client
 */
export function closeAIClient(client: AIClient): void {
  client.server.close()
}
```

**Step 2: Create review prompts**

```typescript
// packages/pr-review/src/ai/prompts.ts
import type { PRData } from "../github/types"

/**
 * Build the review prompt for the AI
 */
export function buildReviewPrompt(pr: PRData, diff: string): string {
  const filesTable = pr.files
    .map((f) => `| ${f.path} | +${f.additions}/-${f.deletions} | ${f.changeType} |`)
    .join("\n")

  return `You are a senior code reviewer. Review this pull request thoroughly.

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

## Your Task

Provide a code review with:

1. **Overview** - A summary of the changes and overall assessment
2. **Inline Comments** - Specific feedback on code lines

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
    }
  ],
  "event": "COMMENT"
}
\`\`\`

**Important:**
- \`line\` must be a line number in the NEW version of the file (shown with + in diff)
- \`side\` should be "RIGHT" for new code, "LEFT" for deleted code
- Only comment on lines that appear in the diff
- Be constructive and specific
- Focus on: bugs, security, performance, readability, best practices`
}

/**
 * Build a simpler prompt for quick reviews
 */
export function buildQuickReviewPrompt(pr: PRData, diff: string): string {
  return `Review this PR briefly. Focus on critical issues only.

**${pr.title}** by ${pr.author}
+${pr.additions}/-${pr.deletions} lines

\`\`\`diff
${diff}
\`\`\`

Respond with JSON:
\`\`\`json
{
  "overview": "Brief summary...",
  "comments": [],
  "event": "COMMENT"
}
\`\`\``
}
```

**Step 3: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pr-review/src/ai/
git commit -m "feat(pr-review): add AI client and review prompts"
```

---

## Task 7: Response Parser

**Files:**

- Create: `packages/pr-review/src/ai/parser.ts`

**Step 1: Create response parser**

````typescript
// packages/pr-review/src/ai/parser.ts
import { ReviewSchema, type Review } from "../github/types"

/**
 * Parse AI response to Review format
 */
export function parseReviewResponse(response: string): Review {
  // Try to extract JSON from response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : response

  try {
    const parsed = JSON.parse(jsonStr.trim())
    return ReviewSchema.parse(parsed)
  } catch (error) {
    // If parsing fails, treat entire response as overview
    console.warn("[pr-review] Failed to parse JSON response, using as overview")
    return {
      overview: response,
      comments: [],
      event: "COMMENT",
    }
  }
}

/**
 * Validate that comments reference valid files
 */
export function validateComments(
  review: Review,
  validPaths: string[],
): { valid: Review; warnings: string[] } {
  const warnings: string[] = []
  const validComments = review.comments.filter((c) => {
    if (!validPaths.includes(c.path)) {
      warnings.push(`Comment references unknown file: ${c.path}`)
      return false
    }
    return true
  })

  return {
    valid: { ...review, comments: validComments },
    warnings,
  }
}
````

**Step 2: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/pr-review/src/ai/parser.ts
git commit -m "feat(pr-review): add AI response parser"
```

---

## Task 8: Core Reviewer Orchestration

**Files:**

- Create: `packages/pr-review/src/reviewer.ts`

**Step 1: Create main reviewer module**

```typescript
// packages/pr-review/src/reviewer.ts
import { createGitHubClient, type GitHubClient } from "./github/client"
import { fetchPR, fetchPRDiff } from "./github/pr"
import { submitReview } from "./github/review"
import { createAIClient, prompt, closeAIClient, type AIClient } from "./ai/client"
import { buildReviewPrompt } from "./ai/prompts"
import { parseReviewResponse, validateComments } from "./ai/parser"
import { mapCommentsToPositions, formatUnmappedComments } from "./diff/position"
import type { PRData, Review } from "./github/types"

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
}

export type ReviewResult = {
  success: boolean
  reviewId?: number
  reviewUrl?: string
  isUpdate?: boolean
  review?: Review
  error?: string
}

/**
 * Review a PR using opencode SDK
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

    // Start AI client
    console.log("[pr-review] Starting AI client...")
    ai = await createAIClient()

    // Build prompt and get review
    const reviewPrompt = buildReviewPrompt(pr, diff)
    console.log("[pr-review] Requesting review from AI...")

    const modelConfig = options.model
      ? {
          providerID: options.model.split("/")[0],
          modelID: options.model.split("/").slice(1).join("/"),
        }
      : undefined

    const { response } = await prompt(ai, reviewPrompt, { model: modelConfig })

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
```

**Step 2: Verify compilation**

Run: `bun run compile` in `packages/pr-review`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/pr-review/src/reviewer.ts
git commit -m "feat(pr-review): add core reviewer orchestration"
```

---

## Task 9: CLI Entry Point

**Files:**

- Modify: `packages/pr-review/src/index.ts`

**Step 1: Implement CLI**

```typescript
#!/usr/bin/env bun
// packages/pr-review/src/index.ts

import { reviewPR, type ReviewOptions } from "./reviewer"
import { getPRContextFromEnv } from "./github/pr"
import { getGitHubToken, parseGitHubRepository } from "./github/client"

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
    }
  }

  console.log(`@owo/pr-review v0.1.0`)
  console.log(`Reviewing ${options.owner}/${options.repo}#${options.prNumber}`)
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

**Step 2: Build and test help**

Run: `bun run make && ./dist/index.js --help`
Expected: Help text displayed

**Step 3: Commit**

```bash
git add packages/pr-review/src/index.ts
git commit -m "feat(pr-review): add CLI entry point"
```

---

## Task 10: GitHub Action

**Files:**

- Create: `packages/pr-review/action.yml`

**Step 1: Create action definition**

```yaml
# packages/pr-review/action.yml
name: "OwO PR Review"
description: "AI-powered PR code review using opencode SDK"
author: "RawToast"

branding:
  icon: "eye"
  color: "purple"

inputs:
  github_token:
    description: "GitHub token with PR read/write permissions"
    required: true
  model:
    description: "Model to use (e.g., anthropic/claude-sonnet-4-20250514)"
    required: false
    default: ""

runs:
  using: "composite"
  steps:
    - name: Setup Bun
      uses: oven-sh/setup-bun@v2
      with:
        bun-version: latest

    - name: Install dependencies
      shell: bash
      working-directory: ${{ github.action_path }}
      run: bun install --frozen-lockfile

    - name: Build
      shell: bash
      working-directory: ${{ github.action_path }}
      run: bun run make

    - name: Run PR Review
      shell: bash
      working-directory: ${{ github.workspace }}
      env:
        GITHUB_TOKEN: ${{ inputs.github_token }}
        MODEL: ${{ inputs.model }}
      run: |
        if [ -n "$MODEL" ]; then
          node ${{ github.action_path }}/dist/index.js --model "$MODEL"
        else
          node ${{ github.action_path }}/dist/index.js
        fi
```

**Step 2: Create example workflow**

```yaml
# packages/pr-review/examples/workflow.yml
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
      - name: Checkout
        uses: actions/checkout@v4

      - name: Review PR
        uses: RawToast/owo/packages/pr-review@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          model: anthropic/claude-sonnet-4-20250514
```

**Step 3: Commit**

```bash
git add packages/pr-review/action.yml packages/pr-review/examples/
git commit -m "feat(pr-review): add GitHub Action"
```

---

## Task 11: Export Types & Index

**Files:**

- Create: `packages/pr-review/src/github/index.ts`
- Create: `packages/pr-review/src/ai/index.ts`
- Create: `packages/pr-review/src/diff/index.ts`

**Step 1: Create barrel exports**

```typescript
// packages/pr-review/src/github/index.ts
export * from "./types"
export * from "./client"
export * from "./pr"
export * from "./review"
```

```typescript
// packages/pr-review/src/ai/index.ts
export * from "./client"
export * from "./prompts"
export * from "./parser"
```

```typescript
// packages/pr-review/src/diff/index.ts
export * from "./position"
```

**Step 2: Update main index to export library API**

Add to `packages/pr-review/src/index.ts` at the top (after shebang):

```typescript
// Library exports
export { reviewPR, type ReviewOptions, type ReviewResult } from "./reviewer"
export * from "./github"
export * from "./ai"
export * from "./diff"
```

**Step 3: Verify build**

Run: `bun run make` in `packages/pr-review`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/pr-review/src/
git commit -m "feat(pr-review): add barrel exports for library usage"
```

---

## Task 12: Documentation

**Files:**

- Create: `packages/pr-review/README.md`

**Step 1: Create README**

````markdown
# @owo/pr-review

AI-powered PR code review using opencode SDK + Octokit.

## Features

- Uses opencode SDK for AI-powered code analysis
- Posts reviews with inline comments on specific lines
- Updates existing reviews instead of creating duplicates
- Works as GitHub Action or standalone CLI
- No opencode fork required!

## Usage

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
````

### CLI

```bash
# Install
bun add @owo/pr-review

# Review a PR
GITHUB_TOKEN=ghp_xxx owo-review --pr 123 --owner myorg --repo myrepo

# Dry run
owo-review --pr 123 --owner myorg --repo myrepo --dry-run
```

### Library

```typescript
import { reviewPR } from "@owo/pr-review"

const result = await reviewPR({
  token: process.env.GITHUB_TOKEN,
  owner: "myorg",
  repo: "myrepo",
  prNumber: 123,
  model: "anthropic/claude-sonnet-4-20250514",
})

console.log(result.reviewUrl)
```

## Environment Variables

| Variable            | Required | Description                     |
| ------------------- | -------- | ------------------------------- |
| `GITHUB_TOKEN`      | Yes      | GitHub token with PR read/write |
| `GITHUB_REPOSITORY` | No       | Auto-set in Actions             |
| `GITHUB_EVENT_PATH` | No       | Auto-set in Actions             |

## Architecture

```
Octokit (GitHub API)     opencode SDK (AI)
        │                       │
        └───────┬───────────────┘
                │
         @owo/pr-review
                │
    ┌───────────┼───────────┐
    │           │           │
 Fetch PR    AI Review   Post Review
```

## License

MIT

````

**Step 2: Commit**

```bash
git add packages/pr-review/README.md
git commit -m "docs(pr-review): add README"
````

---

## Task 13: Final Integration Test

**Step 1: Build everything**

Run: `bun run make` in `packages/pr-review`
Expected: Build succeeds

**Step 2: Test CLI help**

Run: `./dist/index.js --help`
Expected: Help text displayed

**Step 3: Test dry run (requires real PR)**

Run: `GITHUB_TOKEN=ghp_xxx ./dist/index.js --pr 1 --owner RawToast --repo owo --dry-run`
Expected: Review generated but not posted

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(pr-review): complete SDK-based PR reviewer"
```

---

## Summary

### What We Built

| Component          | Purpose                      |
| ------------------ | ---------------------------- |
| `github/client.ts` | Octokit wrapper              |
| `github/pr.ts`     | PR fetching (GraphQL + REST) |
| `github/review.ts` | Review posting/updating      |
| `github/types.ts`  | Type definitions             |
| `ai/client.ts`     | opencode SDK wrapper         |
| `ai/prompts.ts`    | Review prompts               |
| `ai/parser.ts`     | Response parsing             |
| `diff/position.ts` | Line-to-position mapping     |
| `reviewer.ts`      | Core orchestration           |
| `index.ts`         | CLI entry point              |
| `action.yml`       | GitHub Action                |

### Key Improvements Over github-reviewer

1. **No fork required** - Uses official opencode SDK
2. **No plugin hacks** - Direct SDK calls
3. **Cleaner architecture** - Separation of concerns
4. **Library + CLI + Action** - Multiple usage modes
5. **Better error handling** - Structured results

### Next Steps (Future)

- [ ] Add tests
- [ ] Support APPROVE/REQUEST_CHANGES events
- [ ] Add caching for faster subsequent reviews
- [ ] Support review threads/conversations
- [ ] Add configuration file support

# Comment Resolution Feature

**Date**: 2026-01-30  
**Status**: Design Complete  
**Package**: `@owo/pr-review`

## Overview

When re-reviewing a PR, automatically check if previously raised issues have been fixed and resolve those threads. Uses a lightweight agent to verify fixes, then replies and resolves via GitHub's GraphQL API.

## Goals

- Reduce noise from stale comments that have been addressed
- Provide clear feedback when issues are fixed
- Keep unresolved issues visible
- Configurable triggers to balance automation vs control

## Flow

```
1. Trigger fires (push event or "@owo review" comment)
2. Fetch existing owo comments from PR (REST API)
3. Fetch thread IDs for comments (GraphQL)
4. Run new review (existing flow)
5. Pass old comments + new code to Resolution Agent (single call)
6. Agent returns: FIXED | NOT_FIXED | PARTIALLY_FIXED for each
7. For FIXED: Reply "Fixed" + resolve thread (GraphQL)
8. For PARTIALLY_FIXED: Reply with explanation, keep open
9. For NOT_FIXED: Leave as-is
10. Post new review with any new issues
```

## Configuration

New top-level `resolution` object in `pr-review.json`:

```json
{
  "version": 1,
  "reviewers": [...],
  "verifier": {...},
  "resolution": {
    "enabled": true,
    "trigger": "first-push",
    "model": "anthropic/claude-haiku-4-20250514"
  }
}
```

### Schema

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable resolution checking |
| `trigger` | `"first-push" \| "all-pushes" \| "on-request"` | `"first-push"` | When to run resolution checks |
| `model` | `string` | (uses `defaults.model`) | Model for resolution agent (recommend cheap/fast) |
| `prompt` | `string?` | (built-in) | Custom resolution prompt |
| `promptFile` | `string?` | - | Path to custom prompt file |

### Trigger Modes

| Mode | Behavior |
|------|----------|
| `"first-push"` | Only on PR open, subsequent pushes need `@owo review` |
| `"all-pushes"` | Every push triggers full re-review with resolution check |
| `"on-request"` | Never automatic, only when someone comments `@owo review` |

### Trigger Keywords (Phase 1)

- `@owo review`
- `/owo review`

## Resolution Agent

### Input

Single call with all old comments:

```typescript
{
  prTitle: string
  prDescription: string
  oldComments: Array<{
    id: number           // GitHub comment ID
    threadId: string     // GraphQL thread ID (for resolution)
    path: string         // File path
    line: number         // Original line number
    body: string         // Comment content
    createdAt: string    // When it was posted
  }>
  currentCode: Array<{
    path: string         // File path
    content: string      // Current file content (or relevant snippet)
  }>
  recentCommits: Array<{
    sha: string
    message: string
  }>
}
```

### Output

```typescript
{
  results: Array<{
    commentId: number
    status: "FIXED" | "NOT_FIXED" | "PARTIALLY_FIXED"
    explanation: string  // Brief reason (used in reply for PARTIALLY_FIXED)
  }>
}
```

### Actions by Status

| Status | Action |
|--------|--------|
| `FIXED` | Reply "This issue has been addressed" + resolve thread |
| `NOT_FIXED` | Leave as-is |
| `PARTIALLY_FIXED` | Reply with explanation, keep thread open |
| `FILE_DELETED` | Auto-resolve without LLM (issue is moot) |

### Edge Case: Deleted Files

If a file with open comments was deleted in the latest push, auto-resolve those threads without calling the LLM — the issue is no longer relevant.

```typescript
// In checker.ts
const deletedFiles = new Set(
  prData.files
    .filter(f => f.changeType === "DELETED")
    .map(f => f.path)
)

// Auto-resolve comments on deleted files
const deletedFileComments = oldComments.filter(c => deletedFiles.has(c.path))
for (const comment of deletedFileComments) {
  await replyAndResolve(client, comment.threadId, "📁 File was deleted — resolving.")
}

// Only send remaining comments to agent
const commentsToCheck = oldComments.filter(c => !deletedFiles.has(c.path))
```

## GitHub API Interactions

### Fetch Existing Comments (REST)

```typescript
const { data: allComments } = await client.rest.pulls.listReviewComments({
  owner, repo, pull_number
})

// Filter to our comments
const owoComments = allComments.filter(c => 
  c.body.includes("<!-- owo-comment -->")
)
```

### Get Thread IDs (GraphQL)

**Note**: Must use cursor-based pagination for PRs with many threads.

```graphql
query GetReviewThreads($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes {
              databaseId
            }
          }
        }
      }
    }
  }
}
```

```typescript
// Fetch all threads with pagination
async function fetchAllThreads(client: GitHubClient, prNumber: number) {
  const threads: ReviewThread[] = []
  let cursor: string | null = null
  
  do {
    const result = await client.graphql(GET_REVIEW_THREADS, { 
      owner: client.owner, 
      repo: client.repo, 
      pr: prNumber,
      cursor 
    })
    threads.push(...result.repository.pullRequest.reviewThreads.nodes)
    cursor = result.repository.pullRequest.reviewThreads.pageInfo.hasNextPage
      ? result.repository.pullRequest.reviewThreads.pageInfo.endCursor
      : null
  } while (cursor)
  
  return threads
}
```

### Reply + Resolve (GraphQL)

```graphql
mutation AddReply($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { 
    pullRequestReviewThreadId: $threadId, 
    body: $body 
  }) {
    comment { id }
  }
}

mutation ResolveThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { isResolved }
  }
}
```

## Trigger Logic

Using `ts-pattern` for exhaustive matching:

```typescript
import { match, P } from "ts-pattern"

type TriggerType = "pr-opened" | "pr-push" | "comment-request"
type TriggerConfig = "first-push" | "all-pushes" | "on-request"

const shouldRunResolution = match({ trigger, config })
  .with({ trigger: "pr-opened" }, () => false)
  .with({ trigger: "comment-request" }, () => true)
  .with({ trigger: "pr-push", config: "all-pushes" }, () => true)
  .with({ trigger: "pr-push", config: P.union("first-push", "on-request") }, () => false)
  .exhaustive()
```

## File Structure

### New Files

```
packages/pr-review/src/
├── resolution/
│   ├── index.ts           # Re-exports
│   ├── checker.ts         # Main resolution logic
│   ├── agent.ts           # Resolution agent prompt + parsing
│   └── threads.ts         # GraphQL queries for thread IDs + resolution
```

### Modified Files

| File | Changes |
|------|---------|
| `config/types.ts` | Add `ResolutionConfigSchema` |
| `config/loader.ts` | Add resolution defaults |
| `config/defaults.ts` | Add `DEFAULT_RESOLUTION_PROMPT` |
| `reviewer.ts` | Call resolution checker |
| `github/review.ts` | Add reply + resolve functions |

## Implementation Plan

### Phase 1: Core Resolution

1. **Config** — Add schema, defaults, loader changes
2. **GraphQL** — Thread fetching + resolution mutations (`threads.ts`)
3. **Agent** — Resolution prompt + response parsing (`agent.ts`)
4. **Checker** — Main orchestration logic (`checker.ts`)
5. **Integration** — Wire into `reviewer.ts`
6. **Comment Marker** — Add `<!-- owo-comment -->` to inline comments
7. **Triggers** — Handle `@owo review` comment events
8. **Tests** — Unit tests for each component

### Phase 2: Reply Trigger (Future)

- Listen for `pull_request_review_comment` events
- Filter for replies to our comments containing "fixed" / "check"
- Run single-comment verification
- Reply with result + resolve if fixed

## Dependencies

- `ts-pattern@5.9.0` — Already added for exhaustive pattern matching
- `@octokit/graphql` — Already available via `GitHubClient.graphql`

## Reply Messages

```typescript
const REPLY_MESSAGES = {
  FIXED: "✅ This issue has been addressed in recent commits.",
  PARTIALLY_FIXED: (explanation: string) => 
    `⚠️ Partially addressed: ${explanation}`,
  FILE_DELETED: "📁 File was deleted — resolving.",
}
```

## Rate Limiting

When resolving many threads, limit concurrency to avoid GitHub's secondary rate limits:

```typescript
import pLimit from "p-limit"

const limit = pLimit(5) // Max 5 concurrent mutations

await Promise.all(
  threadsToResolve.map(thread => 
    limit(() => replyAndResolve(client, thread.id, message))
  )
)
```

**Note**: May need to add `p-limit` as a dependency, or use a simple semaphore implementation.

## Oracle Review Notes

Design reviewed by Oracle agent on 2026-01-30. Key additions:

1. **Pagination** — Added cursor-based pagination for `reviewThreads` query
2. **Deleted Files** — Auto-resolve threads on deleted files without LLM
3. **Rate Limiting** — Limit concurrency when resolving many threads
4. **Legacy Comments** — Skipped (no existing users yet)
5. **Double Comments** — Accepted risk for v1 (new reviewer may duplicate NOT_FIXED issues)

## Open Questions

None — design is complete and Oracle-approved!

## References

- [GitHub GraphQL: resolveReviewThread](https://docs.github.com/en/graphql/reference/mutations#resolvereviewthread)
- [GitHub REST: listReviewComments](https://docs.github.com/en/rest/pulls/comments)
- [ts-pattern documentation](https://github.com/gvergnaud/ts-pattern)

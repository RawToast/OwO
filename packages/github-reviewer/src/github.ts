import { Octokit } from "@octokit/rest"
import parseDiff from "parse-diff"
import type { PRContext, InlineComment, ExistingReview } from "./types"

// Marker to identify our reviews
const REVIEW_MARKER = "<!-- owo-reviewer -->"

/**
 * Get GitHub token from environment
 */
export function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required")
  }
  return token
}

/**
 * Parse GitHub context from environment (set by GitHub Actions)
 */
export function getPRContext(): PRContext | null {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) return null

  try {
    // Use dynamic import for JSON file
    const fs = require("fs")
    const event = JSON.parse(fs.readFileSync(eventPath, "utf-8"))
    const pr = event.pull_request
    if (!pr) return null

    const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/")

    return {
      owner,
      repo,
      number: pr.number,
      baseSha: pr.base.sha,
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      headRef: pr.head.ref,
      title: pr.title,
      body: pr.body || "",
      author: pr.user.login,
    }
  } catch {
    return null
  }
}

/**
 * Get PR context from environment or throw
 */
export function requirePRContext(): PRContext {
  const ctx = getPRContext()
  if (!ctx) {
    throw new Error("Not running in a PR context. GITHUB_EVENT_PATH not set or not a PR event.")
  }
  return ctx
}

/**
 * Create Octokit client with token from environment
 */
export function createOctokit(): Octokit {
  return new Octokit({ auth: getGitHubToken() })
}

/**
 * Map a file line number to a diff position
 *
 * GitHub API requires "position" which is the line number within the diff hunk,
 * NOT the actual file line number. This function parses the diff and finds
 * the correct position.
 *
 * @param diffContent - Raw unified diff content
 * @param filePath - Path to the file
 * @param lineNumber - Line number in the NEW version of the file
 * @param side - Which side of the diff (LEFT = old, RIGHT = new)
 * @returns Position in diff, or null if line is not in the diff
 */
export function mapLineToPosition(
  diffContent: string,
  filePath: string,
  lineNumber: number,
  side: "LEFT" | "RIGHT" = "RIGHT",
): number | null {
  const files = parseDiff(diffContent)

  // Find the file in the diff
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

      // Match based on side
      if (side === "RIGHT") {
        // New file line numbers (additions and context)
        if ((change.type === "add" || change.type === "normal") && "ln2" in change) {
          if (change.ln2 === lineNumber) return position
        }
      } else {
        // Old file line numbers (deletions and context)
        if ((change.type === "del" || change.type === "normal") && "ln1" in change) {
          if (change.ln1 === lineNumber) return position
        }
      }
    }
  }

  return null // Line not found in diff
}

/**
 * Map multiple comments to their diff positions
 * Returns comments with positions, and a list of comments that couldn't be mapped
 */
export function mapCommentsToPositions(
  diffContent: string,
  comments: InlineComment[],
): { mapped: Array<InlineComment & { position: number }>; unmapped: InlineComment[] } {
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
    "## 📝 Additional Notes",
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

/**
 * Get the review marker used to identify our reviews
 */
export function getReviewMarker(): string {
  return REVIEW_MARKER
}

/**
 * Find an existing review created by owo-reviewer on this PR
 * Returns the review ID and its comment IDs if found
 */
export async function findExistingReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<ExistingReview | null> {
  try {
    // List all reviews on the PR
    const { data: reviews } = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    })

    // Find our review by looking for the marker in the body
    const ourReview = reviews.find((r) => r.body?.includes(REVIEW_MARKER))

    if (!ourReview) return null

    // Get the review comments for this review
    const { data: allComments } = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    })

    // Filter to comments from this specific review
    const reviewComments = allComments.filter((c) => c.pull_request_review_id === ourReview.id)

    return {
      id: ourReview.id,
      commentIds: reviewComments.map((c) => c.id),
    }
  } catch (error) {
    console.error("[github-reviewer] Error finding existing review:", error)
    return null
  }
}

/**
 * Delete review comments by their IDs
 */
export async function deleteReviewComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentIds: number[],
): Promise<void> {
  // Delete in parallel for speed
  await Promise.all(
    commentIds.map((id) =>
      octokit.rest.pulls
        .deleteReviewComment({
          owner,
          repo,
          comment_id: id,
        })
        .catch((err) => {
          console.warn(`[github-reviewer] Failed to delete comment ${id}:`, err.message)
        }),
    ),
  )
}

/**
 * Update an existing review's body
 */
export async function updateReviewBody(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  reviewId: number,
  body: string,
): Promise<void> {
  await octokit.rest.pulls.updateReview({
    owner,
    repo,
    pull_number: pullNumber,
    review_id: reviewId,
    body,
  })
}

/**
 * Add new comments to an existing review
 * Note: GitHub API doesn't support adding comments to an existing review directly,
 * so we create them as standalone review comments
 */
export async function addReviewComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitId: string,
  comments: Array<{ path: string; position: number; body: string }>,
): Promise<void> {
  // Add comments sequentially to avoid rate limits
  for (const comment of comments) {
    try {
      await octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        path: comment.path,
        position: comment.position,
        body: comment.body,
      })
    } catch (err: any) {
      console.warn(
        `[github-reviewer] Failed to add comment on ${comment.path}:${comment.position}:`,
        err.message,
      )
    }
  }
}

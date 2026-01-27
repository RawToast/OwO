import { Octokit } from "@octokit/rest"
import parseDiff from "parse-diff"
import type { PRContext, InlineComment } from "./types"

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

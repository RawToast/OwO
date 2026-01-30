import type { AIClient } from "../ai/client"
import type { ResolutionConfig } from "../config/types"
import type { GitHubClient } from "../github/client"
import type { PRData } from "../github/types"
import type { OldComment, CodeSnippet, ResolutionInput } from "./agent"
import { checkResolutions } from "./agent"
import { fetchAllThreads, replyAndResolve, replyToThread, type ReviewThread } from "./threads"

/**
 * Result of resolution checking
 */
export type ResolutionCheckResult = {
  checked: number // Total comments checked
  fixed: number // Comments marked as fixed
  partiallyFixed: number // Comments partially fixed
  notFixed: number // Comments still present
  deletedFiles: number // Comments on deleted files (auto-resolved)
}

/**
 * Reply messages for resolution status
 */
const REPLY_MESSAGES = {
  FIXED: "✅ This issue has been addressed in recent commits.",
  PARTIALLY_FIXED: (reason: string) => `⚠️ Partially addressed: ${reason}`,
  FILE_DELETED: "📁 File was deleted — resolving.",
}

/**
 * Marker to identify owo comments
 */
const OWO_COMMENT_MARKER = "<!-- owo-comment -->"

/**
 * Max concurrent mutations for rate limiting
 */
const MAX_CONCURRENCY = 5

/**
 * Existing owo comment from GitHub
 */
type OwoComment = {
  id: number
  path: string
  line: number
  body: string
}

/**
 * Simple semaphore for rate limiting concurrent operations
 */
class Semaphore {
  private current = 0
  private queue: Array<() => void> = []

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++
      return
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.current++
        resolve()
      })
    })
  }

  release(): void {
    this.current--
    const next = this.queue.shift()
    if (next) {
      next()
    }
  }
}

/**
 * Fetch existing owo comments from the PR using REST API
 */
async function fetchOwoComments(client: GitHubClient, prNumber: number): Promise<OwoComment[]> {
  const comments: OwoComment[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const { data } = await client.rest.pulls.listReviewComments({
      owner: client.owner,
      repo: client.repo,
      pull_number: prNumber,
      per_page: perPage,
      page,
    })

    for (const comment of data) {
      if (comment.body?.includes(OWO_COMMENT_MARKER)) {
        comments.push({
          id: comment.id,
          path: comment.path,
          line: comment.line ?? comment.original_line ?? 0,
          body: comment.body,
        })
      }
    }

    if (data.length < perPage) {
      break
    }
    page++
  }

  return comments
}

/**
 * Map comment IDs to thread IDs
 */
function mapCommentsToThreads(
  comments: OwoComment[],
  threads: ReviewThread[],
): Map<number, string> {
  const threadMap = new Map<number, string>()

  for (const thread of threads) {
    if (thread.commentDatabaseId) {
      threadMap.set(thread.commentDatabaseId, thread.id)
    }
  }

  return threadMap
}

/**
 * Filter comments on deleted files
 */
function filterDeletedFileComments(
  comments: OwoComment[],
  deletedPaths: Set<string>,
): { deletedFileComments: OwoComment[]; remainingComments: OwoComment[] } {
  const deletedFileComments: OwoComment[] = []
  const remainingComments: OwoComment[] = []

  for (const comment of comments) {
    if (deletedPaths.has(comment.path)) {
      deletedFileComments.push(comment)
    } else {
      remainingComments.push(comment)
    }
  }

  return { deletedFileComments, remainingComments }
}

/**
 * Fetch current file content from GitHub
 */
async function fetchFileContent(
  client: GitHubClient,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const { data } = await client.rest.repos.getContent({
      owner: client.owner,
      repo: client.repo,
      path,
      ref,
    })

    if ("content" in data && typeof data.content === "string") {
      // Content is base64 encoded
      return Buffer.from(data.content, "base64").toString("utf-8")
    }

    return null
  } catch {
    // File may not exist or be inaccessible
    return null
  }
}

/**
 * Extract snippet around a line from file content
 */
function extractSnippet(content: string, line: number, contextLines = 10): string {
  const lines = content.split("\n")
  const startLine = Math.max(0, line - contextLines - 1)
  const endLine = Math.min(lines.length, line + contextLines)

  const snippetLines = lines.slice(startLine, endLine)
  const lineNumbers = snippetLines.map((l, i) => {
    const lineNum = startLine + i + 1
    const marker = lineNum === line ? ">" : " "
    return `${marker}${lineNum.toString().padStart(4)}: ${l}`
  })

  return lineNumbers.join("\n")
}

/**
 * Fetch code snippets for comments
 */
async function fetchCodeSnippets(
  client: GitHubClient,
  comments: OwoComment[],
  headSha: string,
): Promise<CodeSnippet[]> {
  // Get unique paths
  const paths = [...new Set(comments.map((c) => c.path))]

  const snippets: CodeSnippet[] = []
  const fileContents = new Map<string, string>()

  // Fetch all file contents
  for (const path of paths) {
    const content = await fetchFileContent(client, path, headSha)
    if (content) {
      fileContents.set(path, content)
    }
  }

  // Extract snippets for each comment
  for (const comment of comments) {
    const content = fileContents.get(comment.path)
    if (content) {
      const snippet = extractSnippet(content, comment.line)
      snippets.push({ path: comment.path, content: snippet })
    }
  }

  return snippets
}

/**
 * Convert OwoComment to OldComment with thread ID
 */
function toOldComment(comment: OwoComment, threadId: string): OldComment {
  return {
    id: comment.id,
    threadId,
    path: comment.path,
    line: comment.line,
    body: comment.body,
  }
}

/**
 * Process resolution results with rate limiting
 */
async function processResults(
  client: GitHubClient,
  results: Array<{ commentId: number; status: string; reason: string }>,
  commentThreadMap: Map<number, string>,
  semaphore: Semaphore,
): Promise<{ fixed: number; partiallyFixed: number; notFixed: number }> {
  let fixed = 0
  let partiallyFixed = 0
  let notFixed = 0

  const processComment = async (result: {
    commentId: number
    status: string
    reason: string
  }): Promise<void> => {
    await semaphore.acquire()
    try {
      const threadId = commentThreadMap.get(result.commentId)
      if (!threadId) {
        console.warn(`[pr-review] No thread found for comment ${result.commentId}`)
        return
      }

      switch (result.status) {
        case "FIXED":
          await replyAndResolve(client, threadId, REPLY_MESSAGES.FIXED)
          fixed++
          break
        case "PARTIALLY_FIXED":
          await replyToThread(client, threadId, REPLY_MESSAGES.PARTIALLY_FIXED(result.reason))
          partiallyFixed++
          break
        case "NOT_FIXED":
          notFixed++
          break
      }
    } finally {
      semaphore.release()
    }
  }

  await Promise.all(results.map(processComment))

  return { fixed, partiallyFixed, notFixed }
}

/**
 * Process deleted file comments with rate limiting
 */
async function processDeletedFileComments(
  client: GitHubClient,
  comments: OwoComment[],
  commentThreadMap: Map<number, string>,
  semaphore: Semaphore,
): Promise<number> {
  let resolved = 0

  const processComment = async (comment: OwoComment): Promise<void> => {
    await semaphore.acquire()
    try {
      const threadId = commentThreadMap.get(comment.id)
      if (!threadId) {
        console.warn(`[pr-review] No thread found for deleted file comment ${comment.id}`)
        return
      }

      await replyAndResolve(client, threadId, REPLY_MESSAGES.FILE_DELETED)
      resolved++
    } finally {
      semaphore.release()
    }
  }

  await Promise.all(comments.map(processComment))

  return resolved
}

/**
 * Main orchestration function for resolution checking
 */
export async function runResolutionCheck(
  github: GitHubClient,
  ai: AIClient,
  pr: PRData,
  _diff: string,
  config: ResolutionConfig,
  _repoRoot: string,
): Promise<ResolutionCheckResult> {
  console.log(`[pr-review] Starting resolution check for PR #${pr.number}`)

  // 1. Fetch existing owo comments
  const owoComments = await fetchOwoComments(github, pr.number)
  console.log(`[pr-review] Found ${owoComments.length} owo comments to check`)

  if (owoComments.length === 0) {
    return {
      checked: 0,
      fixed: 0,
      partiallyFixed: 0,
      notFixed: 0,
      deletedFiles: 0,
    }
  }

  // 2. Fetch thread IDs
  const threads = await fetchAllThreads(github, pr.number)
  const commentThreadMap = mapCommentsToThreads(owoComments, threads)

  // 3. Handle deleted files
  const deletedPaths = new Set(
    pr.files.filter((f) => f.changeType === "DELETED").map((f) => f.path),
  )
  const { deletedFileComments, remainingComments } = filterDeletedFileComments(
    owoComments,
    deletedPaths,
  )

  // Create semaphore for rate limiting
  const semaphore = new Semaphore(MAX_CONCURRENCY)

  // Process deleted file comments
  const deletedFiles = await processDeletedFileComments(
    github,
    deletedFileComments,
    commentThreadMap,
    semaphore,
  )

  console.log(`[pr-review] Auto-resolved ${deletedFiles} comments on deleted files`)

  if (remainingComments.length === 0) {
    return {
      checked: owoComments.length,
      fixed: 0,
      partiallyFixed: 0,
      notFixed: 0,
      deletedFiles,
    }
  }

  // 4. Fetch current code snippets
  const codeSnippets = await fetchCodeSnippets(github, remainingComments, pr.headSha)

  // 5. Convert to OldComment format
  const oldComments: OldComment[] = []
  for (const comment of remainingComments) {
    const threadId = commentThreadMap.get(comment.id)
    if (threadId) {
      oldComments.push(toOldComment(comment, threadId))
    }
  }

  // 6. Call resolution agent
  const resolutionInput: ResolutionInput = {
    prTitle: pr.title,
    prDescription: pr.body,
    oldComments,
    currentCode: codeSnippets,
    recentCommits: pr.commits.map((c) => ({ sha: c.oid, message: c.message })),
  }

  const { results } = await checkResolutions(ai, resolutionInput, config)

  // 7. Process results with rate limiting
  const { fixed, partiallyFixed, notFixed } = await processResults(
    github,
    results,
    commentThreadMap,
    semaphore,
  )

  const totalChecked = owoComments.length

  console.log(
    `[pr-review] Resolution check complete: ${fixed} fixed, ${partiallyFixed} partial, ${notFixed} not fixed, ${deletedFiles} deleted files`,
  )

  return {
    checked: totalChecked,
    fixed,
    partiallyFixed,
    notFixed,
    deletedFiles,
  }
}

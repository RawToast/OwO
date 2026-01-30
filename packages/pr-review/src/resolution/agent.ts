import type { AIClient } from "../ai/client"
import { prompt } from "../ai/client"
import { DEFAULT_RESOLUTION_PROMPT } from "../config/defaults"
import type { ResolutionConfig } from "../config/types"

/**
 * Resolution status for a comment
 */
export type ResolutionStatus = "FIXED" | "NOT_FIXED" | "PARTIALLY_FIXED"

/**
 * Old review comment to check resolution for
 */
export type OldComment = {
  id: number // GitHub comment ID
  threadId: string // GraphQL thread ID
  path: string // File path
  line: number // Original line number
  body: string // Comment content
}

/**
 * Current code snippet for a file
 */
export type CodeSnippet = {
  path: string
  content: string // Current file content or snippet around the line
}

/**
 * Input for resolution checking
 */
export type ResolutionInput = {
  prTitle: string
  prDescription: string
  oldComments: OldComment[]
  currentCode: CodeSnippet[]
  recentCommits: Array<{ sha: string; message: string }>
}

/**
 * Resolution result for a single comment
 */
export type ResolutionResult = {
  commentId: number
  status: ResolutionStatus
  reason: string
}

/**
 * Output from resolution checking
 */
export type ResolutionOutput = {
  results: ResolutionResult[]
}

/**
 * Build the prompt for the resolution agent
 */
export function buildResolutionPrompt(input: ResolutionInput): string {
  const parts: string[] = []

  // System instruction
  parts.push(DEFAULT_RESOLUTION_PROMPT)
  parts.push("")
  parts.push("---")
  parts.push("")

  // PR context
  parts.push("## PR Context")
  parts.push("")
  parts.push(`**Title:** ${input.prTitle}`)
  if (input.prDescription) {
    parts.push("")
    parts.push("**Description:**")
    parts.push(input.prDescription)
  }
  parts.push("")

  // Recent commits
  if (input.recentCommits.length > 0) {
    parts.push("## Recent Commits")
    parts.push("")
    for (const commit of input.recentCommits) {
      const shortSha = commit.sha.slice(0, 7)
      const firstLine = commit.message.split("\n")[0]
      parts.push(`- \`${shortSha}\` ${firstLine}`)
    }
    parts.push("")
  }

  // Old comments to check
  parts.push("## Comments to Check")
  parts.push("")
  for (const comment of input.oldComments) {
    parts.push(`### Comment ${comment.id}`)
    parts.push(`- **File:** ${comment.path}`)
    parts.push(`- **Line:** ${comment.line}`)
    parts.push(`- **Comment:**`)
    parts.push(comment.body)
    parts.push("")
  }

  // Current code snippets
  parts.push("## Current Code")
  parts.push("")
  for (const snippet of input.currentCode) {
    parts.push(`### ${snippet.path}`)
    parts.push("")
    parts.push("```")
    parts.push(snippet.content)
    parts.push("```")
    parts.push("")
  }

  // Final instruction
  parts.push("---")
  parts.push("")
  parts.push(
    "Now analyze each comment and determine if it has been addressed. Return JSON with results for each comment ID.",
  )

  return parts.join("\n")
}

/**
 * Parse the JSON response from the resolution agent
 */
export function parseResolutionResponse(response: string): ResolutionOutput {
  // Try to find JSON in code block first
  const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim())
      return validateAndTransformResponse(parsed)
    } catch (e) {
      // Continue to try other formats
    }
  }

  // Try to find raw JSON object
  const rawJsonMatch = response.match(/\{\s*"results"\s*:\s*\[[\s\S]*?\]\s*\}/)
  if (rawJsonMatch) {
    try {
      const parsed = JSON.parse(rawJsonMatch[0])
      return validateAndTransformResponse(parsed)
    } catch (e) {
      // Continue to try other formats
    }
  }

  // Try parsing the entire response as JSON
  try {
    const parsed = JSON.parse(response.trim())
    return validateAndTransformResponse(parsed)
  } catch (e) {
    throw new Error(
      `Failed to parse resolution response: ${e instanceof Error ? e.message : String(e)}. Response: ${response.slice(0, 200)}...`,
    )
  }
}

/**
 * Validate and transform the parsed response to match our expected types
 */
function validateAndTransformResponse(parsed: unknown): ResolutionOutput {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Response is not an object")
  }

  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.results)) {
    throw new Error("Response missing 'results' array")
  }

  const results: ResolutionResult[] = []
  for (const item of obj.results) {
    if (!item || typeof item !== "object") {
      throw new Error("Result item is not an object")
    }

    const result = item as Record<string, unknown>

    // Handle both commentId and path/line formats
    let commentId: number
    if (typeof result.commentId === "number") {
      commentId = result.commentId
    } else if (typeof result.path === "string" && typeof result.line === "number") {
      // The prompt asks for path/line, but we need commentId
      // This is a fallback - the caller should match by path/line
      commentId = 0 // Will need to be resolved by caller
    } else {
      // If we can't identify the comment, skip it
      continue
    }

    const status = result.status
    if (status !== "FIXED" && status !== "NOT_FIXED" && status !== "PARTIALLY_FIXED") {
      // Skip invalid status
      continue
    }

    const reason = typeof result.reason === "string" ? result.reason : ""

    // Store path/line temporarily if commentId is 0
    const resultObj: any = { commentId, status, reason }
    if (commentId === 0) {
      resultObj.path = result.path
      resultObj.line = result.line
    }

    results.push(resultObj)
  }

  return { results }
}

/**
 * Check resolution status of old comments
 */
export async function checkResolutions(
  ai: AIClient,
  input: ResolutionInput,
  config: ResolutionConfig,
): Promise<ResolutionOutput> {
  if (input.oldComments.length === 0) {
    return { results: [] }
  }

  const promptText = buildResolutionPrompt(input)

  // Use configured model or default to a cheap/fast model
  const modelConfig = config.model
    ? {
        providerID: config.model.split("/")[0],
        modelID: config.model.split("/").slice(1).join("/"),
      }
    : {
        // Default to Claude Haiku for cheap/fast resolution checks
        providerID: "anthropic",
        modelID: "claude-3-5-haiku-latest",
      }

  console.log(`[pr-review] Checking resolution of ${input.oldComments.length} comments...`)

  const { response } = await prompt(ai, promptText, { model: modelConfig })
  const output = parseResolutionResponse(response)

  // Map results back to comment IDs if needed (when response used path/line)
  const mappedResults = mapResultsToCommentIds(output.results, input.oldComments)

  console.log(`[pr-review] Resolution check complete: ${summarizeResults(mappedResults)}`)

  return { results: mappedResults }
}

/**
 * Map results to comment IDs when the AI returned path/line instead
 */
function mapResultsToCommentIds(
  results: any[],
  comments: OldComment[],
): ResolutionResult[] {
  const mapped: ResolutionResult[] = []

  for (const result of results) {
    if (result.commentId > 0) {
      mapped.push({
        commentId: result.commentId,
        status: result.status,
        reason: result.reason,
      })
      continue
    }

    // Try to match by path and line
    if (result.path && result.line) {
      const match = comments.find(
        (c) => c.path === result.path && c.line === result.line,
      )
      if (match) {
        mapped.push({
          commentId: match.id,
          status: result.status,
          reason: result.reason,
        })
      }
    }
  }

  return mapped
}

/**
 * Summarize results for logging
 */
function summarizeResults(results: ResolutionResult[]): string {
  const fixed = results.filter((r) => r.status === "FIXED").length
  const partial = results.filter((r) => r.status === "PARTIALLY_FIXED").length
  const notFixed = results.filter((r) => r.status === "NOT_FIXED").length
  return `${fixed} fixed, ${partial} partial, ${notFixed} not fixed`
}

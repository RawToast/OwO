import type { AIClient } from "../ai/client"
import { prompt } from "../ai/client"
import { buildMultiReviewerPrompt } from "../ai/prompts"
import type { PRData } from "../github/types"
import type { ReviewerConfig, ReviewerOutput } from "../config/types"
import { loadReviewerPrompt } from "../config/loader"
import type { FileContext } from "../context/types"

export const REVIEWER_TIMEOUT_MS = 180_000

/**
 * Run a single reviewer with timeout handling
 */
export async function runReviewer(
  ai: AIClient,
  pr: PRData,
  diff: string,
  reviewer: ReviewerConfig,
  repoRoot: string,
  fileContext?: { files: FileContext[]; skippedFiles: string[] },
): Promise<ReviewerOutput> {
  const startTime = Date.now()
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    console.log(`[pr-review] Running reviewer: ${reviewer.name} (${reviewer.focus || "general"})`)

    const result = await Promise.race([
      runReviewerInternal(ai, pr, diff, reviewer, repoRoot, fileContext),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(new Error(`Reviewer ${reviewer.name} timed out after ${REVIEWER_TIMEOUT_MS}ms`)),
          REVIEWER_TIMEOUT_MS,
        )
      }),
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
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

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

  const modelConfig = reviewer.model
    ? {
        providerID: reviewer.model.split("/")[0],
        modelID: reviewer.model.split("/").slice(1).join("/"),
      }
    : undefined

  const { response } = await prompt(ai, fullPrompt, {
    model: modelConfig,
    temperature: reviewer.temperature,
  })

  return parseReviewerResponse(response, reviewer.name)
}

/**
 * Parse a line value that may be a number, string number, or range string.
 * Returns { line, start_line? } where start_line is only set for ranges.
 */
export function parseLineValue(lineValue: unknown): { line: number; start_line?: number } | null {
  if (typeof lineValue === "number") {
    return { line: lineValue }
  }

  if (typeof lineValue === "string") {
    const trimmed = lineValue.trim()

    // Check for range format: "start-end"
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-")
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)

      if (!isNaN(start) && !isNaN(end)) {
        return { line: end, start_line: start }
      }
    }

    // Single number as string
    const num = parseInt(trimmed, 10)
    if (!isNaN(num)) {
      return { line: num }
    }
  }

  return null
}

/**
 * Parse reviewer response (expects JSON format)
 */
export function parseReviewerResponse(
  response: string,
  reviewerName: string,
): NonNullable<ReviewerOutput["review"]> {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : response

  try {
    const parsed = JSON.parse(jsonStr.trim())

    return {
      overview: parsed.overview || "",
      comments: (parsed.comments || []).map((comment: any) => {
        // Parse line value which may be number, string, or range
        const lineParsed = parseLineValue(comment.line)
        const line = lineParsed?.line ?? comment.line
        const startLineFromRange = lineParsed?.start_line

        // Prefer explicit start_line if provided, otherwise use parsed range
        const startLine = comment.start_line ?? startLineFromRange

        return {
          path: comment.path,
          line,
          body: comment.body,
          side: comment.side || "RIGHT",
          severity: comment.severity || "warning",
          ...(startLine && {
            start_line: startLine,
            start_side: comment.start_side || comment.side || "RIGHT",
          }),
        }
      }),
    }
  } catch (error) {
    console.warn(
      `[pr-review] Reviewer ${reviewerName} returned non-JSON response, using as overview`,
      error,
    )
    return {
      overview: response,
      comments: [],
    }
  }
}

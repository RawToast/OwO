import { createAIClient, prompt, closeAIClient, type AIClient } from "./ai/client"
import { parseReviewResponse, validateComments } from "./ai/parser"
import { buildReviewPrompt } from "./ai/prompts"
import { mapCommentsToPositions, formatUnmappedComments } from "./diff/position"
import { createGitHubClient, type GitHubClient } from "./github/client"
import { fetchPR, fetchPRDiff } from "./github/pr"
import { submitReview } from "./github/review"
import type { Review } from "./github/types"

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

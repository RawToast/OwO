import { createGitHubClient, type GitHubClient } from "./github/client"
import { fetchPR, fetchPRDiff } from "./github/pr"
import { submitReview } from "./github/review"
import { createAIClient, closeAIClient, type AIClient } from "./ai/client"
import { mapCommentsToPositions, formatUnmappedComments } from "./diff/position"
import type { PRData, Review } from "./github/types"
import { loadConfigFromPath } from "./config"
import type { ReviewerOutput, SynthesizedReview } from "./config/types"
import { runAllReviewers } from "./reviewers"
import { verifyAndSynthesize } from "./verifier"
import { runResolutionCheck, OWO_COMMENT_MARKER } from "./resolution"

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
}

export type ReviewResult = {
  success: boolean
  reviewId?: number
  reviewUrl?: string
  isUpdate?: boolean
  review?: Review
  synthesized?: SynthesizedReview
  error?: string
}

/**
 * Review a PR using multi-reviewer approach
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

    // Load configuration
    // configPath can be a file path or directory path
    const { config, repoRoot } = loadConfigFromPath(options.configPath || options.repoRoot)

    // Start AI client
    console.log("[pr-review] Starting AI client...")
    ai = await createAIClient()

    // Run resolution check if enabled (resolve old issues before new review)
    if (config.resolution?.enabled !== false) {
      const resolutionResult = await runResolutionCheck(
        github,
        ai,
        pr,
        diff,
        config.resolution || { enabled: true, trigger: "first-push" },
        repoRoot,
      )

      console.log(
        `[pr-review] Resolution check: ${resolutionResult.fixed} fixed, ${resolutionResult.partiallyFixed} partial, ${resolutionResult.notFixed} not fixed, ${resolutionResult.deletedFiles} deleted files`,
      )
    }

    if (options.legacyMode || config.reviewers.length === 0) {
      return runLegacyReview(ai, github, pr, diff, options)
    }

    // Run multi-reviewer flow
    console.log("[pr-review] Starting multi-reviewer review...")

    // Step 1: Run all reviewers in parallel
    const reviewerOutputs = await runAllReviewers(ai, pr, diff, config, repoRoot)

    // Step 2: Verify and synthesize findings (pass PR data for context)
    const synthesized = await verifyAndSynthesize(
      ai,
      reviewerOutputs,
      config.verifier,
      repoRoot,
      pr,
    )

    // Update summary with actual reviewer counts
    synthesized.summary.totalReviewers = reviewerOutputs.length
    synthesized.summary.successfulReviewers = reviewerOutputs.filter((o) => o.success).length

    // Step 3: Convert to review format and submit
    const review: Review = {
      overview: buildFinalOverview(synthesized, reviewerOutputs),
      comments: synthesized.comments.map((c) => ({
        path: c.path,
        line: c.line,
        body: formatCommentBody(c),
        side: c.side,
      })),
      event: synthesized.passed ? "COMMENT" : "REQUEST_CHANGES",
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
        synthesized,
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
      synthesized,
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

/**
 * Build final overview with summary
 * The verifier produces the main formatted content, we just add markers and footer
 */
function buildFinalOverview(synthesized: SynthesizedReview, outputs: ReviewerOutput[]): string {
  const parts: string[] = []

  // Marker for identifying our reviews (for updates)
  parts.push("<!-- owo-pr-review -->")
  parts.push("")

  // Main content from verifier (already formatted)
  parts.push(synthesized.overview)
  parts.push("")

  // Add reviewer stats footer
  parts.push("---")
  parts.push("")
  parts.push("<details>")
  parts.push("<summary>Review Stats</summary>")
  parts.push("")
  parts.push(
    `- **Reviewers**: ${synthesized.summary.successfulReviewers}/${synthesized.summary.totalReviewers} completed`,
  )

  const successfulReviewers = outputs.filter((o) => o.success)
  if (successfulReviewers.length > 0) {
    for (const reviewer of successfulReviewers) {
      const commentCount = reviewer.review?.comments.length || 0
      parts.push(`  - ${reviewer.name}: ${commentCount} comments (${reviewer.durationMs}ms)`)
    }
  }

  parts.push(
    `- **Issues Found**: ${synthesized.summary.criticalIssues} critical, ${synthesized.summary.warnings} warnings, ${synthesized.summary.infos} info`,
  )
  parts.push("")
  parts.push("</details>")
  parts.push("")
  parts.push("---")
  parts.push("")
  parts.push("*Reviewed by [owo-pr-review](https://github.com/RawToast/owo)*")

  return parts.join("\n")
}

/**
 * Format comment body with severity indicator
 */
function formatCommentBody(comment: SynthesizedReview["comments"][0]): string {
  const severityEmoji = {
    critical: "🚨",
    warning: "⚠️",
    info: "💡",
  }[comment.severity]

  return `${severityEmoji} **${comment.severity.toUpperCase()}** (${comment.reviewer})\n\n${comment.body}\n\n${OWO_COMMENT_MARKER}`
}

/**
 * Legacy single-reviewer mode (original implementation)
 */
async function runLegacyReview(
  ai: AIClient,
  github: GitHubClient,
  pr: PRData,
  diff: string,
  options: ReviewOptions,
): Promise<ReviewResult> {
  const { buildReviewPrompt } = await import("./ai/prompts")
  const { parseReviewResponse, validateComments } = await import("./ai/parser")

  console.log("[pr-review] Running in legacy single-reviewer mode...")

  const reviewPrompt = buildReviewPrompt(pr, diff)
  console.log("[pr-review] Requesting review from AI...")

  const modelConfig = options.model
    ? {
        providerID: options.model.split("/")[0],
        modelID: options.model.split("/").slice(1).join("/"),
      }
    : undefined

  const { prompt: promptFn } = await import("./ai/client")
  const { response } = await promptFn(ai, reviewPrompt, { model: modelConfig })

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

  // Dry run
  if (options.dryRun) {
    console.log("[pr-review] Dry run - not posting review")
    return {
      success: true,
      review,
    }
  }

  // Submit review
  console.log("[pr-review] Submitting review...")
  const { submitReview: submitLegacyReview } = await import("./github/review")
  const result = await submitLegacyReview(
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
}

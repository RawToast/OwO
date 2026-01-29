import type { AIClient } from "../ai/client"
import type { PRData } from "../github/types"
import type { PRReviewConfig, ReviewerOutput, SynthesizedReview } from "../config/types"
import { runReviewer } from "./runner"

/**
 * Run all reviewers in parallel
 */
export async function runAllReviewers(
  ai: AIClient,
  pr: PRData,
  diff: string,
  config: PRReviewConfig,
  repoRoot: string,
): Promise<ReviewerOutput[]> {
  const enabledReviewers = config.reviewers.filter((reviewer) => reviewer.enabled !== false)

  if (enabledReviewers.length === 0) {
    console.warn("[pr-review] No reviewers enabled")
    return []
  }

  console.log(`[pr-review] Running ${enabledReviewers.length} reviewers in parallel...`)

  const results = await Promise.allSettled(
    enabledReviewers.map((reviewer) => runReviewer(ai, pr, diff, reviewer, repoRoot)),
  )

  const outputs: ReviewerOutput[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const reviewerName = enabledReviewers[i].name

    if (result.status === "fulfilled") {
      outputs.push(result.value)
      continue
    }

    console.error(`[pr-review] Reviewer ${reviewerName} threw exception:`, result.reason)
    outputs.push({
      name: reviewerName,
      success: false,
      error: String(result.reason),
      durationMs: 0,
    })
  }

  const successful = outputs.filter((output) => output.success).length
  console.log(`[pr-review] Reviewers complete: ${successful}/${outputs.length} successful`)

  return outputs
}

/**
 * Synthesize reviewer outputs into final review (without AI verifier)
 * Comments are merged via code to preserve line numbers
 */
export function synthesizeReview(outputs: ReviewerOutput[]): SynthesizedReview {
  const successfulOutputs = outputs.filter((output) => output.success && output.review)
  const comments: SynthesizedReview["comments"] = []

  for (const output of successfulOutputs) {
    if (!output.review) continue

    for (const comment of output.review.comments) {
      comments.push({
        path: comment.path,
        line: comment.line,
        body: comment.body,
        side: comment.side || "RIGHT",
        severity: comment.severity || "warning",
        reviewer: output.name,
      })
    }
  }

  const overviewParts: string[] = []
  overviewParts.push("## Review Summary")
  overviewParts.push("")

  for (const output of successfulOutputs) {
    if (output.review?.overview) {
      overviewParts.push(`**${output.name}**: ${output.review.overview}`)
    }
  }

  overviewParts.push("")
  overviewParts.push(`*Reviewed by ${successfulOutputs.length} reviewers*`)

  const criticalIssues = comments.filter((c) => c.severity === "critical").length
  const warnings = comments.filter((c) => c.severity === "warning").length
  const infos = comments.filter((c) => c.severity === "info").length

  return {
    overview: overviewParts.join("\n"),
    comments,
    summary: {
      totalReviewers: outputs.length,
      successfulReviewers: successfulOutputs.length,
      criticalIssues,
      warnings,
      infos,
    },
    passed: criticalIssues === 0,
  }
}

import type { ReviewerOutput, SeverityLevel, SynthesizedReview } from "../config/types"

const SEVERITY_ORDER = {
  critical: 3,
  warning: 2,
  info: 1,
}

/**
 * Merge comments from all reviewers, deduplicate, and filter by severity
 */
export function mergeAndDeduplicateComments(
  outputs: ReviewerOutput[],
  level: SeverityLevel,
): SynthesizedReview["comments"] {
  const allComments: SynthesizedReview["comments"] = []

  for (const output of outputs) {
    if (!output.success || !output.review) continue

    for (const comment of output.review.comments) {
      allComments.push({
        path: comment.path,
        line: comment.line,
        body: comment.body,
        side: comment.side || "RIGHT",
        severity: comment.severity || "warning",
        reviewer: output.name,
        start_line: comment.start_line,
        start_side: comment.start_side,
      })
    }
  }

  const deduplicated = deduplicateComments(allComments)
  return filterCommentsByLevel(deduplicated, level)
}

/**
 * Deduplicate comments by path+line
 * Keeps highest severity comment per location
 */
export function deduplicateComments(
  comments: SynthesizedReview["comments"],
): SynthesizedReview["comments"] {
  const byLocation = new Map<string, SynthesizedReview["comments"][0]>()

  for (const comment of comments) {
    const key = `${comment.path}:${comment.line}:${comment.side ?? "RIGHT"}`
    const existing = byLocation.get(key)

    if (!existing) {
      byLocation.set(key, comment)
      continue
    }

    const existingSeverity = SEVERITY_ORDER[existing.severity]
    const newSeverity = SEVERITY_ORDER[comment.severity]
    if (newSeverity > existingSeverity) {
      byLocation.set(key, comment)
    }
  }

  return Array.from(byLocation.values())
}

/**
 * Filter comments by minimum severity level
 */
export function filterCommentsByLevel<T extends { severity: string }>(
  comments: T[],
  level: SeverityLevel,
): T[] {
  const minLevel = SEVERITY_ORDER[level]
  return comments.filter(
    (comment) => SEVERITY_ORDER[comment.severity as keyof typeof SEVERITY_ORDER] >= minLevel,
  )
}

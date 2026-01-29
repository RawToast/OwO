import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { AIClient } from "../ai/client"
import { prompt } from "../ai/client"
import type {
  ReviewerOutput,
  SeverityLevel,
  SynthesizedReview,
  VerifierConfig,
} from "../config/types"
import { DEFAULT_VERIFIER_PROMPT } from "../config/defaults"

const SEVERITY_ORDER = {
  critical: 3,
  warning: 2,
  info: 1,
}

/**
 * Synthesize and verify reviewer outputs
 * - Comments are merged via CODE (preserves line numbers)
 * - AI only synthesizes the overview
 */
export async function verifyAndSynthesize(
  ai: AIClient,
  outputs: ReviewerOutput[],
  verifierConfig: VerifierConfig | undefined,
  repoRoot: string,
): Promise<SynthesizedReview> {
  const startTime = Date.now()
  const level = verifierConfig?.level ?? "info"

  const mergedComments = mergeAndDeduplicateComments(outputs, level)

  if (!verifierConfig?.enabled) {
    console.log("[pr-review] Verifier disabled, using basic synthesis")
    return basicSynthesis(outputs, mergedComments, level)
  }

  try {
    console.log("[pr-review] Running verifier to synthesize overview...")

    const overviewPrompt = buildOverviewPrompt(outputs, verifierConfig, repoRoot)
    const modelConfig = verifierConfig.model
      ? {
          providerID: verifierConfig.model.split("/")[0],
          modelID: verifierConfig.model.split("/").slice(1).join("/"),
        }
      : undefined

    const { response } = await prompt(ai, overviewPrompt, { model: modelConfig })
    const { overview, passed } = parseOverviewResponse(response)

    const durationMs = Date.now() - startTime
    console.log(`[pr-review] Verifier completed in ${durationMs}ms`)

    const criticalIssues = mergedComments.filter((c) => c.severity === "critical").length
    const warnings = mergedComments.filter((c) => c.severity === "warning").length
    const infos = mergedComments.filter((c) => c.severity === "info").length

    return {
      overview,
      comments: mergedComments,
      summary: {
        totalReviewers: outputs.length,
        successfulReviewers: outputs.filter((o) => o.success).length,
        criticalIssues,
        warnings,
        infos,
      },
      passed: passed ?? criticalIssues === 0,
    }
  } catch (error) {
    console.error("[pr-review] Verifier failed:", error)
    console.log("[pr-review] Falling back to basic synthesis")
    return basicSynthesis(outputs, mergedComments, level)
  }
}

function mergeAndDeduplicateComments(
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
    const key = `${comment.path}:${comment.line}`
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

function buildOverviewPrompt(
  outputs: ReviewerOutput[],
  config: VerifierConfig,
  repoRoot: string,
): string {
  let basePrompt = config.prompt || DEFAULT_VERIFIER_PROMPT

  if (config.promptFile) {
    const promptPath = join(repoRoot, config.promptFile)
    if (existsSync(promptPath)) {
      try {
        basePrompt = readFileSync(promptPath, "utf-8")
      } catch {
        basePrompt = config.prompt || DEFAULT_VERIFIER_PROMPT
      }
    }
  }

  const summaryParts: string[] = []
  summaryParts.push("## Reviewer Summaries")
  summaryParts.push("")

  for (const output of outputs) {
    if (!output.success) {
      summaryParts.push(`### ${output.name} - FAILED`)
      summaryParts.push(`Error: ${output.error}`)
      summaryParts.push("")
      continue
    }

    if (!output.review) continue

    summaryParts.push(`### ${output.name}`)
    summaryParts.push(output.review.overview)
    summaryParts.push(`(${output.review.comments.length} inline comments)`)
    summaryParts.push("")
  }

  return `${basePrompt}

${summaryParts.join("\n")}

Synthesize these summaries into a unified overview. Do NOT include or modify inline comments.`
}

function parseOverviewResponse(response: string): { overview: string; passed?: boolean } {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : response

  try {
    const parsed = JSON.parse(jsonStr.trim())
    return {
      overview: parsed.overview || response,
      passed: parsed.passed,
    }
  } catch {
    return { overview: response }
  }
}

/**
 * Basic synthesis without AI verification
 */
export function basicSynthesis(
  outputs: ReviewerOutput[],
  mergedComments?: SynthesizedReview["comments"],
  level: SeverityLevel = "info",
): SynthesizedReview {
  const successfulOutputs = outputs.filter((o) => o.success && o.review)
  const comments = mergedComments ?? mergeAndDeduplicateComments(outputs, level)

  const overviewParts: string[] = []
  overviewParts.push("## Review Summary")
  overviewParts.push("")

  for (const output of successfulOutputs) {
    if (output.review?.overview) {
      overviewParts.push(`### ${output.name}`)
      overviewParts.push(output.review.overview)
      overviewParts.push("")
    }
  }

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

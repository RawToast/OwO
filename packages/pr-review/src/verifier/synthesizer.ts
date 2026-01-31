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
import type { PRData } from "../github/types"
import { DEFAULT_VERIFIER_PROMPT } from "../config/defaults"

const SEVERITY_ORDER = {
  critical: 3,
  warning: 2,
  info: 1,
}

/**
 * Synthesize and verify reviewer outputs
 * - Comments are merged via CODE (preserves line numbers)
 * - AI synthesizes the formatted overview with diagrams
 */
export async function verifyAndSynthesize(
  ai: AIClient,
  outputs: ReviewerOutput[],
  verifierConfig: VerifierConfig | undefined,
  repoRoot: string,
  prData?: PRData,
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

    const overviewPrompt = buildOverviewPrompt(outputs, verifierConfig, repoRoot, prData)
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

function buildOverviewPrompt(
  outputs: ReviewerOutput[],
  config: VerifierConfig,
  repoRoot: string,
  prData?: PRData,
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

  // Add diagram instruction based on config
  const diagramsEnabled = config.diagrams ?? true
  if (!diagramsEnabled) {
    basePrompt = basePrompt.replace(
      /## Diagrams[\s\S]*?(?=## Verdict|## Response Format)/,
      "## Diagrams\n\n[Diagrams disabled]\n\n",
    )
  }

  const parts: string[] = []

  // Add PR context if available
  if (prData) {
    parts.push("## PR Context")
    parts.push("")
    parts.push(`**Title:** ${prData.title}`)
    parts.push(`**Author:** ${prData.author}`)
    parts.push(`**Branch:** ${prData.headRef} → ${prData.baseRef}`)
    parts.push(
      `**Stats:** +${prData.additions}/-${prData.deletions} across ${prData.files.length} files`,
    )
    parts.push("")

    if (prData.body) {
      parts.push("**Description:**")
      parts.push(prData.body)
      parts.push("")
    }

    parts.push("### Files Changed")
    parts.push("")
    parts.push("| File | Type | Lines |")
    parts.push("|------|------|-------|")
    for (const file of prData.files) {
      const lines = `+${file.additions}/-${file.deletions}`
      parts.push(`| ${file.path} | ${file.changeType} | ${lines} |`)
    }
    parts.push("")

    if (prData.commits.length > 0) {
      parts.push("### Commits")
      parts.push("")
      for (const commit of prData.commits) {
        const shortOid = commit.oid.slice(0, 7)
        const firstLine = commit.message.split("\n")[0]
        parts.push(`- \`${shortOid}\` ${firstLine}`)
      }
      parts.push("")
    }
  }

  // Add reviewer summaries
  parts.push("## Reviewer Summaries")
  parts.push("")

  for (const output of outputs) {
    if (!output.success) {
      parts.push(`### ${output.name} - FAILED`)
      parts.push(`Error: ${output.error}`)
      parts.push("")
      continue
    }

    if (!output.review) continue

    parts.push(`### ${output.name}`)
    parts.push(output.review.overview)
    parts.push(`(${output.review.comments.length} inline comments)`)
    parts.push("")
  }

  return `${basePrompt}

---

${parts.join("\n")}

---

Now synthesize the above into a well-formatted review following the exact format specified.
Use the PR context to populate the Changes table with accurate file information and reasons.
Do NOT include or modify inline comments - they are handled separately.`
}

function parseOverviewResponse(response: string): { overview: string; passed?: boolean } {
  // Try to find JSON in code block first
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim())
      if (parsed.overview) {
        return {
          overview: parsed.overview,
          passed: parsed.passed,
        }
      }
    } catch (e) {
      console.warn("[pr-review] Failed to parse JSON from code block:", e)
    }
  }

  // Try to find raw JSON object (without code block)
  // Use a more careful regex that finds the outermost braces
  const rawJsonMatch = response.match(/\{\s*"overview"\s*:\s*"[\s\S]*?\n\s*\}/)
  if (rawJsonMatch) {
    try {
      const parsed = JSON.parse(rawJsonMatch[0])
      if (parsed.overview) {
        return {
          overview: parsed.overview,
          passed: parsed.passed,
        }
      }
    } catch (e) {
      console.warn("[pr-review] Failed to parse raw JSON:", e)
    }
  }

  // Try extracting overview field directly with a more lenient approach
  // This handles cases where the JSON has escaped newlines in the string
  const overviewMatch = response.match(/"overview"\s*:\s*"([\s\S]*?)"\s*,\s*"passed"/)
  const passedMatch = response.match(/"passed"\s*:\s*(true|false)/)

  if (overviewMatch) {
    // Unescape the string content
    const overview = overviewMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")

    return {
      overview,
      passed: passedMatch ? passedMatch[1] === "true" : undefined,
    }
  }

  // Fallback: return the response as-is (strip any JSON artifacts)
  console.warn("[pr-review] Could not extract overview from JSON, using raw response")
  return { overview: response }
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

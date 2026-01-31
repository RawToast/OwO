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
import { mergeAndDeduplicateComments } from "./comments"

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
  const level = verifierConfig?.level ?? "warning"

  const mergedComments = mergeAndDeduplicateComments(outputs, level)

  // Assign IDs to comments for verifier tracking
  const commentsWithIds = mergedComments.map((comment, index) => ({
    ...comment,
    id: `C${index + 1}`,
  }))

  if (!verifierConfig?.enabled) {
    console.log("[pr-review] Verifier disabled, using basic synthesis")
    return basicSynthesis(outputs, mergedComments, level)
  }

  try {
    console.log("[pr-review] Running verifier to synthesize overview...")

    const overviewPrompt = buildOverviewPrompt(
      outputs,
      commentsWithIds,
      verifierConfig,
      repoRoot,
      prData,
    )
    const modelConfig = verifierConfig.model
      ? {
          providerID: verifierConfig.model.split("/")[0],
          modelID: verifierConfig.model.split("/").slice(1).join("/"),
        }
      : undefined

    // Add timeout to prevent hanging on slow AI responses
    const VERIFIER_TIMEOUT_MS = 180_000 // 180 seconds
    let timerId: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(
        () => reject(new Error("Verifier prompt timed out")),
        VERIFIER_TIMEOUT_MS,
      )
    })

    let response: string
    try {
      const result = await Promise.race([
        prompt(ai, overviewPrompt, {
          model: modelConfig,
          temperature: verifierConfig.temperature,
        }),
        timeoutPromise,
      ])
      response = result.response
    } finally {
      clearTimeout(timerId!)
    }
    const { overview, passed, validCommentIds } = parseOverviewResponse(response)

    const durationMs = Date.now() - startTime
    console.log(`[pr-review] Verifier completed in ${durationMs}ms`)

    // Filter comments to only those validated by verifier
    const validatedComments = validCommentIds
      ? commentsWithIds
          .filter((c) => validCommentIds.includes(c.id))
          .map(({ id: _, ...comment }) => comment) // Remove the temporary ID
      : mergedComments // Fallback if verifier didn't return IDs

    if (validCommentIds) {
      const filtered = mergedComments.length - validatedComments.length
      if (filtered > 0) {
        console.log(`[pr-review] Verifier filtered out ${filtered} comments`)
      }
    }

    const criticalIssues = validatedComments.filter((c) => c.severity === "critical").length
    const warnings = validatedComments.filter((c) => c.severity === "warning").length
    const infos = validatedComments.filter((c) => c.severity === "info").length

    return {
      overview,
      comments: validatedComments,
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

type CommentWithId = SynthesizedReview["comments"][0] & { id: string }

function buildOverviewPrompt(
  outputs: ReviewerOutput[],
  commentsWithIds: CommentWithId[],
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
    parts.push("")
  }

  // Add inline comments with IDs for verification
  parts.push("## Inline Comments to Verify")
  parts.push("")
  parts.push("Review each comment and include its ID in `validCommentIds` if it should be posted:")
  parts.push("")

  for (const comment of commentsWithIds) {
    parts.push(
      `### ${comment.id}: ${comment.path}:${comment.start_line ? `${comment.start_line}-` : ""}${comment.line}`,
    )
    parts.push(`**Reviewer:** ${comment.reviewer} | **Severity:** ${comment.severity}`)
    parts.push("")
    parts.push(comment.body)
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

interface ParsedOverviewResponse {
  overview: string
  passed?: boolean
  validCommentIds?: string[]
}

export function parseOverviewResponse(response: string): ParsedOverviewResponse {
  // Try to find JSON in code block first
  // Use greedy matching anchored to end-of-string to handle nested code blocks
  // (e.g., mermaid diagrams inside the overview field)
  const jsonMatch = response.match(/```json\n([\s\S]*)\n```(?=\s*$)/)

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim())
      if (parsed.overview) {
        return {
          overview: parsed.overview,
          passed: parsed.passed,
          validCommentIds: Array.isArray(parsed.validCommentIds)
            ? parsed.validCommentIds
            : undefined,
        }
      }
    } catch (e) {
      console.warn("[pr-review] Failed to parse JSON from code block:", e)
      // Add debugging info for troubleshooting
      const content = jsonMatch[1]
      console.warn("[pr-review] Content length:", content.length)
      console.warn("[pr-review] Last 300 chars:", content.slice(-300))
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
          validCommentIds: Array.isArray(parsed.validCommentIds)
            ? parsed.validCommentIds
            : undefined,
        }
      }
    } catch (e) {
      console.warn("[pr-review] Failed to parse raw JSON:", e)
    }
  }

  // Try extracting fields directly with a more lenient approach
  // This handles cases where the JSON has escaped newlines in the string
  const overviewMatch = response.match(/"overview"\s*:\s*"([\s\S]*?)"\s*,\s*"passed"/)
  const passedMatch = response.match(/"passed"\s*:\s*(true|false)/)
  const validIdsMatch = response.match(/"validCommentIds"\s*:\s*\[([\s\S]*?)\]/)

  if (overviewMatch) {
    // Unescape the string content
    const overview = overviewMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")

    // Parse validCommentIds array
    let validCommentIds: string[] | undefined
    if (validIdsMatch) {
      try {
        validCommentIds = JSON.parse(`[${validIdsMatch[1]}]`)
      } catch {
        // Fallback: extract quoted strings manually
        const idMatches = validIdsMatch[1].match(/"([^"]+)"/g)
        if (idMatches) {
          validCommentIds = idMatches.map((m) => m.replace(/"/g, ""))
        }
      }
    }

    return {
      overview,
      passed: passedMatch ? passedMatch[1] === "true" : undefined,
      validCommentIds,
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
  level: SeverityLevel = "warning",
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

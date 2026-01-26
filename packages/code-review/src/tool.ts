/**
 * Code Review Tool
 *
 * Single tool that gathers diff, dispatches reviewers, returns combined output.
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"
import type { CodeReviewConfig } from "@owo/config"
import { gatherDiff, type DiffMode } from "./git"
import { ReviewManager } from "./review-manager"
import type { ReviewResult } from "./types"

export type CreateToolOptions = {
  client: OpencodeClient
  config: CodeReviewConfig
  directory: string
  exec: (cmd: string, opts: { cwd: string }) => Promise<string>
  resolveContextArray: (contexts: Array<string | { file: string }>) => string
}

export function createReviewTool(options: CreateToolOptions): ToolDefinition {
  const { client, config, directory, exec, resolveContextArray } = options
  const manager = new ReviewManager(client, directory)

  return tool({
    description: `Review code changes with ${config.reviewers?.length ?? 1} parallel reviewer(s).
Gathers git diff based on mode, dispatches reviewers, returns combined feedback.

Modes:
- vs-main: Changes compared to main branch
- unstaged: Unstaged working directory changes
- staged: Staged changes (git add)
- commits: Specific commit(s) - provide refs array`,

    args: {
      query: tool.schema.string().describe("Review request/focus from user"),
      mode: tool.schema
        .enum(["vs-main", "unstaged", "staged", "commits"])
        .describe("What changes to review"),
      refs: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Commit refs for 'commits' mode (1-2 refs)"),
    },

    async execute(args, context) {
      const startTime = Date.now()

      try {
        // 1. Gather diff
        const diffResult = await gatherDiff(
          { mode: args.mode as DiffMode, refs: args.refs },
          { exec, cwd: directory },
        )

        if (!diffResult.diff.trim()) {
          return `No changes found for mode "${args.mode}". Nothing to review.`
        }

        // 2. Launch parallel reviewers
        const reviewers = config.reviewers ?? [{ agent: "oracle" }]
        const reviewerResults = await manager.launchReviewers(
          reviewers,
          diffResult.diff,
          args.query,
          context.sessionID,
          resolveContextArray,
        )

        // 3. Build result
        const result: ReviewResult = {
          input: { query: args.query, mode: args.mode as DiffMode, refs: args.refs },
          diff: diffResult.diff,
          reviewers: reviewerResults,
          totalDuration: Date.now() - startTime,
        }

        // 4. Resolve optional config
        if (config.verify?.guidance) {
          result.verifyGuidance = resolveContextArray(config.verify.guidance)
        }

        if (config.output?.template) {
          result.outputTemplate = resolveContextArray(config.output.template)
        }

        // 5. Format output
        return formatReviewOutput(result)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Code review failed: ${errorMsg}`
      }
    },
  })
}

/**
 * Format the review result as markdown
 */
function formatReviewOutput(result: ReviewResult): string {
  const parts: string[] = []

  parts.push("# Code Review Results")
  parts.push("")
  parts.push(`**Query:** ${result.input.query}`)
  parts.push(`**Mode:** ${result.input.mode}`)
  if (result.input.refs?.length) {
    parts.push(`**Refs:** ${result.input.refs.join(", ")}`)
  }
  parts.push(`**Duration:** ${(result.totalDuration / 1000).toFixed(1)}s`)
  parts.push("")

  // Diff summary (truncated)
  const diffLines = result.diff.split("\n")
  const diffPreview = diffLines.slice(0, 20).join("\n")
  parts.push("<details>")
  parts.push(`<summary>Diff (${diffLines.length} lines)</summary>`)
  parts.push("")
  parts.push("```diff")
  parts.push(diffPreview)
  if (diffLines.length > 20) {
    parts.push(`... (${diffLines.length - 20} more lines)`)
  }
  parts.push("```")
  parts.push("</details>")
  parts.push("")

  // Each reviewer's output
  for (let i = 0; i < result.reviewers.length; i++) {
    const reviewer = result.reviewers[i]
    parts.push(`## Reviewer ${i + 1}: ${reviewer.agent}`)
    if (reviewer.focus) {
      parts.push(`*Focus: ${reviewer.focus}*`)
    }
    parts.push(`*Duration: ${(reviewer.duration / 1000).toFixed(1)}s*`)
    parts.push("")
    parts.push(reviewer.output)
    parts.push("")
  }

  // Verify guidance
  if (result.verifyGuidance) {
    parts.push("---")
    parts.push("## Verification Guidance")
    parts.push("")
    parts.push(result.verifyGuidance)
    parts.push("")
  }

  // Output template
  if (result.outputTemplate) {
    parts.push("---")
    parts.push("## Output Formatting Instructions")
    parts.push("")
    parts.push(result.outputTemplate)
    parts.push("")
  }

  return parts.join("\n")
}

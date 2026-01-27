import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { $ } from "bun"
import {
  requirePRContext,
  createOctokit,
  mapCommentsToPositions,
  formatUnmappedComments,
} from "../github"

const InlineCommentInputSchema = tool.schema.object({
  path: tool.schema.string().describe("File path relative to repo root"),
  line: tool.schema.number().describe("Line number in the NEW version of the file"),
  body: tool.schema.string().describe("Comment content (markdown supported)"),
  side: tool.schema.enum(["LEFT", "RIGHT"]).default("RIGHT").describe("Which side of diff"),
})

export const submitReviewTool: ToolDefinition = tool({
  description: `Submit a code review with an overview comment and inline comments on specific lines.

IMPORTANT: Inline comments can only be placed on lines that are part of the diff.
If you want to comment on a line that's not in the diff, include it in the overview instead.

The tool will automatically:
1. Map your line numbers to GitHub's diff positions
2. Move any comments on non-diff lines to the overview
3. Post the review via GitHub API`,
  args: {
    overview: tool.schema
      .string()
      .describe(
        "Markdown overview comment summarizing the review. Will appear at the top of the review.",
      ),
    comments: tool.schema
      .array(InlineCommentInputSchema)
      .default([])
      .describe(
        "Inline comments on specific lines. Each needs path, line number, and comment body.",
      ),
    event: tool.schema
      .enum(["COMMENT", "APPROVE", "REQUEST_CHANGES"])
      .default("COMMENT")
      .describe("Review action. Use COMMENT for now (APPROVE/REQUEST_CHANGES coming soon)."),
  },
  async execute(args) {
    const ctx = requirePRContext()
    const octokit = createOctokit()

    // Get the diff to map positions
    let diffContent: string
    try {
      diffContent = await $`git diff ${ctx.baseSha}...${ctx.headSha}`.text()
    } catch {
      await $`git fetch origin ${ctx.baseRef} --depth=100`.quiet()
      diffContent = await $`git diff ${ctx.baseSha}...${ctx.headSha}`.text()
    }

    // Map comments to diff positions
    const { mapped, unmapped } = mapCommentsToPositions(diffContent, args.comments)

    // Build the overview with unmapped comments appended
    let finalOverview = args.overview
    if (unmapped.length > 0) {
      finalOverview += formatUnmappedComments(unmapped)
    }

    // Add footer
    finalOverview += `\n\n---\n*Reviewed by [owo-reviewer](https://github.com/jmagar/owo) • ${mapped.length} inline comments*`

    // Build GitHub API review comments
    const reviewComments = mapped.map((c) => ({
      path: c.path,
      position: c.position,
      body: c.body,
    }))

    // Submit the review
    const { data: review } = await octokit.rest.pulls.createReview({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: ctx.number,
      commit_id: ctx.headSha,
      body: finalOverview,
      event: args.event,
      comments: reviewComments,
    })

    const reviewUrl = `https://github.com/${ctx.owner}/${ctx.repo}/pull/${ctx.number}#pullrequestreview-${review.id}`

    return JSON.stringify(
      {
        success: true,
        reviewId: review.id,
        reviewUrl,
        inlineComments: mapped.length,
        overviewComments: unmapped.length,
        message: `Review submitted successfully! ${mapped.length} inline comments, ${unmapped.length} moved to overview.`,
      },
      null,
      2,
    )
  },
})

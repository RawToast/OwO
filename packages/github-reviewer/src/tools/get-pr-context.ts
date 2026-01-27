import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { $ } from "bun"
import { requirePRContext, createOctokit } from "../github"
import type { FileChange } from "../types"

export const getPRContextTool: ToolDefinition = tool({
  description: `Get PR context including diff and file changes for code review.
Returns JSON with PR metadata, the unified diff, and a list of changed files.
Use this to understand what changes are being reviewed before analyzing them.`,
  args: {
    include_diff: tool.schema
      .boolean()
      .default(true)
      .describe("Include the full unified diff content"),
    include_files: tool.schema
      .boolean()
      .default(true)
      .describe("Include list of changed files with stats"),
  },
  async execute(args) {
    const ctx = requirePRContext()
    const octokit = createOctokit()

    const result: {
      pr: typeof ctx
      diff?: string
      files?: FileChange[]
    } = { pr: ctx }

    if (args.include_diff) {
      try {
        const diffResult = await $`git diff ${ctx.baseSha}...${ctx.headSha}`.text()
        result.diff = diffResult
      } catch (err) {
        await $`git fetch origin ${ctx.baseRef} --depth=100`.quiet()
        const diffResult = await $`git diff ${ctx.baseSha}...${ctx.headSha}`.text()
        result.diff = diffResult
      }
    }

    if (args.include_files) {
      const { data: files } = await octokit.rest.pulls.listFiles({
        owner: ctx.owner,
        repo: ctx.repo,
        pull_number: ctx.number,
        per_page: 100,
      })

      result.files = files.map((f) => ({
        path: f.filename,
        status: f.status as FileChange["status"],
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }))
    }

    return JSON.stringify(result, null, 2)
  },
})

import type { Plugin } from "@opencode-ai/plugin"
import { getPRContextTool } from "./tools/get-pr-context"
import { submitReviewTool } from "./tools/submit-review"

export const GitHubReviewerPlugin: Plugin = async (_ctx) => {
  console.log("[github-reviewer] Plugin loaded")

  return {
    tool: {
      get_pr_context: getPRContextTool,
      submit_review: submitReviewTool,
    },
  }
}

export default GitHubReviewerPlugin

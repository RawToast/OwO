import type { Plugin } from "@opencode-ai/plugin"
import { getPRContextTool } from "./tools/get-pr-context"

export const GitHubReviewerPlugin: Plugin = async (ctx) => {
  console.log("[github-reviewer] Plugin loaded")

  return {
    tool: {
      get_pr_context: getPRContextTool,
    },
  }
}

export default GitHubReviewerPlugin

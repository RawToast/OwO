import type { Plugin } from "@opencode-ai/plugin"

export const GitHubReviewerPlugin: Plugin = async (ctx) => {
  console.log("[github-reviewer] Plugin loaded")

  return {
    tool: {
      // Tools will be added in subsequent tasks
    },
  }
}

export default GitHubReviewerPlugin

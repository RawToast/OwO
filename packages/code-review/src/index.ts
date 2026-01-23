/**
 * Code Review Plugin
 *
 * Multi-stage code review with parallel reviewer agents.
 * Gathers git diff, dispatches reviewers, returns combined output.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig, resolveContext } from "@owo/config"
import { createReviewTool } from "./tool"

const CodeReviewPlugin: Plugin = async (ctx) => {
  // Load config
  let configResult
  try {
    configResult = loadConfig(ctx.directory)
  } catch (err) {
    const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error(`[owo/code-review] Failed to load config: ${errorMessage}`)
    return {}
  }

  const { config, configDir } = configResult

  // Check if disabled
  if (config.review?.enabled === false) {
    return {}
  }

  // Create context resolver
  const resolve = (context: string | { file: string }) => resolveContext(context, configDir)

  // Create exec function from Bun shell
  const exec = async (cmd: string, opts: { cwd: string }) => {
    const result = await ctx.$`cd ${opts.cwd} && ${cmd}`.text()
    return result
  }

  // Create the review tool
  const reviewTool = createReviewTool({
    client: ctx.client,
    config: config.review ?? { enabled: true, reviewers: [{ agent: "oracle" }] },
    directory: ctx.directory,
    exec,
    resolveContext: resolve,
  })

  return {
    tool: {
      review: reviewTool,
    },
  }
}

export default CodeReviewPlugin

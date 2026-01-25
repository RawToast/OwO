/**
 * CodeRabbit Tools
 *
 * Integration with CodeRabbit CLI for AI-powered code review:
 * - coderabbit_review: Review code changes
 *
 * Requires CodeRabbit CLI to be installed and configured.
 * Get it at: https://coderabbit.ai
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { CodeRabbitToolConfig } from "../types"

export type CodeRabbitTools = {
  [key: string]: ToolDefinition
}

async function runCoderabbit(args: { committed: boolean; base?: string }, signal?: AbortSignal) {
  const cmd = args.committed
    ? ["coderabbit", "--plain", "--base", args.base ?? "master"]
    : ["coderabbit", "--plain"]

  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  })

  // Handle abort signal
  if (signal) {
    signal.addEventListener("abort", () => {
      proc.kill()
    })
  }

  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim() || "Coderabbit exited with an error"
    throw new Error(detail)
  }

  const output = stdout.trim()
  if (!output) return "CodeRabbit produced no output. Review passed."

  return output
}

export function createCodeRabbitTools(config?: CodeRabbitToolConfig): CodeRabbitTools {
  // If explicitly disabled, return empty tools
  if (config?.enabled === false) {
    return {}
  }

  const coderabbitReview = tool({
    description:
      "Run CodeRabbit review on current changes and return the output. If changes are committed, review against the base branch.",
    args: {
      committed: tool.schema
        .boolean()
        .optional()
        .describe("Whether changes are already committed. Default false."),
      base: tool.schema
        .string()
        .optional()
        .describe("Base branch when committed is true. Default master."),
    },
    async execute(args, ctx) {
      try {
        const committed = args.committed ?? false
        const output = await runCoderabbit({ committed, base: args.base }, ctx.abort)
        return output
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "CodeRabbit review was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `CodeRabbit review failed: ${errorMsg}`
      }
    },
  })

  return {
    coderabbit_review: coderabbitReview,
  }
}

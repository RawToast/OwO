/**
 * Review Manager
 *
 * Orchestrates parallel reviewer sessions and collects results.
 */

import type { OpencodeClient } from "@opencode-ai/sdk"
import type { ReviewerConfig } from "@owo/config"
import type { ReviewerResult } from "./types"

export type LaunchReviewerInput = {
  config: ReviewerConfig
  diff: string
  query: string
  parentSessionID: string
  contextContent?: string // resolved context file content
}

export class ReviewManager {
  private client: OpencodeClient
  private directory: string

  constructor(client: OpencodeClient, directory: string) {
    this.client = client
    this.directory = directory
  }

  /**
   * Launch a single reviewer session and wait for completion
   */
  async launchReviewer(input: LaunchReviewerInput): Promise<ReviewerResult> {
    const startTime = Date.now()

    // Create child session
    let sessionID: string
    try {
      const createResult = await this.client.session.create({
        body: { parentID: input.parentSessionID },
      })
      const sessionData = "data" in createResult ? createResult.data : createResult
      const id = sessionData?.id
      if (!id) {
        throw new Error("No session ID returned")
      }
      sessionID = id
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to create reviewer session: ${msg}`)
    }

    // Send prompt with retry logic for agent errors
    const sendPrompt = async (retryWithoutAgent = false): Promise<void> => {
      try {
        await this.client.session.prompt({
          path: { id: sessionID },
          body: {
            ...(retryWithoutAgent ? {} : { agent: input.config.agent }),
            parts: [{ type: "text", text: this.buildReviewPrompt(input) }],
          },
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        if (
          !retryWithoutAgent &&
          (errorMsg.includes("agent.name") || errorMsg.includes("undefined is not an object"))
        ) {
          console.warn(
            `[code-review] Agent "${input.config.agent}" not found, retrying with default`,
          )
          return sendPrompt(true)
        }
        throw new Error(`Failed to send review prompt: ${errorMsg}`)
      }
    }

    await sendPrompt()

    // Retrieve the response
    const output = await this.getSessionOutput(sessionID)
    const duration = Date.now() - startTime

    return {
      agent: input.config.agent,
      focus: input.config.focus,
      output,
      sessionID,
      duration,
    }
  }

  /**
   * Launch multiple reviewers in parallel
   * Uses Promise.allSettled so one failure doesn't abort all reviewers
   */
  async launchReviewers(
    configs: ReviewerConfig[],
    diff: string,
    query: string,
    parentSessionID: string,
    resolveContextArray?: (contexts: Array<string | { file: string }>) => string,
  ): Promise<ReviewerResult[]> {
    const promises = configs.map((config) => {
      // Resolve context content if present
      let contextContent: string | undefined
      if (config.context && resolveContextArray) {
        contextContent = resolveContextArray(config.context)
      }

      return this.launchReviewer({
        config,
        diff,
        query,
        parentSessionID,
        contextContent,
      })
    })

    const results = await Promise.allSettled(promises)

    return results.map((result, i) => {
      if (result.status === "fulfilled") {
        return result.value
      }
      // Return failure as a result with error output
      return {
        agent: configs[i].agent,
        focus: configs[i].focus,
        output: `Review failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        sessionID: "",
        duration: 0,
      }
    })
  }

  /**
   * Build the review prompt for a reviewer
   */
  private buildReviewPrompt(input: LaunchReviewerInput): string {
    const parts: string[] = []

    parts.push("# Code Review Request")
    parts.push("")
    parts.push(`**User Query:** ${input.query}`)
    parts.push("")

    if (input.config.focus) {
      parts.push(`**Review Focus:** ${input.config.focus}`)
      parts.push("")
    }

    if (input.contextContent) {
      parts.push("## Additional Review Instructions")
      parts.push("")
      parts.push(input.contextContent)
      parts.push("")
    }

    parts.push("## Changes to Review")
    parts.push("")
    parts.push("```diff")
    parts.push(input.diff)
    parts.push("```")
    parts.push("")
    parts.push("Please review these changes and provide detailed feedback.")

    return parts.join("\n")
  }

  /**
   * Get the output from a completed session
   */
  private async getSessionOutput(sessionID: string): Promise<string> {
    let messages: unknown[]
    try {
      const messagesResult = await this.client.session.messages({
        path: { id: sessionID },
      })
      messages = ("data" in messagesResult ? messagesResult.data : messagesResult) as unknown[]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Failed to retrieve review output: ${msg}`
    }

    if (!messages || !Array.isArray(messages)) {
      return "No output received from reviewer"
    }

    type MessageWrapper = {
      info: { role: string; error?: { name?: string; data?: { message?: string } } }
      parts: Array<{ type: string; text?: string }>
    }

    // Check for errors first
    const assistantWithError = (messages as MessageWrapper[]).find(
      (m) => m.info.role === "assistant" && m.info.error,
    )
    if (assistantWithError?.info.error) {
      const errorData = assistantWithError.info.error
      const errorMsg = errorData.data?.message ?? errorData.name ?? "Unknown error"
      return `Reviewer error: ${errorMsg}`
    }

    const assistantMessages = (messages as MessageWrapper[]).filter(
      (m) => m.info.role === "assistant" && m.parts && m.parts.length > 0,
    )

    if (assistantMessages.length === 0) {
      return "No output received from reviewer"
    }

    const lastMessage = assistantMessages[assistantMessages.length - 1]
    const textParts = lastMessage.parts.filter((p) => p.type === "text")
    return textParts.map((p) => p.text ?? "").join("\n")
  }
}

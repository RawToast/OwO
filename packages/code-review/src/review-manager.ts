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
    const createResult = await this.client.session.create({
      body: {
        parentID: input.parentSessionID,
      },
    })

    const sessionData = "data" in createResult ? createResult.data : createResult
    const sessionID = sessionData?.id

    if (!sessionID) {
      throw new Error("Failed to create reviewer session")
    }

    // Build the review prompt
    const prompt = this.buildReviewPrompt(input)

    // Send prompt and wait for response
    await this.client.session.prompt({
      path: { id: sessionID },
      body: {
        agent: input.config.agent,
        parts: [{ type: "text", text: prompt }],
      },
    })

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
   */
  async launchReviewers(
    configs: ReviewerConfig[],
    diff: string,
    query: string,
    parentSessionID: string,
    resolveContext?: (ctx: string | { file: string }) => string
  ): Promise<ReviewerResult[]> {
    const promises = configs.map((config) => {
      // Resolve context content if present
      let contextContent: string | undefined
      if (config.context && resolveContext) {
        contextContent = resolveContext(config.context)
      }

      return this.launchReviewer({
        config,
        diff,
        query,
        parentSessionID,
        contextContent,
      })
    })

    return Promise.all(promises)
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
    const messagesResult = await this.client.session.messages({
      path: { id: sessionID },
    })

    const messages = "data" in messagesResult ? messagesResult.data : messagesResult

    if (!messages || !Array.isArray(messages)) {
      return "No output received from reviewer"
    }

    type MessageWrapper = {
      info: { role: string }
      parts: Array<{ type: string; text?: string }>
    }

    const assistantMessages = (messages as MessageWrapper[]).filter(
      (m) => m.info.role === "assistant" && m.parts && m.parts.length > 0
    )

    if (assistantMessages.length === 0) {
      return "No output received from reviewer"
    }

    const lastMessage = assistantMessages[assistantMessages.length - 1]
    const textParts = lastMessage.parts.filter((p) => p.type === "text")
    return textParts.map((p) => p.text ?? "").join("\n")
  }
}

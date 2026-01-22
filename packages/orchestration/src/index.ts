/**
 * @owo/orchestration
 *
 * Background task orchestration with toast notifications for OpenCode.
 * Provides parallel agent execution via fire-and-forget background sessions.
 */

import type { Plugin } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"
import { loadConfig } from "@owo/config"
import { BackgroundManager } from "./background-manager"
import { TaskToastManager } from "./task-toast"
import { createBackgroundTools } from "./tools"

// Re-exports
export { BackgroundManager } from "./background-manager"
export { TaskToastManager } from "./task-toast"
export { createBackgroundTools, type BackgroundTools } from "./tools"
export type { BackgroundTask, TaskStatus, LaunchInput, CompletionNotification } from "./types"

const OrchestrationPlugin: Plugin = async (ctx) => {
  const { config } = loadConfig(ctx.directory)

  // Check if disabled
  if (config.orchestration?.enabled === false) {
    return {}
  }

  // Initialize toast manager (if toasts enabled)
  const toastManager =
    config.orchestration?.toasts !== false ? new TaskToastManager(ctx.client) : undefined

  // Initialize background task manager
  const backgroundManager = new BackgroundManager()
  if (toastManager) {
    backgroundManager.setToastManager(toastManager)
  }

  // Create background tools
  const backgroundTools = createBackgroundTools(backgroundManager, ctx.client)

  return {
    tool: backgroundTools,

    event: async (input: { event: Event }) => {
      const { event } = input

      // Track main session on creation
      if (event.type === "session.created") {
        const props = event.properties as { info?: { id?: string; parentID?: string } }
        const sessionInfo = props?.info

        // Only set main session if it's not a child session (no parent)
        if (sessionInfo?.id && !sessionInfo?.parentID) {
          backgroundManager.setMainSession(sessionInfo.id)
        }
      }

      // Cleanup on session deletion
      if (event.type === "session.deleted") {
        const props = event.properties as { info?: { id?: string } }
        const sessionID = props?.info?.id

        // Clear main session if this was it
        if (sessionID && sessionID === backgroundManager.getMainSession()) {
          backgroundManager.setMainSession(undefined)
        }
      }

      // Detect background task completion via session.idle
      if (event.type === "session.idle") {
        const props = event.properties as { sessionID?: string }
        const sessionID = props?.sessionID
        if (!sessionID) return

        // Handle background task completion
        const notification = backgroundManager.handleSessionIdle(sessionID)

        // If a background task completed, notify the main session
        if (notification) {
          const mainSessionID = backgroundManager.getMainSession()
          if (mainSessionID) {
            // Send notification with retry logic for undefined agent errors
            const sendNotification = async (omitAgent = false) => {
              try {
                await ctx.client.session.prompt({
                  path: { id: mainSessionID },
                  body: {
                    // noReply: true = silent (don't trigger response)
                    // noReply: false = loud (trigger response)
                    noReply: !notification.allComplete,
                    // Preserve the agent mode (omit if retry due to undefined agent)
                    ...(omitAgent ? {} : { agent: notification.parentAgent }),
                    parts: [{ type: "text", text: notification.message }],
                  },
                })
              } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err)
                // Retry without agent if we hit the undefined agent error
                if (
                  !omitAgent &&
                  (errorMsg.includes("agent.name") || errorMsg.includes("undefined"))
                ) {
                  return sendNotification(true)
                }
                // Silently ignore other errors
              }
            }
            await sendNotification()
          }
        }
      }
    },
  }
}

export default OrchestrationPlugin

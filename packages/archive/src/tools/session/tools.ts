/**
 * Session Tools
 *
 * Tools for querying past sessions and learning from previous work:
 * - session_list: List recent sessions
 * - session_search: Search messages across sessions
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"

export type SessionTools = {
  [key: string]: ToolDefinition
}

interface SessionInfo {
  id: string
  title?: string
  parentID?: string
  time?: {
    created?: number
    updated?: number
  }
}

interface MessagePart {
  type: string
  text?: string
}

interface MessageData {
  info?: {
    id?: string
    role?: string
    sessionID?: string
  }
  parts?: MessagePart[]
}

const MAX_SESSIONS_TO_SEARCH = 10
const DEFAULT_SEARCH_LIMIT = 20
const DEFAULT_LIST_LIMIT = 10

export function createSessionTools(client: OpencodeClient): SessionTools {
  const sessionList = tool({
    description: `List recent sessions to find relevant past work.
Use when you need to see what was done before or find a specific session.
Returns session IDs, titles, and creation dates.`,
    args: {
      limit: tool.schema.number().optional().describe("Max sessions to return (default: 10)"),
    },
    async execute(args) {
      try {
        const result = await client.session.list()
        const sessions = (result.data ?? []) as SessionInfo[]

        // Filter out child sessions (background tasks) and sort by recent
        const mainSessions = sessions
          .filter((s) => !s.parentID)
          .slice(0, args.limit ?? DEFAULT_LIST_LIMIT)

        if (mainSessions.length === 0) {
          return "No sessions found."
        }

        const formatted = mainSessions.map((s) => ({
          id: s.id,
          title: s.title ?? "(untitled)",
          created: s.time?.created ? new Date(s.time.created).toISOString() : "unknown",
        }))

        return JSON.stringify(formatted, null, 2)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error"
        return `Failed to list sessions: ${errorMsg}`
      }
    },
  })

  const sessionSearch = tool({
    description: `Search messages across sessions to find how something was done before.
Use when looking for past implementations, solutions, or context.
Searches the last 10 sessions for matching content.`,
    args: {
      query: tool.schema.string().describe("Search query (case-insensitive)"),
      limit: tool.schema.number().optional().describe("Max results to return (default: 20)"),
    },
    async execute(args) {
      try {
        const sessionsResult = await client.session.list()
        const sessions = (sessionsResult.data ?? []) as SessionInfo[]

        // Filter to main sessions only, limit search scope
        const searchSessions = sessions.filter((s) => !s.parentID).slice(0, MAX_SESSIONS_TO_SEARCH)

        if (searchSessions.length === 0) {
          return "No sessions to search."
        }

        const query = args.query.toLowerCase()
        const maxResults = args.limit ?? DEFAULT_SEARCH_LIMIT
        const results: Array<{
          sessionId: string
          sessionTitle: string
          role: string
          excerpt: string
        }> = []

        for (const session of searchSessions) {
          if (results.length >= maxResults) break

          try {
            const messagesResult = await client.session.messages({
              path: { id: session.id },
              query: { limit: 50 },
            })
            const messages = (messagesResult.data ?? []) as MessageData[]

            for (const msg of messages) {
              if (results.length >= maxResults) break

              const textParts = msg.parts?.filter((p) => p.type === "text" && p.text) ?? []

              for (const part of textParts) {
                if (results.length >= maxResults) break

                const text = part.text ?? ""
                if (text.toLowerCase().includes(query)) {
                  // Extract relevant excerpt around the match
                  const lowerText = text.toLowerCase()
                  const matchIndex = lowerText.indexOf(query)
                  const start = Math.max(0, matchIndex - 50)
                  const end = Math.min(text.length, matchIndex + query.length + 150)
                  const excerpt =
                    (start > 0 ? "..." : "") +
                    text.substring(start, end).trim() +
                    (end < text.length ? "..." : "")

                  results.push({
                    sessionId: session.id,
                    sessionTitle: session.title ?? "(untitled)",
                    role: msg.info?.role ?? "unknown",
                    excerpt,
                  })
                }
              }
            }
          } catch {
            // Skip sessions that fail to load
            continue
          }
        }

        if (results.length === 0) {
          return `No matches found for "${args.query}" in the last ${MAX_SESSIONS_TO_SEARCH} sessions.`
        }

        return JSON.stringify(results, null, 2)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error"
        return `Failed to search sessions: ${errorMsg}`
      }
    },
  })

  return {
    session_list: sessionList,
    session_search: sessionSearch,
  }
}

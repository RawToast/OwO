/**
 * Jira API Tools
 *
 * Direct API integration with Jira for issue tracking:
 * - jira: Fetch a Jira issue by key
 * - jira_search: Search issues with JQL
 *
 * Config required:
 * - cloudId: Jira Cloud ID
 * - email: Jira account email
 * - API token via JIRA_API_TOKEN env var or tools.jira.key in owo.json
 *
 * Get your API token at: https://id.atlassian.com/manage-profile/security/api-tokens
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { JiraToolConfig } from "../types"

export type JiraTools = {
  [key: string]: ToolDefinition
}

interface JiraCredentials {
  cloudId: string
  email: string
  apiToken: string
}

async function jiraFetch(credentials: JiraCredentials, endpoint: string, signal?: AbortSignal) {
  const auth = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString("base64")

  const response = await fetch(
    `https://api.atlassian.com/ex/jira/${credentials.cloudId}/rest/api/3${endpoint}`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      signal,
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Jira API error ${response.status}: ${text}`)
  }

  return response.json()
}

interface IssueLink {
  type: { name: string; inward: string; outward: string }
  inwardIssue?: { key: string }
  outwardIssue?: { key: string }
}

function extractLinks(issuelinks: IssueLink[]): Record<string, string[]> {
  const links: Record<string, string[]> = {}

  for (const link of issuelinks || []) {
    if (link.inwardIssue) {
      const type = link.type.inward
      links[type] = links[type] || []
      links[type].push(link.inwardIssue.key)
    }
    if (link.outwardIssue) {
      const type = link.type.outward
      links[type] = links[type] || []
      links[type].push(link.outwardIssue.key)
    }
  }

  return links
}

export function createJiraTools(config: JiraToolConfig & { apiToken: string }): JiraTools {
  // If explicitly disabled, return empty tools
  if (config?.enabled === false) {
    return {}
  }

  const credentials: JiraCredentials = {
    cloudId: config.cloudId!,
    email: config.email!,
    apiToken: config.apiToken,
  }

  const jira = tool({
    description:
      "Fetch a Jira issue by key (e.g., BDM-3739). Returns key, summary, status, and blocking links.",
    args: {
      key: tool.schema.string().describe("Issue key like BDM-3739"),
    },
    async execute({ key }, ctx) {
      try {
        const issue = await jiraFetch(credentials, `/issue/${key}`, ctx.abort)
        const links = extractLinks(issue.fields.issuelinks)

        return JSON.stringify(
          {
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status?.name,
            links,
          },
          null,
          2,
        )
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "Jira request was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Jira fetch failed: ${errorMsg}`
      }
    },
  })

  const jiraSearch = tool({
    description:
      "Search Jira issues using JQL. Returns list of issues with key, summary, status, and links.",
    args: {
      jql: tool.schema.string().describe("JQL query string"),
      max: tool.schema.number().optional().describe("Max results (default 10)"),
    },
    async execute({ jql, max = 10 }, ctx) {
      try {
        const result = await jiraFetch(
          credentials,
          `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${max}&fields=summary,status,issuelinks`,
          ctx.abort,
        )

        const issues = result.issues.map((issue: any) => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          links: extractLinks(issue.fields.issuelinks),
        }))

        return JSON.stringify(issues, null, 2)
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "Jira search was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Jira search failed: ${errorMsg}`
      }
    },
  })

  return {
    jira,
    jira_search: jiraSearch,
  }
}

/**
 * Context7 API Tools
 *
 * Direct API integration with Context7 for up-to-date library documentation:
 * - context7_search: Search docs with automatic library resolution (PRIMARY - use this first!)
 * - context7_docs: Query docs when you already have the library ID (for follow-up queries)
 *
 * API key can be set via:
 * 1. Config file (tools.context7.key in owo.json)
 * 2. Environment variable (CONTEXT7_API_KEY)
 *
 * Get your API key at: https://context7.com/dashboard
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { Context7ToolConfig } from "../types"

export type Context7Tools = {
  [key: string]: ToolDefinition
}

const searchDescription = `Search library documentation with automatic library resolution. This is the PRIMARY tool for Context7 - use this first!

Combines library lookup + documentation search in one call. Returns code examples, API references, and best practices.

**Examples:**
- library: "react", query: "useState hooks"
- library: "next.js", query: "app router setup"
- library: "express", query: "middleware error handling"
- library: "pandas", query: "dataframe filtering"

**Response includes the resolved library ID** - use it with context7_docs for follow-up queries to skip resolution.

**IMPORTANT:** Do not call this tool more than 3 times per question. If you cannot find what you need after 3 calls, use the best information you have.`

const docsDescription = `Query documentation for a library when you already have the library ID.

Use this for follow-up queries after context7_search has given you the library ID, or when you already know the ID.

**Library ID formats:**
- Standard: /org/project (e.g., /facebook/react, /vercel/next.js)
- Version-specific: /org/project/version (e.g., /vercel/next.js/v14.3.0-canary.87)

**Use this tool to get:**
- Working code examples from official documentation
- API references and usage patterns
- Version-specific documentation
- Best practices and common patterns

**IMPORTANT:** Do not call this tool more than 3 times per question. If you cannot find what you need after 3 calls, use the best information you have.`

const CONTEXT7_API_BASE = "https://context7.com/api/v2"

interface LibraryResult {
  libraryId: string
  name: string
  description?: string
  codeSnippetCount?: number
  source?: string
  benchmarkScore?: number
}

interface LibrarySearchResponse {
  results: LibraryResult[]
}

interface CodeSnippet {
  codeTitle?: string
  codeDescription?: string
  codeLanguage?: string
  codeTokens?: number
  pageTitle?: string
  codeList?: Array<{
    language: string
    code: string
  }>
}

interface InfoSnippet {
  breadcrumb?: string
  content?: string
  contentTokens?: number
}

interface ContextResponse {
  codeSnippets?: CodeSnippet[]
  infoSnippets?: InfoSnippet[]
}

function createContext7Fetch(configKey?: string) {
  return async function context7Fetch<T>(
    endpoint: string,
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<T> {
    // Config key takes priority over env var
    const apiKey = configKey || process.env.CONTEXT7_API_KEY
    if (!apiKey) {
      throw new Error(
        "Context7 API key not configured. Set tools.context7.key in owo.json or CONTEXT7_API_KEY env var. Get your key at https://context7.com/dashboard",
      )
    }

    const url = new URL(`${CONTEXT7_API_BASE}${endpoint}`)
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value)
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      throw new Error(`Context7 API error (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<T>
  }
}

function formatContextResults(response: ContextResponse): string {
  const parts: string[] = []

  // Format code snippets
  if (response.codeSnippets && response.codeSnippets.length > 0) {
    parts.push("# Code Examples\n")

    for (const snippet of response.codeSnippets) {
      const snippetParts: string[] = []

      if (snippet.codeTitle) {
        snippetParts.push(`## ${snippet.codeTitle}`)
      }

      if (snippet.codeDescription) {
        snippetParts.push(snippet.codeDescription)
      }

      if (snippet.pageTitle) {
        snippetParts.push(`*From: ${snippet.pageTitle}*`)
      }

      if (snippet.codeList && snippet.codeList.length > 0) {
        for (const code of snippet.codeList) {
          snippetParts.push(`\n\`\`\`${code.language}\n${code.code}\n\`\`\``)
        }
      }

      parts.push(snippetParts.join("\n"))
    }
  }

  // Format info snippets
  if (response.infoSnippets && response.infoSnippets.length > 0) {
    parts.push("\n# Documentation\n")

    for (const snippet of response.infoSnippets) {
      const snippetParts: string[] = []

      if (snippet.breadcrumb) {
        snippetParts.push(`### ${snippet.breadcrumb}`)
      }

      if (snippet.content) {
        snippetParts.push(snippet.content)
      }

      parts.push(snippetParts.join("\n"))
    }
  }

  if (parts.length === 0) {
    return "No documentation found for this query."
  }

  return parts.join("\n\n---\n\n")
}

export function createContext7Tools(config?: Context7ToolConfig): Context7Tools {
  // If explicitly disabled, return empty tools
  if (config?.enabled === false) {
    return {}
  }

  const context7Fetch = createContext7Fetch(config?.key)

  const context7Search = tool({
    description: searchDescription,
    args: {
      library: tool.schema
        .string()
        .describe("Library or package name (e.g., 'react', 'next.js', 'express', 'pandas')"),
      query: tool.schema
        .string()
        .describe(
          "What you need help with (e.g., 'useState hooks', 'routing setup', 'middleware error handling')",
        ),
      version: tool.schema
        .string()
        .optional()
        .describe("Specific version to search (optional, e.g., 'v14.3.0')"),
      tokens: tool.schema
        .number()
        .min(1000)
        .max(50000)
        .default(5000)
        .describe(
          "Maximum tokens of context to return (1000-50000, default: 5000). Use higher values for comprehensive documentation.",
        ),
    },
    async execute(args, ctx) {
      try {
        // Step 1: Resolve library name to ID
        const searchResponse = await context7Fetch<LibrarySearchResponse>(
          "/libs/search",
          {
            libraryName: args.library,
            query: args.query,
          },
          ctx.abort,
        )

        if (searchResponse.results.length === 0) {
          return `No libraries found matching "${args.library}". Try a different library name.`
        }

        const bestMatch = searchResponse.results[0]
        let libraryId = bestMatch.libraryId

        // Append version if specified
        if (args.version) {
          libraryId = `${libraryId}/${args.version}`
        }

        // Step 2: Fetch documentation
        const docsResponse = await context7Fetch<ContextResponse>(
          "/context",
          {
            libraryId,
            query: args.query,
            type: "json",
            tokens: String(args.tokens),
          },
          ctx.abort,
        )

        // Format response with library info header
        const header = [
          `**Library:** ${bestMatch.name} (\`${libraryId}\`)`,
          bestMatch.description ? `**Description:** ${bestMatch.description}` : null,
          ``,
          `> **Tip:** For follow-up queries, use \`context7_docs\` with ID \`${libraryId}\` to skip resolution.`,
          ``,
          `---`,
        ]
          .filter(Boolean)
          .join("\n")

        const docs = formatContextResults(docsResponse)

        return `${header}\n\n${docs}`
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "Search was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Context7 search failed: ${errorMsg}`
      }
    },
  })

  const context7Docs = tool({
    description: docsDescription,
    args: {
      libraryId: tool.schema
        .string()
        .describe(
          "Context7 library ID from context7_resolve (e.g., '/facebook/react', '/vercel/next.js')",
        ),
      query: tool.schema
        .string()
        .describe(
          "Your question or what you need help with (e.g., 'useEffect cleanup', 'routing setup', 'authentication')",
        ),
      tokens: tool.schema
        .number()
        .min(1000)
        .max(50000)
        .default(5000)
        .describe(
          "Maximum tokens of context to return (1000-50000, default: 5000). Use higher values for comprehensive documentation.",
        ),
    },
    async execute(args, ctx) {
      try {
        // Ensure library ID starts with /
        const libraryId = args.libraryId.startsWith("/") ? args.libraryId : `/${args.libraryId}`

        const response = await context7Fetch<ContextResponse>(
          "/context",
          {
            libraryId,
            query: args.query,
            type: "json",
            tokens: String(args.tokens),
          },
          ctx.abort,
        )

        return formatContextResults(response)
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "Documentation query was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Context7 documentation query failed: ${errorMsg}`
      }
    },
  })

  return {
    context7_search: context7Search,
    context7_docs: context7Docs,
  }
}

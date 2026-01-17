/**
 * Context7 API Tools
 *
 * Direct API integration with Context7 for up-to-date library documentation:
 * - context7_resolve: Resolve a library name to a Context7 library ID
 * - context7_docs: Query documentation and code examples for a library
 *
 * API key can be set via:
 * 1. Config file (tools.context7.key in zenox.json)
 * 2. Environment variable (CONTEXT7_API_KEY)
 *
 * Get your API key at: https://context7.com/dashboard
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { ToolConfig } from "../../config/schema"

export type Context7Tools = {
  [key: string]: ToolDefinition
}

export type Context7ToolsConfig = ToolConfig

const resolveDescription = `Resolve a library/package name to a Context7 library ID.

You MUST call this tool before using context7_docs to get the correct library ID.

Examples of library names:
- "react" -> /facebook/react
- "next.js" -> /vercel/next.js
- "express" -> /expressjs/express
- "pandas" -> /pandas-dev/pandas

The tool returns matching libraries ranked by relevance and documentation quality.`

const docsDescription = `Query up-to-date documentation and code examples for a library.

ALWAYS use this tool when the user mentions using features from a library.

Use this tool to get:
- Working code examples from official documentation
- API references and usage patterns
- Version-specific documentation

You must first use context7_resolve to get the library ID, unless you already know it.
Library IDs are in the format: /org/project (e.g., /facebook/react, /vercel/next.js)`

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
        "Context7 API key not configured. Set tools.context7.key in zenox.json or CONTEXT7_API_KEY env var. Get your key at https://context7.com/dashboard",
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

function formatLibraryResults(results: LibraryResult[]): string {
  if (results.length === 0) {
    return "No matching libraries found."
  }

  return results
    .map((lib, i) => {
      const parts = [`## ${i + 1}. ${lib.name}`, `**Library ID:** \`${lib.libraryId}\``]

      if (lib.description) {
        parts.push(`**Description:** ${lib.description}`)
      }

      if (lib.codeSnippetCount !== undefined) {
        parts.push(`**Code Snippets:** ${lib.codeSnippetCount}`)
      }

      if (lib.benchmarkScore !== undefined) {
        parts.push(`**Quality Score:** ${lib.benchmarkScore}/100`)
      }

      if (lib.source) {
        parts.push(`**Source:** ${lib.source}`)
      }

      return parts.join("\n")
    })
    .join("\n\n---\n\n")
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

export function createContext7Tools(config?: Context7ToolsConfig): Context7Tools {
  // If explicitly disabled, return empty tools
  if (config?.enabled === false) {
    return {}
  }

  const context7Fetch = createContext7Fetch(config?.key)

  const context7Resolve = tool({
    description: resolveDescription,
    args: {
      libraryName: tool.schema
        .string()
        .describe("Library or package name to search for (e.g., 'react', 'express', 'pandas')"),
      query: tool.schema
        .string()
        .describe(
          "Your question or task - used to rank results by relevance (e.g., 'how to use hooks', 'middleware setup')",
        ),
    },
    async execute(args, ctx) {
      try {
        const response = await context7Fetch<LibrarySearchResponse>(
          "/libs/search",
          {
            libraryName: args.libraryName,
            query: args.query,
          },
          ctx.abort,
        )

        let output = formatLibraryResults(response.results)

        if (response.results.length > 0) {
          output += `\n\n**Recommended:** Use library ID \`${response.results[0].libraryId}\` with the context7_docs tool.`
        }

        return output
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "Library search was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Context7 library search failed: ${errorMsg}`
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
        .max(15000)
        .default(5000)
        .describe("Maximum tokens of context to return (1000-15000, default: 5000)"),
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
    context7_resolve: context7Resolve,
    context7_docs: context7Docs,
  }
}

/**
 * Exa API Tools
 *
 * Direct API integration with Exa AI for web search and content extraction:
 * - exa_search: Search the web with AI-powered semantic search
 * - exa_code_context: Get code-focused search results for APIs/libraries
 * - exa_crawl: Extract content from specific URLs
 *
 * API key can be set via:
 * 1. Config file (tools.exa.key in owo.json)
 * 2. Environment variable (EXA_API_KEY)
 *
 * Get your API key at: https://exa.ai
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { ToolConfig } from "../../config/schema"

export type ExaTools = {
  [key: string]: ToolDefinition
}

export type ExaToolsConfig = ToolConfig

const EXA_API_BASE = "https://api.exa.ai"

const webSearchDescription = `Search the web using Exa AI - performs real-time web searches with AI-powered semantic understanding.

Use this tool when you need:
- Current information about recent events or news
- Technical documentation and tutorials
- Research on any topic
- Finding authoritative sources

Supports different search modes:
- auto: Balanced search (default)
- neural: Semantic/embeddings-based search
- keyword: Traditional keyword matching`

const pageContentsDescription = `Extract and crawl content from specific URLs using Exa AI.

Use this tool when you need to:
- Get the full text content of a webpage
- Extract information from a known URL
- Read documentation or articles from specific pages`

const codeContextDescription = `Get code-focused search results from Exa AI for APIs, libraries, and SDKs.

Use this tool when you need:
- Documentation for a specific library or framework
- Code examples and usage patterns
- API references and specifications
- Best practices for implementation
- You find context 7 is lacking examples or does not contain the library

Automatically focuses on code-related sources like GitHub, documentation sites, and Stack Overflow.`

interface ExaSearchResult {
  title: string
  url: string
  text?: string
  highlights?: string[]
  publishedDate?: string
  author?: string
}

interface ExaSearchResponse {
  results: ExaSearchResult[]
  autopromptString?: string
}

interface ExaContentsResponse {
  results: Array<{
    url: string
    title?: string
    text?: string
  }>
}

function createExaFetch(configKey?: string) {
  return async function exaFetch<T>(
    endpoint: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    // Config key takes priority over env var
    const apiKey = configKey || process.env.EXA_API_KEY
    if (!apiKey) {
      throw new Error(
        "Exa API key not configured. Set tools.exa.key in owo.json or EXA_API_KEY env var. Get your key at https://exa.ai",
      )
    }

    const response = await fetch(`${EXA_API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      throw new Error(`Exa API error (${response.status}): ${errorText}`)
    }

    return response.json() as Promise<T>
  }
}

function formatSearchResults(results: ExaSearchResult[]): string {
  if (results.length === 0) {
    return "No results found."
  }

  return results
    .map((r, i) => {
      const parts = [`## ${i + 1}. ${r.title}`, `**URL:** ${r.url}`]

      if (r.publishedDate) {
        parts.push(`**Published:** ${r.publishedDate}`)
      }

      if (r.author) {
        parts.push(`**Author:** ${r.author}`)
      }

      if (r.text) {
        // Truncate long text
        const text = r.text.length > 1500 ? r.text.substring(0, 1500) + "..." : r.text
        parts.push(`\n${text}`)
      } else if (r.highlights && r.highlights.length > 0) {
        parts.push(`\n${r.highlights.join("\n\n")}`)
      }

      return parts.join("\n")
    })
    .join("\n\n---\n\n")
}

export function createExaTools(config?: ExaToolsConfig): ExaTools {
  // If explicitly disabled, return empty tools
  if (config?.enabled === false) {
    return {}
  }

  const exaFetch = createExaFetch(config?.key)

  const exaSearch = tool({
    description: webSearchDescription,
    args: {
      query: tool.schema.string().describe("The search query"),
      numResults: tool.schema
        .number()
        .min(1)
        .max(20)
        .default(8)
        .describe("Number of results to return (1-20, default: 8)"),
      type: tool.schema
        .enum(["auto", "neural", "keyword"])
        .default("auto")
        .describe("Search type: auto, neural, or keyword"),
      useAutoprompt: tool.schema
        .boolean()
        .default(true)
        .describe("Let Exa optimize the query for better results"),
      includeDomains: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe(
          "Only include results from these domains (e.g., ['github.com', 'stackoverflow.com'])",
        ),
      excludeDomains: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Exclude results from these domains"),
    },
    async execute(args, ctx) {
      try {
        const response = await exaFetch<ExaSearchResponse>(
          "/search",
          {
            query: args.query,
            numResults: args.numResults,
            type: args.type,
            useAutoprompt: args.useAutoprompt,
            includeDomains: args.includeDomains,
            excludeDomains: args.excludeDomains,
            contents: {
              text: true,
            },
          },
          ctx.abort,
        )

        let output = formatSearchResults(response.results)

        if (response.autopromptString && args.useAutoprompt) {
          output = `*Optimized query: "${response.autopromptString}"*\n\n${output}`
        }

        return output
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "Search was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Exa search failed: ${errorMsg}`
      }
    },
  })

  const exaCodeContext = tool({
    description: codeContextDescription,
    args: {
      query: tool.schema
        .string()
        .describe(
          "Search query for code context (e.g., 'React useEffect cleanup', 'Express.js middleware authentication')",
        ),
      numResults: tool.schema
        .number()
        .min(1)
        .max(15)
        .default(6)
        .describe("Number of results to return (1-15, default: 6)"),
    },
    async execute(args, ctx) {
      try {
        const response = await exaFetch<ExaSearchResponse>(
          "/search",
          {
            query: args.query,
            numResults: args.numResults,
            type: "neural",
            useAutoprompt: true,
            includeDomains: [
              "github.com",
              "stackoverflow.com",
              "developer.mozilla.org",
              "docs.python.org",
              "pkg.go.dev",
              "docs.rs",
              "npmjs.com",
              "pypi.org",
              "crates.io",
              "rubygems.org",
            ],
            contents: {
              text: true,
            },
          },
          ctx.abort,
        )

        return formatSearchResults(response.results)
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "Code context search was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Exa code context search failed: ${errorMsg}`
      }
    },
  })

  const exaCrawl = tool({
    description: pageContentsDescription,
    args: {
      urls: tool.schema
        .array(tool.schema.string())
        .min(1)
        .max(10)
        .describe("URLs to crawl and extract content from (1-10 URLs)"),
      maxCharacters: tool.schema
        .number()
        .min(500)
        .max(10000)
        .default(3000)
        .describe("Maximum characters to extract per URL (500-10000, default: 3000)"),
    },
    async execute(args, ctx) {
      try {
        const response = await exaFetch<ExaContentsResponse>(
          "/contents",
          {
            urls: args.urls,
            text: {
              maxCharacters: args.maxCharacters,
            },
          },
          ctx.abort,
        )

        if (response.results.length === 0) {
          return "No content could be extracted from the provided URLs."
        }

        return response.results
          .map((r) => {
            const parts = [`## ${r.title ?? "Untitled"}`, `**URL:** ${r.url}`]

            if (r.text) {
              parts.push(`\n${r.text}`)
            } else {
              parts.push("\n*No text content available*")
            }

            return parts.join("\n")
          })
          .join("\n\n---\n\n")
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "Crawl was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `Exa crawl failed: ${errorMsg}`
      }
    },
  })

  return {
    exa_search: exaSearch,
    exa_code_context: exaCodeContext,
    exa_crawl: exaCrawl,
  }
}

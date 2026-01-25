/**
 * grep.app GitHub Code Search Tool
 *
 * Direct API integration with grep.app for public GitHub code search:
 * - grep_app_search: Search repositories for code patterns
 *
 * No API key required.
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { GrepAppToolConfig } from "../types"

export type GrepAppTools = {
  [key: string]: ToolDefinition
}

const GREP_APP_API_BASE = "https://grep.app/api/search"
const RESULTS_PER_PAGE = 10
const MAX_PAGES = 100

const grepAppDescription = `Find real-world code examples from over a million public GitHub repositories.

**IMPORTANT: This tool searches for literal code patterns (like grep), not keywords. Search for actual code that would appear in files:**
- Good: 'useState(', 'import React from', 'async function', 'extends Component'
- Bad: 'react tutorial', 'best practices', 'how to use hooks'

**When to use this tool:**
- When implementing unfamiliar APIs or libraries and need to see real usage patterns
- When unsure about correct syntax, parameters, or configuration for a specific library
- When looking for production-ready examples and best practices for implementation
- When needing to understand how different libraries or frameworks work together

**Example searches:**
- "How do developers handle auth in Next.js?" → query: 'getServerSession', langFilter: 'TypeScript'
- "React error boundary patterns" → query: 'ErrorBoundary', langFilter: 'TSX'
- "useEffect cleanup examples" → query: 'useEffect', useRegex: false, langFilter: 'TypeScript,TSX'
- "Express middleware patterns" → query: 'app.use(', langFilter: 'JavaScript,TypeScript'

**Regex tips (useRegex: true):**
- Prefix with '(?s)' to match across multiple lines
- Example: '(?s)useEffect\\(.*return.*cleanup' finds useEffect with cleanup functions
- Example: '(?s)try {.*await' finds try blocks containing await

**Filtering:**
- langFilter: 'TypeScript,JavaScript' - comma-separated languages
- repoFilter: 'facebook/react' - limit to specific repo
- pathFilter: 'src/components/' - limit to path pattern

No API key required!`

interface GrepAppHit {
  repo?: { raw?: string }
  path?: { raw?: string }
  content?: { snippet?: string }
}

interface GrepAppResponse {
  facets?: { count?: number }
  hits?: { hits?: GrepAppHit[] }
}

interface SnippetLine {
  lineNumber: number
  code: string
}

interface SnippetGroup {
  startLine: number
  lines: SnippetLine[]
}

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
    "&nbsp;": " ",
  }

  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&(lt|gt|amp|quot|#39|#x27|nbsp);/g, (match) => named[match] ?? match)
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, "")
}

function extractSnippetLines(snippet: string): SnippetLine[] {
  if (!snippet) {
    return []
  }

  const lines: SnippetLine[] = []
  const rowRegex =
    /<tr[^>]*>[\s\S]*?<div class="lineno">(\d+)<\/div>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>[\s\S]*?<\/tr>/g

  let match: RegExpExecArray | null
  while ((match = rowRegex.exec(snippet)) !== null) {
    const lineNumber = Number.parseInt(match[1], 10)
    const rawCode = match[2]
    const cleaned = decodeHtmlEntities(stripHtmlTags(rawCode).replace(/\r/g, ""))
    lines.push({ lineNumber, code: cleaned })
  }

  return lines
}

function groupSnippetLines(lines: SnippetLine[], gap = 3): SnippetGroup[] {
  if (lines.length === 0) {
    return []
  }

  const sorted = [...lines].sort((a, b) => a.lineNumber - b.lineNumber)
  const groups: SnippetGroup[] = []
  let current: SnippetGroup = { startLine: sorted[0].lineNumber, lines: [sorted[0]] }

  for (let i = 1; i < sorted.length; i += 1) {
    const line = sorted[i]
    const previous = current.lines[current.lines.length - 1]

    if (line.lineNumber - previous.lineNumber <= gap) {
      current.lines.push(line)
      continue
    }

    groups.push(current)
    current = { startLine: line.lineNumber, lines: [line] }
  }

  groups.push(current)
  return groups
}

function buildGithubUrl(repo: string, path: string): string | undefined {
  if (!repo || !path || repo === "Unknown repo" || path === "Unknown path") {
    return undefined
  }

  return `https://github.com/${repo}/blob/main/${path}`
}

function buildSearchParams(
  query: string,
  page: number,
  options: {
    caseSensitive?: boolean
    useRegex?: boolean
    wholeWords?: boolean
    repoFilter?: string
    pathFilter?: string
    langFilter?: string
  },
): URLSearchParams {
  const params = new URLSearchParams()
  params.set("q", query)
  params.set("page", String(page))

  if (options.useRegex) {
    params.set("regexp", "true")
  }
  if (options.wholeWords) {
    params.set("words", "true")
  }
  if (options.caseSensitive) {
    params.set("case", "true")
  }
  if (options.repoFilter) {
    params.set("f.repo.pattern", options.repoFilter)
  }
  if (options.pathFilter) {
    params.set("f.path.pattern", options.pathFilter)
  }
  if (options.langFilter) {
    const langs = options.langFilter
      .split(",")
      .map((lang) => lang.trim())
      .filter((lang) => lang.length > 0)
    for (const lang of langs) {
      params.append("f.lang", lang)
    }
  }

  return params
}

function formatHit(hit: GrepAppHit): string {
  const repo = hit.repo?.raw ?? "Unknown repo"
  const path = hit.path?.raw ?? "Unknown path"
  const snippet = hit.content?.snippet ?? ""
  const lines = extractSnippetLines(snippet)
  const githubUrl = buildGithubUrl(repo, path) ?? "Unknown"

  const header = [`Repository: ${repo}`, `Path: ${path}`, `URL: ${githubUrl}`, "License: Unknown"]
  const body: string[] = ["", "Snippets:"]

  if (lines.length > 0) {
    const groups = groupSnippetLines(lines)
    for (const [groupIndex, group] of groups.entries()) {
      body.push(
        `--- Snippet ${groupIndex + 1} (Line ${group.startLine}) ---`,
        ...group.lines.map((line) => line.code),
        "",
      )
    }
    if (body[body.length - 1] === "") {
      body.pop()
    }
  } else if (snippet) {
    const cleaned = decodeHtmlEntities(stripHtmlTags(snippet).replace(/\r/g, "")).trim()
    if (cleaned.length > 0) {
      body.push("--- Snippet 1 (Line unknown) ---", cleaned)
    } else {
      body.push("No snippet available.")
    }
  } else {
    body.push("No snippet available.")
  }

  return [...header, ...body].join("\n")
}

export function createGrepAppTools(config?: GrepAppToolConfig): GrepAppTools {
  // If explicitly disabled, return empty tools
  if (config?.enabled === false) {
    return {}
  }

  const grepAppSearch = tool({
    description: grepAppDescription,
    args: {
      query: tool.schema
        .string()
        .describe(
          "The literal code pattern to search for (e.g., 'useState(', 'export function'). Use actual code that would appear in files, not keywords or questions.",
        ),
      caseSensitive: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Case-sensitive search (e.g., distinguish 'useState' from 'USESTATE')"),
      useRegex: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Interpret query as regex. Use '(?s)' prefix for multiline. Example: '(?s)useEffect\\(.*cleanup'",
        ),
      wholeWords: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Match whole words only (e.g., 'use' won't match 'useState')"),
      repoFilter: tool.schema
        .string()
        .optional()
        .describe("Filter by repository (e.g., 'facebook/react', 'vercel/next.js')"),
      pathFilter: tool.schema
        .string()
        .optional()
        .describe("Filter by file path pattern (e.g., 'src/components/', 'test/')"),
      langFilter: tool.schema
        .string()
        .optional()
        .describe(
          "Filter by language, comma-separated. Examples: 'TypeScript', 'TSX', 'JavaScript', 'Python', 'Go', 'Rust'",
        ),
      maxResults: tool.schema
        .number()
        .min(1)
        .max(100)
        .default(30)
        .describe("Number of results to return (1-100, default: 30)"),
    },
    async execute(args, ctx) {
      try {
        const targetResults = Math.min(args.maxResults, 100)
        const hits: GrepAppHit[] = []
        let page = 1
        let totalCount: number | undefined

        while (hits.length < targetResults && page <= MAX_PAGES) {
          const params = buildSearchParams(args.query, page, {
            caseSensitive: args.caseSensitive,
            useRegex: args.useRegex,
            wholeWords: args.wholeWords,
            repoFilter: args.repoFilter,
            pathFilter: args.pathFilter,
            langFilter: args.langFilter,
          })
          const response = await fetch(`${GREP_APP_API_BASE}?${params.toString()}`, {
            method: "GET",
            signal: ctx.abort,
          })

          if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error")
            throw new Error(`grep.app API error (${response.status}): ${errorText}`)
          }

          const data = (await response.json()) as GrepAppResponse
          if (totalCount === undefined && typeof data.facets?.count === "number") {
            totalCount = data.facets.count
          }

          const pageHits = data.hits?.hits ?? []
          if (pageHits.length === 0) {
            break
          }

          for (const hit of pageHits) {
            hits.push(hit)
            if (hits.length >= targetResults) {
              break
            }
          }

          if (pageHits.length < RESULTS_PER_PAGE) {
            break
          }

          page += 1
        }

        if (hits.length === 0) {
          return "No results found."
        }

        return hits.map((hit) => formatHit(hit)).join("\n\n")
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return "grep.app search was cancelled."
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        return `grep.app search failed: ${errorMsg}`
      }
    },
  })

  return {
    grep_app_search: grepAppSearch,
  }
}

# @owo/tools Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a unified tools package that provides API-based tools (exa, context7, jira, coderabbit) with config-driven enable/disable.

**Architecture:** Single plugin package that reads from `owo.json` config. Each tool is a separate module with a factory function. Tools only load when explicitly enabled AND have valid credentials (env var or config). Toast notifications warn users about missing credentials.

**Tech Stack:** TypeScript, Zod, @opencode-ai/plugin, @owo/config

---

## Config Schema

Add to `owo.json`:

```json
{
  "tools": {
    "exa": { "enabled": true },
    "context7": { "enabled": true },
    "jira": { 
      "enabled": true, 
      "cloudId": "your-cloud-id",
      "email": "you@company.com"
    },
    "coderabbit": { "enabled": true }
  }
}
```

## Environment Variables

| Tool | Env Var | Required |
|------|---------|----------|
| exa | `EXA_API_KEY` | Yes |
| context7 | `CONTEXT7_API_KEY` | Yes |
| jira | `JIRA_API_TOKEN` | Yes |
| coderabbit | `CODERABBIT_API_KEY` | Yes |

---

### Task 1: Scaffold Package Structure

**Files:**
- Create: `packages/tools/package.json`
- Create: `packages/tools/tsconfig.json`
- Create: `packages/tools/src/index.ts`
- Create: `packages/tools/src/types.ts`
- Create: `packages/tools/README.md`

**Step 1: Create package.json**

```json
{
  "name": "@owo/tools",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "make": "bun build ./src/index.ts --outdir ./dist --target node --external '@opencode-ai/*' --external '@owo/*' --external zod && bun run compile",
    "compile": "tsgo --declaration --emitDeclarationOnly --outDir dist",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@owo/config": "workspace:*"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "*",
    "@opencode-ai/sdk": "*"
  },
  "devDependencies": {
    "zod": "^3.25.67"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create src/types.ts**

```typescript
import type { PluginInput } from "@opencode-ai/plugin"

/**
 * Base config for all tools
 */
export interface BaseToolConfig {
  enabled?: boolean
}

/**
 * Exa web search tool config
 */
export interface ExaToolConfig extends BaseToolConfig {}

/**
 * Context7 library docs tool config
 */
export interface Context7ToolConfig extends BaseToolConfig {}

/**
 * Jira issue tracking tool config
 */
export interface JiraToolConfig extends BaseToolConfig {
  cloudId?: string
  email?: string
}

/**
 * CodeRabbit code review tool config
 */
export interface CodeRabbitToolConfig extends BaseToolConfig {}

/**
 * All tools config
 */
export interface ToolsConfig {
  exa?: ExaToolConfig
  context7?: Context7ToolConfig
  jira?: JiraToolConfig
  coderabbit?: CodeRabbitToolConfig
}

/**
 * Context passed to tool factories
 */
export interface ToolFactoryContext {
  client: PluginInput["client"]
  showToast: (title: string, message: string) => Promise<void>
}
```

**Step 4: Create src/index.ts (skeleton)**

```typescript
/**
 * @owo/tools
 *
 * API-based tools for OpenCode: exa, context7, jira, coderabbit.
 * Tools are disabled by default - enable via owo.json config.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "@owo/config"
import type { ToolsConfig, ToolFactoryContext } from "./types"

const ToolsPlugin: Plugin = async (ctx) => {
  let configResult
  try {
    configResult = loadConfig(ctx.directory)
  } catch (err) {
    const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error(`[owo/tools] Failed to load config: ${errorMessage}`)
    throw err
  }

  const { config } = configResult
  const toolsConfig: ToolsConfig = (config as any).tools ?? {}

  // Helper to show toast notifications
  const showToast = async (title: string, message: string) => {
    try {
      await ctx.client.toast.create({
        body: { type: "info", title, message },
      })
    } catch {
      // Silently ignore toast errors
    }
  }

  const factoryCtx: ToolFactoryContext = {
    client: ctx.client,
    showToast,
  }

  // Collect enabled tools
  const tools: Record<string, any> = {}

  // TODO: Wire up each tool based on config
  // - Check if enabled
  // - Check for API key (env or config)
  // - If enabled but missing key, show toast warning
  // - If enabled and has key, add tools to the tools object

  return {
    tool: tools,
  }
}

export default ToolsPlugin
export type { ToolsConfig, ExaToolConfig, Context7ToolConfig, JiraToolConfig, CodeRabbitToolConfig } from "./types"
```

**Step 5: Create README.md**

```markdown
# @owo/tools

API-based tools for OpenCode. All tools are disabled by default to avoid context bloat.

## Installation

Add to your `opencode.json`:

```json
{
  "plugins": ["@owo/tools"]
}
```

## Configuration

Enable tools in `~/.config/opencode/owo.json` (or `.opencode/owo.json`):

```json
{
  "tools": {
    "exa": { "enabled": true },
    "context7": { "enabled": true },
    "jira": { 
      "enabled": true,
      "cloudId": "your-cloud-id",
      "email": "you@company.com"
    },
    "coderabbit": { "enabled": true }
  }
}
```

## Environment Variables

Set API keys as environment variables (recommended):

| Tool | Environment Variable | Get Key |
|------|---------------------|---------|
| Exa | `EXA_API_KEY` | https://exa.ai |
| Context7 | `CONTEXT7_API_KEY` | https://context7.com/dashboard |
| Jira | `JIRA_API_TOKEN` | https://id.atlassian.com/manage-profile/security/api-tokens |
| CodeRabbit | `CODERABBIT_API_KEY` | https://coderabbit.ai |

## Available Tools

### Exa

Web search with AI-powered semantic understanding.

- `exa_web_search` - Search the web
- `exa_code_context` - Search for code examples and documentation

### Context7

Query up-to-date library documentation and code examples.

- `context7_resolve` - Resolve library name to Context7 ID
- `context7_docs` - Query documentation for a library

### Jira

Interact with Jira issues.

- `jira` - Fetch a Jira issue by key
- `jira_search` - Search issues with JQL

### CodeRabbit

AI-powered code review.

- `coderabbit_review` - Review code changes
```

**Step 6: Run bun install to link workspace**

Run: `bun install`

**Step 7: Commit**

```bash
git add packages/tools/
git commit -m "feat(tools): scaffold @owo/tools package structure"
```

---

### Task 2: Update Config Schema

**Files:**
- Modify: `packages/config/src/schema.ts`
- Modify: `packages/config/schema.json`

**Step 1: Add tools schema to schema.ts**

Add after `CodeReviewConfigSchema`:

```typescript
/**
 * Base tool configuration
 */
export const BaseToolConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
})

/**
 * Exa web search tool config
 */
export const ExaToolConfigSchema = BaseToolConfigSchema.extend({})

export type ExaToolConfig = z.infer<typeof ExaToolConfigSchema>

/**
 * Context7 library docs tool config
 */
export const Context7ToolConfigSchema = BaseToolConfigSchema.extend({})

export type Context7ToolConfig = z.infer<typeof Context7ToolConfigSchema>

/**
 * Jira issue tracking tool config
 */
export const JiraToolConfigSchema = BaseToolConfigSchema.extend({
  cloudId: z.string().optional().describe("Jira Cloud ID"),
  email: z.string().optional().describe("Jira account email"),
})

export type JiraToolConfig = z.infer<typeof JiraToolConfigSchema>

/**
 * CodeRabbit code review tool config
 */
export const CodeRabbitToolConfigSchema = BaseToolConfigSchema.extend({})

export type CodeRabbitToolConfig = z.infer<typeof CodeRabbitToolConfigSchema>

/**
 * All tools configuration
 */
export const ToolsConfigSchema = z.object({
  exa: ExaToolConfigSchema.optional(),
  context7: Context7ToolConfigSchema.optional(),
  jira: JiraToolConfigSchema.optional(),
  coderabbit: CodeRabbitToolConfigSchema.optional(),
})

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>
```

**Step 2: Add tools to OwoConfigSchema**

Update `OwoConfigSchema` to include tools:

```typescript
export const OwoConfigSchema = z.object({
  $schema: z.string().optional(),
  keywords: KeywordDetectorConfigSchema.optional(),
  prompts: PromptInjectorConfigSchema.optional(),
  orchestration: OrchestrationConfigSchema.optional(),
  review: CodeReviewConfigSchema.optional(),
  tools: ToolsConfigSchema.optional(),
})
```

**Step 3: Update schema.json**

Add tools section to schema.json properties:

```json
"tools": {
  "type": "object",
  "description": "API-based tools configuration",
  "properties": {
    "exa": {
      "type": "object",
      "description": "Exa web search tool",
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": false,
          "description": "Enable Exa tools (requires EXA_API_KEY env var)"
        }
      },
      "additionalProperties": false
    },
    "context7": {
      "type": "object",
      "description": "Context7 library documentation tool",
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": false,
          "description": "Enable Context7 tools (requires CONTEXT7_API_KEY env var)"
        }
      },
      "additionalProperties": false
    },
    "jira": {
      "type": "object",
      "description": "Jira issue tracking tool",
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": false,
          "description": "Enable Jira tools (requires JIRA_API_TOKEN env var)"
        },
        "cloudId": {
          "type": "string",
          "description": "Jira Cloud ID"
        },
        "email": {
          "type": "string",
          "description": "Jira account email"
        }
      },
      "additionalProperties": false
    },
    "coderabbit": {
      "type": "object",
      "description": "CodeRabbit code review tool",
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": false,
          "description": "Enable CodeRabbit tools (requires CODERABBIT_API_KEY env var)"
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

**Step 4: Run typecheck**

Run: `bun run compile`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/config/
git commit -m "feat(config): add tools schema for exa, context7, jira, coderabbit"
```

---

### Task 3: Implement Exa Tool

**Files:**
- Create: `packages/tools/src/exa/index.ts`
- Create: `packages/tools/src/exa/tools.ts`
- Modify: `packages/tools/src/index.ts`

**Step 1: Create src/exa/tools.ts**

```typescript
import { tool } from "@opencode-ai/plugin"

const EXA_API_URL = "https://api.exa.ai"

interface ExaSearchResult {
  title: string
  url: string
  text?: string
  highlights?: string[]
}

interface ExaSearchResponse {
  results: ExaSearchResult[]
}

async function exaFetch(
  endpoint: string,
  apiKey: string,
  body: Record<string, any>,
  abort?: AbortSignal
): Promise<any> {
  const response = await fetch(`${EXA_API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: abort,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Exa API error: ${response.status} - ${error}`)
  }

  return response.json()
}

export function createExaTools(apiKey: string) {
  return {
    exa_web_search: tool({
      description:
        "Search the web using Exa AI. Returns relevant web pages with content snippets. Use for finding documentation, articles, tutorials, and general web content.",
      args: {
        query: tool.schema.string().describe("Search query"),
        numResults: tool.schema.number().optional().describe("Number of results (default: 10, max: 100)"),
      },
      async execute(args, context) {
        const response: ExaSearchResponse = await exaFetch(
          "/search",
          apiKey,
          {
            query: args.query,
            numResults: args.numResults ?? 10,
            type: "auto",
            contents: {
              text: { maxCharacters: 2000 },
              highlights: true,
            },
          },
          context.abort
        )

        if (!response.results?.length) {
          return "No results found."
        }

        return response.results
          .map((r, i) => {
            const content = r.highlights?.join("\n") || r.text || "No content"
            return `${i + 1}. ${r.title}\n   ${r.url}\n   ${content}`
          })
          .join("\n\n")
      },
    }),

    exa_code_context: tool({
      description:
        "Search for code examples, API documentation, and programming tutorials. Pre-filtered to developer-focused sources like GitHub, Stack Overflow, and documentation sites.",
      args: {
        query: tool.schema.string().describe("Code/programming search query"),
        numResults: tool.schema.number().optional().describe("Number of results (default: 8)"),
      },
      async execute(args, context) {
        const response: ExaSearchResponse = await exaFetch(
          "/search",
          apiKey,
          {
            query: args.query,
            numResults: args.numResults ?? 8,
            type: "auto",
            includeDomains: [
              "github.com",
              "stackoverflow.com",
              "developer.mozilla.org",
              "docs.python.org",
              "pkg.go.dev",
              "docs.rs",
              "npmjs.com",
              "pypi.org",
            ],
            contents: {
              text: { maxCharacters: 3000 },
              highlights: true,
            },
          },
          context.abort
        )

        if (!response.results?.length) {
          return "No code examples found."
        }

        return response.results
          .map((r, i) => {
            const content = r.highlights?.join("\n") || r.text || "No content"
            return `${i + 1}. ${r.title}\n   ${r.url}\n   ${content}`
          })
          .join("\n\n")
      },
    }),
  }
}
```

**Step 2: Create src/exa/index.ts**

```typescript
import type { ToolFactoryContext } from "../types"
import { createExaTools } from "./tools"

const ENV_KEY = "EXA_API_KEY"

export function loadExaTools(
  config: { enabled?: boolean },
  factoryCtx: ToolFactoryContext
): Record<string, any> | null {
  if (!config.enabled) {
    return null
  }

  const apiKey = process.env[ENV_KEY]
  if (!apiKey) {
    factoryCtx.showToast(
      "Exa: Missing API Key",
      `Set ${ENV_KEY} environment variable to enable Exa tools.`
    ).catch(() => {})
    return null
  }

  return createExaTools(apiKey)
}

export { createExaTools }
```

**Step 3: Wire up in src/index.ts**

Update the plugin to load Exa tools:

```typescript
import { loadExaTools } from "./exa"

// Inside the plugin, after factoryCtx definition:

// Load Exa tools
if (toolsConfig.exa) {
  const exaTools = loadExaTools(toolsConfig.exa, factoryCtx)
  if (exaTools) {
    Object.assign(tools, exaTools)
  }
}
```

**Step 4: Build and verify**

Run: `bun run make`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/tools/src/exa/
git commit -m "feat(tools): implement Exa web search tools"
```

---

### Task 4: Implement Context7 Tool

**Files:**
- Create: `packages/tools/src/context7/index.ts`
- Create: `packages/tools/src/context7/tools.ts`
- Modify: `packages/tools/src/index.ts`

**Step 1: Create src/context7/tools.ts**

```typescript
import { tool } from "@opencode-ai/plugin"

const CONTEXT7_API_URL = "https://api.context7.com/v1"

async function context7Fetch(
  endpoint: string,
  apiKey: string,
  params: Record<string, string>,
  abort?: AbortSignal
): Promise<any> {
  const url = new URL(`${CONTEXT7_API_URL}${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const response = await fetch(url.toString(), {
    headers: {
      "X-API-Key": apiKey,
    },
    signal: abort,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Context7 API error: ${response.status} - ${error}`)
  }

  return response.json()
}

export function createContext7Tools(apiKey: string) {
  return {
    context7_resolve: tool({
      description:
        "Resolve a library/package name to a Context7 library ID. Call this BEFORE context7_docs to get the correct library ID.",
      args: {
        libraryName: tool.schema.string().describe("Library name to search for (e.g., 'react', 'express', 'pandas')"),
      },
      async execute(args, context) {
        const response = await context7Fetch(
          "/libraries/search",
          apiKey,
          { query: args.libraryName },
          context.abort
        )

        if (!response.libraries?.length) {
          return `No libraries found matching "${args.libraryName}".`
        }

        return response.libraries
          .slice(0, 5)
          .map((lib: any) => `- ${lib.id}: ${lib.name} - ${lib.description || "No description"}`)
          .join("\n")
      },
    }),

    context7_docs: tool({
      description:
        "Query documentation and code examples for a library. Use context7_resolve first to get the library ID.",
      args: {
        libraryId: tool.schema.string().describe("Context7 library ID (e.g., '/facebook/react', '/expressjs/express')"),
        query: tool.schema.string().describe("What you want to know about the library"),
      },
      async execute(args, context) {
        const response = await context7Fetch(
          "/libraries/docs",
          apiKey,
          {
            libraryId: args.libraryId,
            query: args.query,
          },
          context.abort
        )

        if (!response.content) {
          return "No documentation found."
        }

        return response.content
      },
    }),
  }
}
```

**Step 2: Create src/context7/index.ts**

```typescript
import type { ToolFactoryContext } from "../types"
import { createContext7Tools } from "./tools"

const ENV_KEY = "CONTEXT7_API_KEY"

export function loadContext7Tools(
  config: { enabled?: boolean },
  factoryCtx: ToolFactoryContext
): Record<string, any> | null {
  if (!config.enabled) {
    return null
  }

  const apiKey = process.env[ENV_KEY]
  if (!apiKey) {
    factoryCtx.showToast(
      "Context7: Missing API Key",
      `Set ${ENV_KEY} environment variable to enable Context7 tools.`
    ).catch(() => {})
    return null
  }

  return createContext7Tools(apiKey)
}

export { createContext7Tools }
```

**Step 3: Wire up in src/index.ts**

Add import and loading:

```typescript
import { loadContext7Tools } from "./context7"

// Load Context7 tools
if (toolsConfig.context7) {
  const context7Tools = loadContext7Tools(toolsConfig.context7, factoryCtx)
  if (context7Tools) {
    Object.assign(tools, context7Tools)
  }
}
```

**Step 4: Commit**

```bash
git add packages/tools/src/context7/
git commit -m "feat(tools): implement Context7 library docs tools"
```

---

### Task 5: Implement Jira Tool

**Files:**
- Create: `packages/tools/src/jira/index.ts`
- Create: `packages/tools/src/jira/tools.ts`
- Modify: `packages/tools/src/index.ts`

**Note:** User is adding existing Jira implementation. This task may need adjustment based on their code.

**Step 1: Create src/jira/tools.ts**

```typescript
import { tool } from "@opencode-ai/plugin"

interface JiraConfig {
  cloudId: string
  email: string
  apiToken: string
}

async function jiraFetch(
  config: JiraConfig,
  endpoint: string,
  abort?: AbortSignal
): Promise<any> {
  const url = `https://api.atlassian.com/ex/jira/${config.cloudId}/rest/api/3${endpoint}`
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    signal: abort,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Jira API error: ${response.status} - ${error}`)
  }

  return response.json()
}

export function createJiraTools(config: JiraConfig) {
  return {
    jira: tool({
      description: "Fetch a Jira issue by key (e.g., BDM-3739). Returns key, summary, status, and blocking links.",
      args: {
        key: tool.schema.string().describe("Jira issue key (e.g., PROJ-123)"),
      },
      async execute(args, context) {
        const issue = await jiraFetch(
          config,
          `/issue/${args.key}?fields=summary,status,issuelinks`,
          context.abort
        )

        const links = issue.fields.issuelinks
          ?.filter((link: any) => link.type.name === "Blocks")
          .map((link: any) => link.outwardIssue?.key || link.inwardIssue?.key)
          .filter(Boolean)

        return JSON.stringify(
          {
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            blocks: links || [],
          },
          null,
          2
        )
      },
    }),

    jira_search: tool({
      description: "Search Jira issues using JQL. Returns list of issues with key, summary, status, and links.",
      args: {
        jql: tool.schema.string().describe("JQL query string"),
        max: tool.schema.number().optional().describe("Maximum results (default: 20)"),
      },
      async execute(args, context) {
        const response = await jiraFetch(
          config,
          `/search?jql=${encodeURIComponent(args.jql)}&maxResults=${args.max ?? 20}&fields=summary,status,issuelinks`,
          context.abort
        )

        const issues = response.issues.map((issue: any) => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
        }))

        return JSON.stringify(issues, null, 2)
      },
    }),
  }
}
```

**Step 2: Create src/jira/index.ts**

```typescript
import type { ToolFactoryContext } from "../types"
import { createJiraTools } from "./tools"

const ENV_KEY = "JIRA_API_TOKEN"

export function loadJiraTools(
  config: { enabled?: boolean; cloudId?: string; email?: string },
  factoryCtx: ToolFactoryContext
): Record<string, any> | null {
  if (!config.enabled) {
    return null
  }

  const apiToken = process.env[ENV_KEY]
  if (!apiToken) {
    factoryCtx.showToast(
      "Jira: Missing API Token",
      `Set ${ENV_KEY} environment variable to enable Jira tools.`
    ).catch(() => {})
    return null
  }

  if (!config.cloudId || !config.email) {
    factoryCtx.showToast(
      "Jira: Missing Config",
      "Set cloudId and email in owo.json tools.jira config."
    ).catch(() => {})
    return null
  }

  return createJiraTools({
    cloudId: config.cloudId,
    email: config.email,
    apiToken,
  })
}

export { createJiraTools }
```

**Step 3: Wire up in src/index.ts**

```typescript
import { loadJiraTools } from "./jira"

// Load Jira tools
if (toolsConfig.jira) {
  const jiraTools = loadJiraTools(toolsConfig.jira, factoryCtx)
  if (jiraTools) {
    Object.assign(tools, jiraTools)
  }
}
```

**Step 4: Commit**

```bash
git add packages/tools/src/jira/
git commit -m "feat(tools): implement Jira issue tracking tools"
```

---

### Task 6: Implement CodeRabbit Tool

**Files:**
- Create: `packages/tools/src/coderabbit/index.ts`
- Create: `packages/tools/src/coderabbit/tools.ts`
- Modify: `packages/tools/src/index.ts`

**Note:** User is adding existing CodeRabbit implementation. This task may need adjustment based on their code.

**Step 1: Create src/coderabbit/tools.ts**

```typescript
import { tool } from "@opencode-ai/plugin"

const CODERABBIT_API_URL = "https://api.coderabbit.ai/v1"

async function coderabbitFetch(
  endpoint: string,
  apiKey: string,
  body: Record<string, any>,
  abort?: AbortSignal
): Promise<any> {
  const response = await fetch(`${CODERABBIT_API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: abort,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`CodeRabbit API error: ${response.status} - ${error}`)
  }

  return response.json()
}

export function createCodeRabbitTools(apiKey: string) {
  return {
    coderabbit_review: tool({
      description:
        "Run CodeRabbit AI code review on a diff or code changes. Returns detailed review feedback with suggestions.",
      args: {
        diff: tool.schema.string().describe("Git diff or code changes to review"),
        context: tool.schema.string().optional().describe("Additional context about the changes"),
      },
      async execute(args, context) {
        const response = await coderabbitFetch(
          "/review",
          apiKey,
          {
            diff: args.diff,
            context: args.context,
          },
          context.abort
        )

        return response.review || "No review feedback generated."
      },
    }),
  }
}
```

**Step 2: Create src/coderabbit/index.ts**

```typescript
import type { ToolFactoryContext } from "../types"
import { createCodeRabbitTools } from "./tools"

const ENV_KEY = "CODERABBIT_API_KEY"

export function loadCodeRabbitTools(
  config: { enabled?: boolean },
  factoryCtx: ToolFactoryContext
): Record<string, any> | null {
  if (!config.enabled) {
    return null
  }

  const apiKey = process.env[ENV_KEY]
  if (!apiKey) {
    factoryCtx.showToast(
      "CodeRabbit: Missing API Key",
      `Set ${ENV_KEY} environment variable to enable CodeRabbit tools.`
    ).catch(() => {})
    return null
  }

  return createCodeRabbitTools(apiKey)
}

export { createCodeRabbitTools }
```

**Step 3: Wire up in src/index.ts**

```typescript
import { loadCodeRabbitTools } from "./coderabbit"

// Load CodeRabbit tools
if (toolsConfig.coderabbit) {
  const coderabbitTools = loadCodeRabbitTools(toolsConfig.coderabbit, factoryCtx)
  if (coderabbitTools) {
    Object.assign(tools, coderabbitTools)
  }
}
```

**Step 4: Commit**

```bash
git add packages/tools/src/coderabbit/
git commit -m "feat(tools): implement CodeRabbit code review tool"
```

---

### Task 7: Final Integration & Testing

**Files:**
- Modify: `packages/tools/src/index.ts` (finalize)
- Modify: Root `package.json` (if needed for workspace)

**Step 1: Finalize src/index.ts**

Ensure all imports and tool loading is complete:

```typescript
/**
 * @owo/tools
 *
 * API-based tools for OpenCode: exa, context7, jira, coderabbit.
 * Tools are disabled by default - enable via owo.json config.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "@owo/config"
import type { ToolsConfig, ToolFactoryContext } from "./types"
import { loadExaTools } from "./exa"
import { loadContext7Tools } from "./context7"
import { loadJiraTools } from "./jira"
import { loadCodeRabbitTools } from "./coderabbit"

const ToolsPlugin: Plugin = async (ctx) => {
  let configResult
  try {
    configResult = loadConfig(ctx.directory)
  } catch (err) {
    const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error(`[owo/tools] Failed to load config: ${errorMessage}`)
    throw err
  }

  const { config } = configResult
  const toolsConfig: ToolsConfig = (config as any).tools ?? {}

  // Helper to show toast notifications
  const showToast = async (title: string, message: string) => {
    try {
      await ctx.client.toast.create({
        body: { type: "info", title, message },
      })
    } catch {
      // Silently ignore toast errors
    }
  }

  const factoryCtx: ToolFactoryContext = {
    client: ctx.client,
    showToast,
  }

  // Collect enabled tools
  const tools: Record<string, any> = {}

  // Load Exa tools
  if (toolsConfig.exa) {
    const exaTools = loadExaTools(toolsConfig.exa, factoryCtx)
    if (exaTools) {
      Object.assign(tools, exaTools)
    }
  }

  // Load Context7 tools
  if (toolsConfig.context7) {
    const context7Tools = loadContext7Tools(toolsConfig.context7, factoryCtx)
    if (context7Tools) {
      Object.assign(tools, context7Tools)
    }
  }

  // Load Jira tools
  if (toolsConfig.jira) {
    const jiraTools = loadJiraTools(toolsConfig.jira, factoryCtx)
    if (jiraTools) {
      Object.assign(tools, jiraTools)
    }
  }

  // Load CodeRabbit tools
  if (toolsConfig.coderabbit) {
    const coderabbitTools = loadCodeRabbitTools(toolsConfig.coderabbit, factoryCtx)
    if (coderabbitTools) {
      Object.assign(tools, coderabbitTools)
    }
  }

  return {
    tool: tools,
  }
}

export default ToolsPlugin
export type {
  ToolsConfig,
  ExaToolConfig,
  Context7ToolConfig,
  JiraToolConfig,
  CodeRabbitToolConfig,
  ToolFactoryContext,
} from "./types"
```

**Step 2: Build all packages**

Run: `bun run make`
Expected: All packages build successfully

**Step 3: Run typecheck**

Run: `bun run compile`
Expected: No type errors

**Step 4: Final commit**

```bash
git add .
git commit -m "feat(tools): complete @owo/tools package with all integrations"
```

---

## Summary

After completing all tasks, you will have:

1. **`@owo/tools`** - A new package with 4 API-based tools
2. **Updated config schema** - `tools` field in owo.json
3. **Toast notifications** - Warns users about missing API keys
4. **README documentation** - Setup instructions for each tool

Users can then:
1. Add `@owo/tools` to their opencode.json plugins
2. Enable specific tools in owo.json
3. Set environment variables for API keys
4. Use the tools in their sessions!

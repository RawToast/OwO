# Monorepo Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the single owo plugin into a modular monorepo with independent, composable packages that share a common config.

**Architecture:** Split into 5 packages: `@owo/config` (shared schema/loader), `@owo/keyword-detector` (config-driven keyword detection), `@owo/prompt-injector` (generic prompt injection), `@owo/orchestration` (background tasks + toast), and `@owo/owo` (meta-package for backwards compat). Each package is a standalone OpenCode plugin except config which is a shared library.

**Tech Stack:** Bun workspaces, TypeScript strict mode, Zod for schemas, ESM modules

---

## Phase 1: Monorepo Foundation

### Task 1.1: Setup Workspace Structure

**Files:**
- Create: `packages/` directory
- Modify: `package.json` (add workspaces)
- Create: `packages/.gitkeep`

**Step 1: Create packages directory**

```bash
mkdir -p packages
```

**Step 2: Update root package.json for workspaces**

Modify `package.json` to add workspaces config:

```json
{
  "name": "owo-monorepo",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "bun run --filter '*' build",
    "build:config": "bun run --filter '@owo/config' build",
    "build:keyword-detector": "bun run --filter '@owo/keyword-detector' build",
    "build:prompt-injector": "bun run --filter '@owo/prompt-injector' build",
    "build:orchestration": "bun run --filter '@owo/orchestration' build",
    "build:owo": "bun run --filter 'owo' build",
    "typecheck": "bun run --filter '*' typecheck",
    "clean": "bun run --filter '*' clean",
    "lint": "oxlint",
    "format": "oxfmt"
  },
  "devDependencies": {
    "bun-types": "1.3.6",
    "oxfmt": "0.24.0",
    "oxlint": "1.39.0",
    "@typescript/native-preview": "7.0.0-dev.20260120.1"
  }
}
```

**Step 3: Verify workspace setup**

```bash
bun install
```

Expected: Bun recognizes workspaces config

**Step 4: Commit**

```bash
git add package.json packages/
git commit -m "chore: setup monorepo workspace structure"
```

---

## Phase 2: @owo/config Package

### Task 2.1: Create Config Package Structure

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/schema.ts`
- Create: `packages/config/src/loader.ts`

**Step 1: Create package.json**

Create `packages/config/package.json`:

```json
{
  "name": "@owo/config",
  "version": "0.1.0",
  "description": "Shared configuration schema and loader for owo plugins",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun --format esm && tsc --emitDeclarationOnly",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "strip-json-comments": "5.0.3",
    "zod": "3.24.1"
  },
  "devDependencies": {
    "typescript": "5.7.3"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/config/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationDir": "dist",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create schema.ts**

Create `packages/config/src/schema.ts` - this extends the current schema to support all packages:

```typescript
import { z } from "zod"

/**
 * Flair configuration - controls personality/style injected into prompts
 */
export const FlairConfigObjectSchema = z
  .object({
    default: z.string().optional(),
    build: z.string().optional(),
    plan: z.string().optional(),
    owo: z.string().optional(),
    ask: z.string().optional(),
  })
  .passthrough()

export const FlairConfigSchema = z.union([z.boolean(), FlairConfigObjectSchema])

export type FlairConfig = z.infer<typeof FlairConfigSchema>

/**
 * Keyword pattern configuration for keyword-detector plugin
 */
export const KeywordPatternSchema = z.object({
  type: z.string(),
  pattern: z.string(),
  flags: z.string().optional().default("i"),
  context: z.string(),
  toast: z.object({
    title: z.string(),
    message: z.string(),
  }),
})

export type KeywordPattern = z.infer<typeof KeywordPatternSchema>

/**
 * Keyword detector configuration
 */
export const KeywordDetectorConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  patterns: z.array(KeywordPatternSchema).optional(),
  includeDefaults: z.boolean().optional().default(true),
})

export type KeywordDetectorConfig = z.infer<typeof KeywordDetectorConfigSchema>

/**
 * Prompt template configuration for prompt-injector plugin
 */
export const PromptTemplateSchema = z.object({
  flair: z.union([z.string(), z.boolean()]).optional(),
  sections: z.array(z.string()).optional(),
})

export const PromptInjectorConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  agents: z.record(z.string(), PromptTemplateSchema).optional(),
  templates: z.record(z.string(), z.string()).optional(),
})

export type PromptInjectorConfig = z.infer<typeof PromptInjectorConfigSchema>

/**
 * Orchestration configuration
 */
export const OrchestrationConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  toasts: z.boolean().optional().default(true),
})

export type OrchestrationConfig = z.infer<typeof OrchestrationConfigSchema>

/**
 * Agent override configuration (from original schema)
 */
export const AgentOverrideConfigSchema = z.object({
  model: z.string().optional(),
  variant: z.string().optional(),
})

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>

/**
 * Agent names
 */
export const AgentNameSchema = z.enum([
  "owo",
  "explorer",
  "librarian",
  "oracle",
  "ui-planner",
  "ask",
])

export type AgentName = z.infer<typeof AgentNameSchema>

/**
 * Agent overrides mapping
 */
export const AgentOverridesSchema = z.object({
  explorer: AgentOverrideConfigSchema.optional(),
  librarian: AgentOverrideConfigSchema.optional(),
  oracle: AgentOverrideConfigSchema.optional(),
  "ui-planner": AgentOverrideConfigSchema.optional(),
  owo: AgentOverrideConfigSchema.optional(),
  ask: AgentOverrideConfigSchema.optional(),
})

export type AgentOverrides = z.infer<typeof AgentOverridesSchema>

/**
 * Tool configuration
 */
export const ToolConfigSchema = z.object({
  enabled: z.boolean().optional(),
  key: z.string().optional(),
})

export type ToolConfig = z.infer<typeof ToolConfigSchema>

export const ToolsConfigSchema = z.object({
  exa: ToolConfigSchema.optional(),
  context7: ToolConfigSchema.optional(),
})

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>

/**
 * MCP names
 */
export const McpNameSchema = z.enum(["grep_app", "sequential-thinking"])

export type McpName = z.infer<typeof McpNameSchema>

/**
 * Main unified configuration schema for all owo packages
 */
export const OwoConfigSchema = z.object({
  $schema: z.string().optional(),
  
  // Original owo config fields
  agents: AgentOverridesSchema.optional(),
  tools: ToolsConfigSchema.optional(),
  flair: FlairConfigSchema.optional(),
  disabled_agents: z.array(AgentNameSchema).optional(),
  disabled_mcps: z.array(McpNameSchema).optional(),
  
  // New package-specific config sections
  keywords: KeywordDetectorConfigSchema.optional(),
  prompts: PromptInjectorConfigSchema.optional(),
  orchestration: OrchestrationConfigSchema.optional(),
})

export type OwoConfig = z.infer<typeof OwoConfigSchema>
```

**Step 4: Create loader.ts**

Create `packages/config/src/loader.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import stripJsonComments from "strip-json-comments"
import { OwoConfigSchema, type OwoConfig } from "./schema"

const CONFIG_FILENAMES = ["owo.json", "zenox.json"]

/**
 * Find config file in standard locations
 * Priority: project dir > ~/.config/opencode/ > home dir
 */
export function findConfigFile(projectDir?: string): string | undefined {
  const searchPaths: string[] = []

  // Project directory first
  if (projectDir) {
    for (const filename of CONFIG_FILENAMES) {
      searchPaths.push(join(projectDir, filename))
      searchPaths.push(join(projectDir, ".opencode", filename))
    }
  }

  // User config directory
  const configDir = join(homedir(), ".config", "opencode")
  for (const filename of CONFIG_FILENAMES) {
    searchPaths.push(join(configDir, filename))
  }

  // Home directory
  for (const filename of CONFIG_FILENAMES) {
    searchPaths.push(join(homedir(), filename))
  }

  for (const path of searchPaths) {
    if (existsSync(path)) {
      return path
    }
  }

  return undefined
}

/**
 * Load and parse config file
 */
export function loadConfig(projectDir?: string): OwoConfig {
  const configPath = findConfigFile(projectDir)

  if (!configPath) {
    return {}
  }

  try {
    const content = readFileSync(configPath, "utf-8")
    const json = JSON.parse(stripJsonComments(content))
    const result = OwoConfigSchema.safeParse(json)

    if (!result.success) {
      console.warn(`[owo/config] Invalid config at ${configPath}:`, result.error.message)
      return {}
    }

    return result.data
  } catch (err) {
    console.warn(
      `[owo/config] Failed to load config from ${configPath}:`,
      err instanceof Error ? err.message : String(err),
    )
    return {}
  }
}

/**
 * Get config path for writing
 */
export function getConfigWritePath(): string {
  const configDir = join(homedir(), ".config", "opencode")
  return join(configDir, "owo.json")
}
```

**Step 5: Create index.ts**

Create `packages/config/src/index.ts`:

```typescript
// Schema exports
export {
  OwoConfigSchema,
  FlairConfigSchema,
  FlairConfigObjectSchema,
  KeywordPatternSchema,
  KeywordDetectorConfigSchema,
  PromptInjectorConfigSchema,
  PromptTemplateSchema,
  OrchestrationConfigSchema,
  AgentOverrideConfigSchema,
  AgentOverridesSchema,
  AgentNameSchema,
  ToolConfigSchema,
  ToolsConfigSchema,
  McpNameSchema,
} from "./schema"

// Type exports
export type {
  OwoConfig,
  FlairConfig,
  KeywordPattern,
  KeywordDetectorConfig,
  PromptInjectorConfig,
  OrchestrationConfig,
  AgentOverrideConfig,
  AgentOverrides,
  AgentName,
  ToolConfig,
  ToolsConfig,
  McpName,
} from "./schema"

// Loader exports
export { findConfigFile, loadConfig, getConfigWritePath } from "./loader"
```

**Step 6: Build and verify**

```bash
cd packages/config && bun install && bun run build
```

Expected: Builds successfully, creates dist/index.js and dist/index.d.ts

**Step 7: Commit**

```bash
git add packages/config/
git commit -m "feat(config): add @owo/config shared configuration package"
```

---

## Phase 3: @owo/keyword-detector Package

### Task 3.1: Create Keyword Detector Package

**Files:**
- Create: `packages/keyword-detector/package.json`
- Create: `packages/keyword-detector/tsconfig.json`
- Create: `packages/keyword-detector/src/index.ts`
- Create: `packages/keyword-detector/src/defaults.ts`
- Create: `packages/keyword-detector/src/detector.ts`

**Step 1: Create package.json**

Create `packages/keyword-detector/package.json`:

```json
{
  "name": "@owo/keyword-detector",
  "version": "0.1.0",
  "description": "Config-driven keyword detection plugin for OpenCode",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun --format esm && tsc --emitDeclarationOnly",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opencode-ai/plugin": "1.1.25",
    "@opencode-ai/sdk": "1.1.25",
    "@owo/config": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.7.3"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/keyword-detector/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationDir": "dist",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create defaults.ts**

Create `packages/keyword-detector/src/defaults.ts` with the default keyword patterns:

```typescript
import type { KeywordPattern } from "@owo/config"

export const ULTRAWORK_CONTEXT = `<ultrawork-mode>
ULTRAWORK MODE ACTIVE - Maximum multi-agent coordination engaged.

**Mandatory behaviors**:
1. Fire explore + librarian in PARALLEL BACKGROUND for ANY research task
2. Use pre-delegation reasoning before EVERY delegation
3. Continue productive work while background agents run (never idle)
4. Consult oracle for architectural decisions before implementing
5. Verify ALL delegated work before marking tasks complete

**Pre-delegation reasoning** (do this before every Task/background_task):
- What type of work? (search -> background, decision -> sync, visual -> sync)
- Can I continue working while this runs? If yes -> background_task
- Do I need this answer RIGHT NOW to proceed? If no -> background_task

**Parallel research pattern**:
\`\`\`
// Fire research immediately
background_task(agent="explorer", description="Find patterns", prompt="...")
background_task(agent="librarian", description="Find best practices", prompt="...")

// Continue working while they run:
// - Plan implementation approach
// - Read files you know about
// - Identify edge cases

// When notified -> retrieve and synthesize
background_output(task_id="bg_xxx")
\`\`\`
</ultrawork-mode>`

export const DEEP_RESEARCH_CONTEXT = `<deep-research-mode>
DEEP RESEARCH MODE - Comprehensive exploration requested.

**Required actions**:
1. Fire at least 2-3 parallel background agents before proceeding
2. Search BOTH internal (explorer) AND external (librarian) sources
3. Explore multiple angles: implementations, tests, patterns, docs
4. DO NOT proceed until you have comprehensive context
5. Synthesize all findings before making decisions

**Research pattern**:
\`\`\`
// Fire comprehensive research
background_task(agent="explorer", description="Find implementations", prompt="...")
background_task(agent="explorer", description="Find related tests", prompt="...")
background_task(agent="librarian", description="Find official docs", prompt="...")
background_task(agent="librarian", description="Find OSS examples", prompt="...")

// Wait for ALL results before proceeding
// When notified -> retrieve, synthesize, then act
\`\`\`
</deep-research-mode>`

export const EXPLORE_CONTEXT = `<explore-mode>
EXPLORE MODE - Codebase exploration active.

**Required actions**:
1. Fire multiple explorer agents in background for parallel search
2. Search for: patterns, implementations, tests, related code
3. Map out the relevant code landscape before modifying
4. Look for existing conventions and follow them

**Exploration pattern**:
\`\`\`
// Fire multiple explorers in parallel
background_task(agent="explorer", description="Find main implementation", prompt="...")
background_task(agent="explorer", description="Find related tests", prompt="...")
background_task(agent="explorer", description="Find usage examples", prompt="...")

// Continue analyzing what you know while they search
\`\`\`
</explore-mode>`

export const DEFAULT_KEYWORD_PATTERNS: KeywordPattern[] = [
  {
    type: "ultrawork",
    pattern: "\\b(ultrawork|ulw)\\b",
    flags: "i",
    context: ULTRAWORK_CONTEXT,
    toast: {
      title: "Ultrawork Mode",
      message: "Maximum precision engaged. Multi-agent coordination active.",
    },
  },
  {
    type: "deep-research",
    pattern: "\\b(deep\\s*research|research\\s*deep(ly)?)\\b",
    flags: "i",
    context: DEEP_RESEARCH_CONTEXT,
    toast: {
      title: "Deep Research Mode",
      message: "Comprehensive exploration enabled. Background agents will fire.",
    },
  },
  {
    type: "explore",
    pattern: "\\b(explore\\s*(the\\s*)?(codebase|code|project))\\b",
    flags: "i",
    context: EXPLORE_CONTEXT,
    toast: {
      title: "Explore Mode",
      message: "Codebase exploration active. Multiple explorers will run.",
    },
  },
]
```

**Step 4: Create detector.ts**

Create `packages/keyword-detector/src/detector.ts`:

```typescript
import type { PluginInput } from "@opencode-ai/plugin"
import type { KeywordPattern, KeywordDetectorConfig } from "@owo/config"
import { DEFAULT_KEYWORD_PATTERNS } from "./defaults"

const TOAST_DURATION = 4000

interface MessagePart {
  type: string
  text?: string
  synthetic?: boolean
}

interface ChatMessageOutput {
  parts: MessagePart[]
  message: Record<string, unknown>
}

interface CompiledPattern {
  type: string
  regex: RegExp
  context: string
  toast: {
    title: string
    message: string
  }
}

function compilePatterns(patterns: KeywordPattern[]): CompiledPattern[] {
  return patterns.map((p) => ({
    type: p.type,
    regex: new RegExp(p.pattern, p.flags ?? "i"),
    context: p.context,
    toast: p.toast,
  }))
}

function extractTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text ?? "")
    .join(" ")
}

function removeCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "")
}

function detectKeywords(text: string, patterns: CompiledPattern[]): CompiledPattern[] {
  const cleanText = removeCodeBlocks(text)
  const detected: CompiledPattern[] = []

  for (const pattern of patterns) {
    if (pattern.regex.test(cleanText)) {
      detected.push(pattern)
    }
  }

  return detected
}

export function createKeywordDetectorHook(
  ctx: PluginInput,
  config?: KeywordDetectorConfig,
) {
  // Check if disabled
  if (config?.enabled === false) {
    return {}
  }

  // Build pattern list
  const patterns: KeywordPattern[] = []

  // Include defaults unless explicitly disabled
  if (config?.includeDefaults !== false) {
    patterns.push(...DEFAULT_KEYWORD_PATTERNS)
  }

  // Add custom patterns from config
  if (config?.patterns) {
    patterns.push(...config.patterns)
  }

  // Compile patterns to RegExp
  const compiledPatterns = compilePatterns(patterns)

  // Track detected sessions to prevent duplicates
  const detectedSessions = new Set<string>()

  return {
    "chat.message": async (
      input: { sessionID: string; agent?: string },
      output: ChatMessageOutput,
    ): Promise<void> => {
      const promptText = extractTextFromParts(output.parts)
      const detectedKeywords = detectKeywords(promptText, compiledPatterns)

      if (detectedKeywords.length === 0) return

      // Prevent duplicate detection in same session
      const sessionKey = `${input.sessionID}-${detectedKeywords.map((k) => k.type).join("-")}`
      if (detectedSessions.has(sessionKey)) return
      detectedSessions.add(sessionKey)

      // Get highest priority keyword (first match)
      const primaryKeyword = detectedKeywords[0]

      // Inject context by appending to existing text part or adding new one
      const textPartIndex = output.parts.findIndex((p) => p.type === "text" && p.text)

      if (textPartIndex >= 0) {
        const existingPart = output.parts[textPartIndex]
        existingPart.text = `${existingPart.text ?? ""}\n\n${primaryKeyword.context}`
      } else {
        output.parts.push({
          type: "text",
          text: primaryKeyword.context,
          synthetic: true,
        })
      }

      // Show toast notification
      await ctx.client.tui
        .showToast({
          body: {
            title: primaryKeyword.toast.title,
            message: primaryKeyword.toast.message,
            variant: "success",
            duration: TOAST_DURATION,
          },
        })
        .catch(() => {})

      // Clean up old session keys periodically
      if (detectedSessions.size > 100) {
        const entries = [...detectedSessions]
        entries.slice(0, 50).forEach((key) => detectedSessions.delete(key))
      }
    },
  }
}
```

**Step 5: Create index.ts (plugin entry)**

Create `packages/keyword-detector/src/index.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "@owo/config"
import { createKeywordDetectorHook } from "./detector"

export { createKeywordDetectorHook } from "./detector"
export { DEFAULT_KEYWORD_PATTERNS } from "./defaults"

const KeywordDetectorPlugin: Plugin = async (ctx) => {
  const config = loadConfig(ctx.directory)
  const hook = createKeywordDetectorHook(ctx, config.keywords)

  return {
    "chat.message": hook["chat.message"],
  }
}

export default KeywordDetectorPlugin
```

**Step 6: Build and verify**

```bash
cd packages/keyword-detector && bun install && bun run build
```

Expected: Builds successfully

**Step 7: Commit**

```bash
git add packages/keyword-detector/
git commit -m "feat(keyword-detector): add @owo/keyword-detector config-driven plugin"
```

---

## Phase 4: @owo/prompt-injector Package

### Task 4.1: Create Prompt Injector Package

**Files:**
- Create: `packages/prompt-injector/package.json`
- Create: `packages/prompt-injector/tsconfig.json`
- Create: `packages/prompt-injector/src/index.ts`
- Create: `packages/prompt-injector/src/resolver.ts`
- Create: `packages/prompt-injector/src/defaults.ts`

**Step 1: Create package.json**

Create `packages/prompt-injector/package.json`:

```json
{
  "name": "@owo/prompt-injector",
  "version": "0.1.0",
  "description": "Config-driven prompt injection plugin for OpenCode",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun --format esm && tsc --emitDeclarationOnly",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opencode-ai/plugin": "1.1.25",
    "@opencode-ai/sdk": "1.1.25",
    "@owo/config": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.7.3"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/prompt-injector/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationDir": "dist",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create defaults.ts**

Create `packages/prompt-injector/src/defaults.ts`:

```typescript
/**
 * Default flair text
 */
export const DEFAULT_FLAIR = `Remember to include japanese cute kaomoji, e.g. (´｡• ω •｡\`) , ฅ( ᵕ ω ᵕ ), (´▽｀)ノ , ₍⸍⸌̣ʷ̣̫⸍̣⸌₎, (*ФωФ)ノ
Don't always use those examples, make them up as you go!`
```

**Step 4: Create resolver.ts**

Create `packages/prompt-injector/src/resolver.ts`:

```typescript
import type { FlairConfig, PromptInjectorConfig } from "@owo/config"
import { DEFAULT_FLAIR } from "./defaults"

/**
 * Resolves the flair text for a given agent based on config.
 */
export function resolveFlair(
  agent: string | undefined,
  flairConfig: FlairConfig | undefined,
): string | undefined {
  // flair: false -> disable entirely
  if (flairConfig === false) {
    return undefined
  }

  // flair: true or undefined -> use default
  if (flairConfig === true || flairConfig === undefined) {
    return DEFAULT_FLAIR
  }

  // flair: { ... } -> resolve agent-specific or fall back
  if (agent && typeof flairConfig === "object" && agent in flairConfig) {
    return (flairConfig as Record<string, string | undefined>)[agent]
  }

  // Fall back to config.default, then hardcoded default
  return flairConfig.default ?? DEFAULT_FLAIR
}

/**
 * Builds the flair section for injection
 */
export function buildFlairSection(flair: string | undefined): string {
  if (!flair) return ""
  return `${flair}\n\n---`
}

/**
 * Resolves prompt sections for an agent
 */
export function resolvePromptSections(
  agent: string | undefined,
  config: PromptInjectorConfig | undefined,
): string[] {
  if (!config?.enabled) return []
  if (!agent || !config.agents?.[agent]) return []

  const agentConfig = config.agents[agent]
  const sections = agentConfig.sections ?? []
  const templates = config.templates ?? {}

  return sections
    .map((sectionName) => templates[sectionName])
    .filter((s): s is string => !!s)
}

/**
 * Builds the complete prompt for an agent
 */
export function buildPrompt(
  agent: string | undefined,
  flairConfig: FlairConfig | undefined,
  promptConfig: PromptInjectorConfig | undefined,
): string | undefined {
  const parts: string[] = []

  // Add flair section
  const flair = resolveFlair(agent, flairConfig)
  const flairSection = buildFlairSection(flair)
  if (flairSection) {
    parts.push(flairSection)
  }

  // Add prompt sections from config
  const sections = resolvePromptSections(agent, promptConfig)
  parts.push(...sections)

  return parts.length > 0 ? parts.join("\n\n") : undefined
}
```

**Step 5: Create index.ts (plugin entry)**

Create `packages/prompt-injector/src/index.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "@owo/config"
import { buildPrompt, resolveFlair, buildFlairSection, resolvePromptSections } from "./resolver"

export { buildPrompt, resolveFlair, buildFlairSection, resolvePromptSections } from "./resolver"
export { DEFAULT_FLAIR } from "./defaults"

// Session agent tracking (simple in-memory map)
const sessionAgents = new Map<string, string | undefined>()

const PromptInjectorPlugin: Plugin = async (ctx) => {
  const config = loadConfig(ctx.directory)

  // Check if disabled
  if (config.prompts?.enabled === false) {
    return {}
  }

  return {
    // Track which agent is active per session
    "chat.message": async (
      input: { sessionID: string; agent?: string },
      _output: unknown,
    ): Promise<void> => {
      sessionAgents.set(input.sessionID, input.agent)
    },

    // Inject prompt into system prompt
    "experimental.chat.system.transform": async (
      input: unknown,
      output: { system: string[] },
    ): Promise<void> => {
      const { sessionID } = input as { sessionID?: string }
      if (!sessionID) return

      const agent = sessionAgents.get(sessionID)
      const prompt = buildPrompt(agent, config.flair, config.prompts)

      if (prompt) {
        output.system.push(prompt)
      }
    },
  }
}

export default PromptInjectorPlugin
```

**Step 6: Build and verify**

```bash
cd packages/prompt-injector && bun install && bun run build
```

Expected: Builds successfully

**Step 7: Commit**

```bash
git add packages/prompt-injector/
git commit -m "feat(prompt-injector): add @owo/prompt-injector config-driven plugin"
```

---

## Phase 5: @owo/orchestration Package

### Task 5.1: Create Orchestration Package

**Files:**
- Create: `packages/orchestration/package.json`
- Create: `packages/orchestration/tsconfig.json`
- Create: `packages/orchestration/src/index.ts`
- Create: `packages/orchestration/src/background-manager.ts`
- Create: `packages/orchestration/src/task-toast.ts`
- Create: `packages/orchestration/src/tools.ts`

**Step 1: Create package.json**

Create `packages/orchestration/package.json`:

```json
{
  "name": "@owo/orchestration",
  "version": "0.1.0",
  "description": "Background task orchestration with toast notifications for OpenCode",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun --format esm && tsc --emitDeclarationOnly",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opencode-ai/plugin": "1.1.25",
    "@opencode-ai/sdk": "1.1.25",
    "@owo/config": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.7.3"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/orchestration/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationDir": "dist",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Copy and adapt background-manager.ts**

Copy from `src/background/manager.ts` to `packages/orchestration/src/background-manager.ts` with minimal changes (remove toast manager coupling, make it injectable).

**Step 4: Copy and adapt task-toast.ts**

Copy from `src/features/task-toast/manager.ts` to `packages/orchestration/src/task-toast.ts`.

**Step 5: Create tools.ts**

Adapt from `src/background/tools.ts` to `packages/orchestration/src/tools.ts`.

**Step 6: Create index.ts (plugin entry)**

Create `packages/orchestration/src/index.ts` that wires everything together as a plugin.

**Step 7: Build and verify**

```bash
cd packages/orchestration && bun install && bun run build
```

**Step 8: Commit**

```bash
git add packages/orchestration/
git commit -m "feat(orchestration): add @owo/orchestration background task plugin"
```

---

## Phase 6: Meta-Package and Migration

### Task 6.1: Create owo Meta-Package

**Files:**
- Create: `packages/owo/package.json`
- Create: `packages/owo/tsconfig.json`
- Create: `packages/owo/src/index.ts`

**Step 1: Create package.json**

Create `packages/owo/package.json`:

```json
{
  "name": "owo",
  "version": "2.0.0",
  "description": "OpenCode plugin suite - agents, orchestration, and smart features",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun --format esm && tsc --emitDeclarationOnly",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opencode-ai/plugin": "1.1.25",
    "@opencode-ai/sdk": "1.1.25",
    "@owo/config": "workspace:*",
    "@owo/keyword-detector": "workspace:*",
    "@owo/prompt-injector": "workspace:*",
    "@owo/orchestration": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.7.3"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Create index.ts**

Create `packages/owo/src/index.ts` that composes all plugins together (similar to current src/index.ts but using the new packages).

**Step 3: Build and verify**

```bash
cd packages/owo && bun install && bun run build
```

**Step 4: Commit**

```bash
git add packages/owo/
git commit -m "feat(owo): add meta-package composing all owo plugins"
```

---

### Task 6.2: Update Root and Clean Up

**Step 1: Move old src/ to src-legacy/ (for reference)**

```bash
mv src src-legacy
```

**Step 2: Update root package.json**

Remove old build scripts, keep only workspace orchestration.

**Step 3: Test full build**

```bash
bun install
bun run build
```

**Step 4: Final commit**

```bash
git add .
git commit -m "chore: complete monorepo migration"
```

---

## Summary

| Package | Purpose | Dependencies |
|---------|---------|--------------|
| `@owo/config` | Shared schema + loader | zod, strip-json-comments |
| `@owo/keyword-detector` | Config-driven keyword detection | @owo/config |
| `@owo/prompt-injector` | Config-driven prompt injection | @owo/config |
| `@owo/orchestration` | Background tasks + toasts | @owo/config |
| `owo` | Meta-package (all-in-one) | All above |

**Build order:** config -> keyword-detector -> prompt-injector -> orchestration -> owo

**User installation options:**
- `bun add owo` - Full suite (backwards compatible)
- `bun add @owo/keyword-detector` - Just keyword detection
- `bun add @owo/prompt-injector` - Just prompt injection
- `bun add @owo/orchestration` - Just background tasks

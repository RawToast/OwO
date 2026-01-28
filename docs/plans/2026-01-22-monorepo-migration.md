# Monorepo Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the single owo plugin into a modular monorepo with independent, composable packages that share a common config.

**Architecture:** Split into packages: `@owo/config` (shared schema/loader), `@owo/keyword-detector` (config-driven keyword detection), `@owo/prompt-injector` (generic prompt injection), `@owo/orchestration` (background tasks + toast), and `packages/examples` (non-installable reference agents). Each package is a standalone OpenCode plugin except config (shared library) and examples (reference only).

**Tech Stack:** Bun workspaces + TurboRepo, tsgo for compilation, Zod for schemas, ESM modules, Bun catalogs for shared deps

---

## Key Design Decisions

1. **TurboRepo** for task orchestration (`make`, `compile`, `clean`)
2. **Bun catalogs** for shared dependency versions
3. **tsgo** (not tsc) for type compilation
4. **Open agent schema** - `z.string()` not enum (users define their own agents)
5. **No defaults in keyword-detector** - fully config-driven
6. **File path support** - context can be inline string OR `{ file: "path" }`
7. **Types not interfaces** - use `type` everywhere
8. **Minimal OwoConfigSchema** - only keywords, prompts, orchestration (no agents/tools/flair at root)
9. **Examples package** - non-installable reference with current agents

---

## Phase 1: Monorepo Foundation

### Task 1.1: Setup Workspace Structure with TurboRepo

**Files:**

- Modify: `package.json` (workspaces + catalogs)
- Modify: `bunfig.toml` (add linker = isolated)
- Create: `turbo.json`
- Create: `packages/` directory

**Step 1: Update bunfig.toml**

Modify `bunfig.toml`:

```toml
[install]
exact = true
linker = "isolated"
```

**Step 2: Update root package.json with workspaces and catalogs**

```json
{
  "name": "owo-monorepo",
  "private": true,
  "workspaces": {
    "packages": ["packages/*"],
    "catalog": {
      "zod": "3.24.1",
      "strip-json-comments": "5.0.3",
      "@opencode-ai/plugin": "1.1.25",
      "@opencode-ai/sdk": "1.1.25"
    }
  },
  "scripts": {
    "make": "turbo run make",
    "compile": "turbo run compile",
    "clean": "turbo run clean",
    "lint": "oxlint",
    "format": "oxfmt"
  },
  "devDependencies": {
    "turbo": "2.5.4",
    "@types/bun": "catalog:*",
    "oxfmt": "0.24.0",
    "oxlint": "1.39.0"
  }
}
```

**Step 3: Create turbo.json**

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "make": {
      "dependsOn": ["^make"],
      "outputs": ["dist/**"]
    },
    "compile": {
      "dependsOn": ["^compile"],
      "outputs": ["dist/**/*.d.ts"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

**Step 4: Create packages directory**

```bash
mkdir -p packages
```

**Step 5: Install and verify**

```bash
bun install
```

Expected: Bun recognizes workspaces + turbo available

**Step 6: Commit**

```bash
git add package.json bunfig.toml turbo.json packages/
git commit -m "chore: setup monorepo with turborepo and bun catalogs"
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
    "make": "bun build src/index.ts --outdir dist --target bun --format esm && bun run compile",
    "compile": "tsgo --emitDeclarationOnly",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "strip-json-comments": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@typescript/native-preview": "7.0.0-dev.20260120.1"
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

Create `packages/config/src/schema.ts`:

```typescript
import { z } from "zod"

/**
 * Context can be inline string OR file reference
 * - string: inline content
 * - { file: "path" }: load from file relative to config
 */
export const ContextSchema = z.union([z.string(), z.object({ file: z.string() })])

export type Context = z.infer<typeof ContextSchema>

/**
 * Toast notification configuration
 */
export const ToastConfigSchema = z.object({
  title: z.string(),
  message: z.string(),
})

export type ToastConfig = z.infer<typeof ToastConfigSchema>

/**
 * Keyword pattern configuration for keyword-detector plugin
 * No defaults - user defines everything in config
 */
export const KeywordPatternSchema = z.object({
  type: z.string(),
  pattern: z.string(),
  flags: z.string().optional().default("i"),
  context: ContextSchema,
  toast: ToastConfigSchema,
})

export type KeywordPattern = z.infer<typeof KeywordPatternSchema>

/**
 * Keyword detector configuration
 */
export const KeywordDetectorConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  patterns: z.array(KeywordPatternSchema).optional().default([]),
})

export type KeywordDetectorConfig = z.infer<typeof KeywordDetectorConfigSchema>

/**
 * Prompt template configuration for prompt-injector plugin
 * Agent names are open strings - user defines their own
 */
export const PromptTemplateSchema = z.object({
  flair: ContextSchema.optional(),
  sections: z.array(z.string()).optional(),
})

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>

export const PromptInjectorConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  agents: z.record(z.string(), PromptTemplateSchema).optional(),
  templates: z.record(z.string(), ContextSchema).optional(),
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
 * Main unified configuration schema for all owo packages
 * Minimal - only package-specific sections, no agents/tools/flair at root
 */
export const OwoConfigSchema = z.object({
  $schema: z.string().optional(),
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
import { dirname, join, isAbsolute } from "node:path"
import stripJsonComments from "strip-json-comments"
import { OwoConfigSchema, type OwoConfig, type Context } from "./schema"

const CONFIG_FILENAMES = ["owo.json"]

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
 * Resolve context - either inline string or load from file
 */
export function resolveContext(context: Context, configDir: string): string {
  if (typeof context === "string") {
    return context
  }

  // File reference - resolve path relative to config file
  const filePath = isAbsolute(context.file) ? context.file : join(configDir, context.file)

  try {
    return readFileSync(filePath, "utf-8")
  } catch (err) {
    console.warn(
      `[owo/config] Failed to load context from ${filePath}:`,
      err instanceof Error ? err.message : String(err),
    )
    return ""
  }
}

/**
 * Load and parse config file
 */
export function loadConfig(projectDir?: string): { config: OwoConfig; configDir: string } {
  const configPath = findConfigFile(projectDir)

  if (!configPath) {
    return { config: {}, configDir: projectDir ?? process.cwd() }
  }

  const configDir = dirname(configPath)

  try {
    const content = readFileSync(configPath, "utf-8")
    const json = JSON.parse(stripJsonComments(content))
    const result = OwoConfigSchema.safeParse(json)

    if (!result.success) {
      console.warn(`[owo/config] Invalid config at ${configPath}:`, result.error.message)
      return { config: {}, configDir }
    }

    return { config: result.data, configDir }
  } catch (err) {
    console.warn(
      `[owo/config] Failed to load config from ${configPath}:`,
      err instanceof Error ? err.message : String(err),
    )
    return { config: {}, configDir }
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
  ContextSchema,
  ToastConfigSchema,
  KeywordPatternSchema,
  KeywordDetectorConfigSchema,
  PromptInjectorConfigSchema,
  PromptTemplateSchema,
  OrchestrationConfigSchema,
} from "./schema"

// Type exports
export type {
  OwoConfig,
  Context,
  ToastConfig,
  KeywordPattern,
  KeywordDetectorConfig,
  PromptInjectorConfig,
  PromptTemplate,
  OrchestrationConfig,
} from "./schema"

// Loader exports
export { findConfigFile, loadConfig, getConfigWritePath, resolveContext } from "./loader"
```

**Step 6: Build and verify**

```bash
cd packages/config && bun install && bun run make
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
    "make": "bun build src/index.ts --outdir dist --target bun --format esm && bun run compile",
    "compile": "tsgo --emitDeclarationOnly",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@opencode-ai/plugin": "catalog:",
    "@opencode-ai/sdk": "catalog:",
    "@owo/config": "workspace:*"
  },
  "devDependencies": {
    "@typescript/native-preview": "7.0.0-dev.20260120.1"
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

**Step 3: Create detector.ts**

Create `packages/keyword-detector/src/detector.ts`:

````typescript
import type { PluginInput } from "@opencode-ai/plugin"
import type { KeywordPattern, KeywordDetectorConfig } from "@owo/config"
import { resolveContext } from "@owo/config"

const TOAST_DURATION = 4000

type MessagePart = {
  type: string
  text?: string
  synthetic?: boolean
}

type ChatMessageOutput = {
  parts: MessagePart[]
  message: Record<string, unknown>
}

type CompiledPattern = {
  type: string
  regex: RegExp
  context: string
  toast: {
    title: string
    message: string
  }
}

function compilePatterns(patterns: KeywordPattern[], configDir: string): CompiledPattern[] {
  return patterns.map((p) => ({
    type: p.type,
    regex: new RegExp(p.pattern, p.flags ?? "i"),
    context: resolveContext(p.context, configDir),
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
  config: KeywordDetectorConfig | undefined,
  configDir: string,
) {
  // Check if disabled or no patterns
  if (config?.enabled === false) {
    return {}
  }

  const patterns = config?.patterns ?? []
  if (patterns.length === 0) {
    return {}
  }

  // Compile patterns to RegExp (resolving file contexts)
  const compiledPatterns = compilePatterns(patterns, configDir)

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
````

**Step 4: Create index.ts (plugin entry)**

Create `packages/keyword-detector/src/index.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "@owo/config"
import { createKeywordDetectorHook } from "./detector"

export { createKeywordDetectorHook } from "./detector"

const KeywordDetectorPlugin: Plugin = async (ctx) => {
  const { config, configDir } = loadConfig(ctx.directory)
  const hook = createKeywordDetectorHook(ctx, config.keywords, configDir)

  return {
    "chat.message": hook["chat.message"],
  }
}

export default KeywordDetectorPlugin
```

**Step 5: Build and verify**

```bash
cd packages/keyword-detector && bun install && bun run make
```

Expected: Builds successfully

**Step 6: Commit**

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
    "make": "bun build src/index.ts --outdir dist --target bun --format esm && bun run compile",
    "compile": "tsgo --emitDeclarationOnly",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@opencode-ai/plugin": "catalog:",
    "@opencode-ai/sdk": "catalog:",
    "@owo/config": "workspace:*"
  },
  "devDependencies": {
    "@typescript/native-preview": "7.0.0-dev.20260120.1"
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

**Step 3: Create resolver.ts**

Create `packages/prompt-injector/src/resolver.ts`:

```typescript
import type { PromptInjectorConfig, Context } from "@owo/config"
import { resolveContext } from "@owo/config"

/**
 * Resolves the flair for a given agent based on config
 */
export function resolveFlair(
  agent: string | undefined,
  config: PromptInjectorConfig | undefined,
  configDir: string,
): string | undefined {
  if (!config?.agents || !agent) return undefined

  const agentConfig = config.agents[agent]
  if (!agentConfig?.flair) return undefined

  return resolveContext(agentConfig.flair, configDir)
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
  configDir: string,
): string[] {
  if (!config?.enabled) return []
  if (!agent || !config.agents?.[agent]) return []

  const agentConfig = config.agents[agent]
  const sectionNames = agentConfig.sections ?? []
  const templates = config.templates ?? {}

  return sectionNames
    .map((name) => {
      const template = templates[name]
      if (!template) return undefined
      return resolveContext(template, configDir)
    })
    .filter((s): s is string => !!s && s.length > 0)
}

/**
 * Builds the complete prompt for an agent
 */
export function buildPrompt(
  agent: string | undefined,
  config: PromptInjectorConfig | undefined,
  configDir: string,
): string | undefined {
  const parts: string[] = []

  // Add flair section
  const flair = resolveFlair(agent, config, configDir)
  const flairSection = buildFlairSection(flair)
  if (flairSection) {
    parts.push(flairSection)
  }

  // Add prompt sections from config
  const sections = resolvePromptSections(agent, config, configDir)
  parts.push(...sections)

  return parts.length > 0 ? parts.join("\n\n") : undefined
}
```

**Step 4: Create index.ts (plugin entry)**

Create `packages/prompt-injector/src/index.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "@owo/config"
import { buildPrompt, resolveFlair, buildFlairSection, resolvePromptSections } from "./resolver"

export { buildPrompt, resolveFlair, buildFlairSection, resolvePromptSections } from "./resolver"

// Session agent tracking (simple in-memory map)
const sessionAgents = new Map<string, string | undefined>()

const PromptInjectorPlugin: Plugin = async (ctx) => {
  const { config, configDir } = loadConfig(ctx.directory)

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
      const prompt = buildPrompt(agent, config.prompts, configDir)

      if (prompt) {
        output.system.push(prompt)
      }
    },
  }
}

export default PromptInjectorPlugin
```

**Step 5: Build and verify**

```bash
cd packages/prompt-injector && bun install && bun run make
```

Expected: Builds successfully

**Step 6: Commit**

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
    "make": "bun build src/index.ts --outdir dist --target bun --format esm && bun run compile",
    "compile": "tsgo --emitDeclarationOnly",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@opencode-ai/plugin": "catalog:",
    "@opencode-ai/sdk": "catalog:",
    "@owo/config": "workspace:*"
  },
  "devDependencies": {
    "@typescript/native-preview": "7.0.0-dev.20260120.1"
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

**Step 3: Copy and adapt files from src/**

Copy and adapt from existing source:

- `src/background/manager.ts` -> `packages/orchestration/src/background-manager.ts`
- `src/features/task-toast/manager.ts` -> `packages/orchestration/src/task-toast.ts`
- `src/background/tools.ts` -> `packages/orchestration/src/tools.ts`

Use `type` instead of `interface` throughout.

**Step 4: Create index.ts (plugin entry)**

Create `packages/orchestration/src/index.ts` that wires everything together as a plugin.

**Step 5: Build and verify**

```bash
cd packages/orchestration && bun install && bun run make
```

**Step 6: Commit**

```bash
git add packages/orchestration/
git commit -m "feat(orchestration): add @owo/orchestration background task plugin"
```

---

## Phase 6: Examples Package (Reference Only)

### Task 6.1: Create Examples Package

**Files:**

- Create: `packages/examples/package.json`
- Create: `packages/examples/README.md`
- Create: `packages/examples/agents/` (copy from src/agents/)
- Create: `packages/examples/prompts/` (example prompt files)
- Create: `packages/examples/keywords/` (example keyword contexts)

**Step 1: Create package.json (private, not published)**

Create `packages/examples/package.json`:

```json
{
  "name": "@owo/examples",
  "version": "0.0.0",
  "private": true,
  "description": "Example agents, prompts, and keyword contexts for reference",
  "type": "module"
}
```

**Step 2: Create README.md**

Create `packages/examples/README.md`:

```markdown
# @owo/examples

This package contains example configurations for reference. It is NOT published.

## Contents

- `agents/` - Example agent definitions (explorer, librarian, oracle, etc.)
- `prompts/` - Example prompt templates and flair
- `keywords/` - Example keyword context files

## Usage

Copy and adapt these examples into your own configuration.
```

**Step 3: Copy existing agents**

Copy from `src/agents/` to `packages/examples/agents/`

**Step 4: Create example prompt files**

Create `packages/examples/prompts/kaomoji-flair.txt`:

```
Remember to include japanese cute kaomoji, e.g. (´｡• ω •｡`) , ฅ( ᵕ ω ᵕ ), (´▽｀)ノ , ₍⸍⸌̣ʷ̣̫⸍̣⸌₎, (*ФωФ)ノ
Don't always use those examples, make them up as you go!
```

**Step 5: Create example keyword contexts**

Create `packages/examples/keywords/ultrawork.txt` with the ultrawork context.

**Step 6: Commit**

```bash
git add packages/examples/
git commit -m "docs(examples): add reference examples package"
```

---

## Phase 7: Cleanup and Final Migration

### Task 7.1: Update Root and Clean Up

**Step 1: Move old src/ to src-legacy/ (for reference during migration)**

```bash
mv src src-legacy
```

**Step 2: Test full build**

```bash
bun install
bun run make
```

**Step 3: Verify all packages built**

```bash
ls packages/*/dist/
```

**Step 4: Final commit**

```bash
git add .
git commit -m "chore: complete monorepo migration"
```

**Step 5: Remove src-legacy after verification**

```bash
rm -rf src-legacy
git add -A && git commit -m "chore: remove legacy source"
```

---

## Summary

| Package                 | Purpose                         | Published    |
| ----------------------- | ------------------------------- | ------------ |
| `@owo/config`           | Shared schema + loader          | Yes          |
| `@owo/keyword-detector` | Config-driven keyword detection | Yes          |
| `@owo/prompt-injector`  | Config-driven prompt injection  | Yes          |
| `@owo/orchestration`    | Background tasks + toasts       | Yes          |
| `@owo/examples`         | Reference examples              | No (private) |

**Build order (handled by Turbo):** config -> keyword-detector, prompt-injector, orchestration (parallel)

**User installation options:**

- `bun add @owo/keyword-detector` - Just keyword detection
- `bun add @owo/prompt-injector` - Just prompt injection
- `bun add @owo/orchestration` - Just background tasks
- Mix and match as needed!

**Example owo.json config:**

```json
{
  "$schema": "https://owo.dev/schema.json",
  "keywords": {
    "patterns": [
      {
        "type": "ultrawork",
        "pattern": "\\b(ultrawork|ulw)\\b",
        "context": { "file": "./prompts/ultrawork.txt" },
        "toast": {
          "title": "Ultrawork Mode",
          "message": "Maximum precision engaged"
        }
      }
    ]
  },
  "prompts": {
    "agents": {
      "build": {
        "flair": { "file": "./prompts/kaomoji.txt" },
        "sections": ["skills", "delegation"]
      },
      "plan": {
        "flair": "Be strategic and thorough!",
        "sections": ["planning", "delegation"]
      }
    },
    "templates": {
      "skills": { "file": "./prompts/skills.txt" },
      "delegation": "Use subagents for complex tasks...",
      "planning": { "file": "./prompts/planning.txt" }
    }
  },
  "orchestration": {
    "toasts": true
  }
}
```

# AGENTS

OwO - OpenCode modular plugin monorepo. TypeScript + Bun, ESM, strict mode.
Plugins should be customizable and reusable.

## Quick Reference

| Item            | Value                                        |
| --------------- | -------------------------------------------- |
| Runtime         | Bun (builds/scripts), Node APIs where needed |
| Language        | TypeScript (strict mode)                     |
| Module          | ESM (`"type": "module"`)                     |
| Formatter       | oxfmt (semicolons disabled)                  |
| Linter          | oxlint                                       |
| Build           | Bun + tsgo for declarations                  |
| Package Manager | Bun 1.3.6 with workspaces                    |

## Commands

```bash
# Install
bun install

# Build (root plugin)
bun run build

# Build all packages
bun run make           # or: turbo run make

# Typecheck
bun run compile      # uses tsgo --noEmit

# Lint
bun run lint           # oxlint

# Format
bun run format         # oxfmt

# Clean
bun run clean          # removes dist/ via turbo
```

## Tests

```bash
# Run single test file
bun test packages/prompt-injector/test/prompt-injector.test.ts

# Run all tests in a package
bun test packages/prompt-injector/

# Run with watch mode
bun test --watch packages/prompt-injector/
```

Test files use `bun:test` with `expect` and `test` imports:

```typescript
import { expect, test } from "bun:test"
```

## Repository Structure

```
packages/
  config/           # Shared Zod schemas and config loader
  orchestration/    # Background task manager, toast notifications
  prompt-injector/  # Agent prompt customization
  keyword-detector/ # Keyword-triggered context injection
  examples/         # Example configurations
  archive/          # Legacy code (reference only)
```

Root `dist/` contains the main plugin entry (`dist/index.js`).

## Code Style

### Formatting (oxfmt)

- No semicolons
- Double quotes for strings
- Two-space indentation
- Trailing commas (applied by oxfmt)

### Imports

```typescript
// Type-only imports use `import type`
import type { Plugin } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"

// External deps before local
import { z } from "zod"
import { loadConfig } from "@owo/config"
import { BackgroundManager } from "./background-manager"
```

### Types and Zod

- Use Zod for runtime validation in config schemas
- Derive TypeScript types with `z.infer<typeof Schema>`
- Use `type` for unions/derived types, `interface` for extendable shapes

```typescript
export const ToastConfigSchema = z.object({
  title: z.string(),
  message: z.string(),
})
export type ToastConfig = z.infer<typeof ToastConfigSchema>
```

### Naming

- `camelCase` for variables/functions
- `PascalCase` for classes/types/components
- `UPPER_SNAKE` for constants
- `kebab-case` for file/folder names

### Error Handling

```typescript
try {
  configResult = loadConfig(ctx.directory)
} catch (err) {
  const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err)
  console.error(`[owo/orchestration] Failed to load config: ${errorMessage}`)
  throw err
}
```

### Async Patterns

- Prefer `async/await` over raw Promises
- Fire-and-forget calls must catch errors: `.catch(() => {})`
- Don't block on background tasks unless results are needed

### Exports

- Plugin files default-export the plugin
- Type exports are fine alongside default export
- Index files are thin re-export layers

## Plugin Patterns

Plugins implement the `Plugin` type from `@opencode-ai/plugin`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

const MyPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      /* tool definitions */
    },
    event: async ({ event }) => {
      /* event handlers */
    },
  }
}
export default MyPlugin
```

## Package Scripts

Each package in `packages/` has:

```bash
bun run make      # Build with externals
bun run compile   # Generate .d.ts only
bun run clean     # Remove dist/
```

## Config System

Config is loaded from `~/.config/opencode/owo.json` or `.opencode/owo.json`:

```typescript
import { loadConfig } from "@owo/config"
const { config, configDir } = loadConfig(ctx.directory)
```

Keep Zod schemas (`packages/config/src/schema.ts`) aligned with JSON schema.

## Verification Checklist

Before committing:

```bash
bun run lint       # Check for lint errors
bun run typecheck  # Verify types compile
bun run build      # Ensure build succeeds
```

## Constraints

- Don't export runtime symbols from root `index.ts` (types only)
- Prefer editing existing files over creating new ones
- Keep plugin entry files focused on wiring, logic in modules
- Use existing helpers/hooks before introducing new patterns
- Run `bun run format` after edits

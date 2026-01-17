# AGENTS

OwO (Zenox) OpenCode plugin. TypeScript + Bun, ESM, strict TS.

## Quick Facts

- Runtime: Bun for builds/scripts; Node APIs used where needed.
- Language: TypeScript with strict mode.
- Module system: ESM (`type: "module"` in `package.json`).
- Formatter/Lint: oxfmt (see `.oxfmtrc.json`, semicolons disabled).
- Build output: `dist/` and `dist/cli/`.
- Binary: `zenox` (built from `src/cli/index.ts`).

## Commands

- Install deps: `bun install` (bunfig sets exact=true).
- Build: `bun run build` (bun build for src and CLI, then `tsc --emitDeclarationOnly`).
- Clean: `bun run clean` (removes `dist/`).
- Prepublish: `bun run prepublishOnly` (clean + build).
- Typecheck: `bun run typecheck` (tsgo --noEmit).
- Lint: `bun run lint` (oxfmt).
- Format: `bun run format` (oxfmt).

## Tests

- No test script or test files are present in this repo.
- If tests are added, document a `bun test <path>` or script-based single-test command here.

## Repo Layout

- `src/index.ts`: main plugin entry; default export must be the plugin.
- `src/cli/`: CLI entry and subcommands (commander).
- `src/agents/`: subagent configs and prompts.
- `src/tools/`: tool implementations for session and code intelligence.
- `src/hooks/`: runtime hooks (auto-update, todo enforcer, keyword detection).
- `src/mcp/`: MCP server definitions and types.
- `src/config/`: config schema and loader.
- `schema.json`: JSON schema for Zenox config.

## Code Style

### Formatting

- Use oxfmt; keep semicolons off.
- Two-space indentation, trailing commas where oxfmt applies them.
- Use double quotes for strings.
- Prefer `const`; use `let` only when reassigned.

### Imports

- Prefer `import type` for type-only imports.
- Group imports at top of file; keep external before local.
- Use explicit relative paths; no path aliases are configured.

### Types and Zod

- Use Zod for runtime validation in config (`src/config/schema.ts`).
- Prefer `type` aliases for unions/derived types; use `interface` for object shapes meant to be extended.
- Keep public types exported from index files.
- Align Zod schemas with JSON schema in `schema.json`.

### Naming

- camelCase for variables/functions, PascalCase for classes/types.
- UPPER_SNAKE for constants (e.g., `PACKAGE_NAME`, `DEFAULT_MODELS`).
- File and folder names are kebab-case when multiword (e.g., `ui-planner`, `todo-enforcer`).

### Error Handling

- Use try/catch for IO and client calls; surface friendly messages.
- Normalize errors with `err instanceof Error ? err.message : String(err)`.
- CLI commands exit with `process.exit(1)` on fatal errors.
- When retrying API calls, explicitly handle known error signatures.

### Async and Promises

- Prefer async/await; avoid unhandled promises.
- Fire-and-forget calls should catch and ignore errors explicitly.
- Use `Promise` only when concurrency is required.
- Do not block on background tasks unless results are required.

### Exports

- `src/index.ts` must only default-export the plugin; avoid extra runtime exports.
- Type exports from `src/index.ts` are acceptable.
- Keep index files as thin re-export layers.

### Comments

- Use concise docblocks for module-level intent and non-obvious logic.
- Avoid commentary that duplicates the code.

## Plugin/CLI Patterns

- CLI uses `commander` with `.command().description().action()` pattern.
- Prompts use `@clack/prompts` and `picocolors` for colorized output.
- Config discovery uses `findConfigFile` and writes to `~/.config/opencode/zenox.json` or `.opencode/zenox.json`.
- Use `BackgroundManager` to launch background tasks and route completion notifications.
- Tool definitions follow `tool({ description, args, execute })` from `@opencode-ai/plugin`.
- For tool args, use `tool.schema` types and return plain strings or JSON strings.

## Config and Schema

- Keep `schema.json` aligned with `src/config/schema.ts`.
- When adding new config fields, update both Zod and JSON schema.
- Validate external config via `ZenoxConfigSchema.safeParse` and log validation issues.
- Preserve user config precedence: user config first, then project override.

## Logging and Output

- CLI output should be concise and user-facing; avoid debug noise.
- Use `console.warn` for recoverable issues and `console.error` for fatal errors.
- Toast notifications are handled in `src/features/task-toast/manager.ts`.

## MCP Servers

- Built-in MCPs are defined in `src/mcp/` and injected in `src/index.ts`.
- Keep MCP names synced with `McpNameSchema` and `MCP_SERVERS` in `src/cli/constants.ts`.
- When adding a MCP, update CLI pickers, schemas, and docs.

## Adding Features

- Reuse existing helpers and hooks before introducing new patterns.
- Keep the plugin entry (`src/index.ts`) focused on wiring; place logic in modules.
- Maintain strict TypeScript types for SDK responses and tool results.
- Prefer small, composable functions over large monoliths.

## Cursor/Copilot Rules

- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` files found.

## Single-File Guidance

- For small changes, prefer editing existing modules rather than adding new files.
- When adding a new CLI command, include help text and error handling consistent with other commands.
- When adding a new tool, document its args and return format clearly.

## Build Outputs

- `dist/index.js` and `dist/index.d.ts` are published entry points.
- CLI output is built into `dist/cli/index.js`.
- Keep `dist/` out of source edits; it is generated.

## Dependencies

- Runtime deps: @opencode-ai/plugin, @opencode-ai/sdk, commander, zod, picocolors.
- Dev deps: oxfmt, oxlint, bun-types, @typescript/native-preview.

## Constraints for Agents

- Keep changes consistent with existing patterns and formatting.
- Avoid introducing new lint/format tools unless requested.
- Do not add tests without a clear request; document new test commands if you do.
- Avoid exporting new runtime symbols from `src/index.ts`.

## Verification

- Run `bun run lint` and `bun run typecheck` when changing TypeScript logic.
- Run `bun run build` before publishing or verifying dist output.
- Use `bun run clean` if you need a clean build output.

## Notes

- This repo is a plugin; runtime behavior depends on OpenCode and the SDK.
- Only expose supported agent names and MCP names as defined in schemas.
- Keep README examples accurate when CLI behavior changes.

## Contributing Checklist

- Update `package.json` scripts only if necessary; keep `build` and `typecheck` consistent with the toolchain.
- Keep agent definitions in `src/agents/` and export them from `src/agents/index.ts`.
- Keep public API types re-exported from `src/index.ts`.

## Formatting Reminder

- Run `bun run format` after edits; oxfmt enforces semicolon-free style.

## End

- Keep this file updated when build, lint, or test commands change.

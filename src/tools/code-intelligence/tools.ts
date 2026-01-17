/**
 * Code Intelligence Tools
 *
 * Tools for understanding code structure via LSP:
 * - find_symbols: Search workspace symbols by name
 * - lsp_status: Check LSP server health
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient, Symbol as SdkSymbol, LspStatus } from "@opencode-ai/sdk"

export type CodeIntelligenceTools = {
  [key: string]: ToolDefinition
}

// LSP Symbol Kinds (from LSP spec)
const SYMBOL_KINDS: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
}

export function createCodeIntelligenceTools(client: OpencodeClient): CodeIntelligenceTools {
  const findSymbols = tool({
    description: `Search for functions, classes, variables, and other symbols by name.
Use to find where something is defined or to understand code structure.
Returns symbol name, type (function/class/etc), file path, and location.`,
    args: {
      query: tool.schema
        .string()
        .describe("Symbol name or pattern to search (e.g., 'handleAuth', 'User')"),
    },
    async execute(args) {
      try {
        const result = await client.find.symbols({
          query: { query: args.query },
        })
        const symbols = (result.data ?? []) as SdkSymbol[]

        if (symbols.length === 0) {
          return `No symbols found matching "${args.query}"`
        }

        const formatted = symbols.map((s) => {
          // Extract file path from URI (remove file:// prefix if present)
          const uri = s.location?.uri ?? ""
          const path = uri.startsWith("file://") ? uri.slice(7) : uri

          return {
            name: s.name,
            kind: SYMBOL_KINDS[s.kind] ?? `Unknown(${s.kind})`,
            path,
            location: s.location?.range ? `line ${s.location.range.start.line + 1}` : "unknown",
          }
        })

        return JSON.stringify(formatted, null, 2)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error"
        return `Failed to search symbols: ${errorMsg}`
      }
    },
  })

  const lspStatus = tool({
    description: `Get the status of language servers (LSP).
Use to check if code intelligence is available for the current project's languages.
Shows which LSP servers are running and their status.`,
    args: {},
    async execute() {
      try {
        const result = await client.lsp.status()
        const servers = (result.data ?? []) as LspStatus[]

        if (servers.length === 0) {
          return "No LSP servers currently running."
        }

        const formatted = servers.map((s) => ({
          name: s.name ?? s.id,
          status: s.status,
          root: s.root,
        }))

        return JSON.stringify(formatted, null, 2)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error"
        return `Failed to get LSP status: ${errorMsg}`
      }
    },
  })

  return {
    find_symbols: findSymbols,
    lsp_status: lspStatus,
  }
}

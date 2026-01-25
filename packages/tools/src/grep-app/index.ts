import type { ToolFactoryContext, GrepAppToolConfig } from "../types"
import { createGrepAppTools } from "./tools"

export function loadGrepAppTools(
  config: GrepAppToolConfig,
  _factoryCtx: ToolFactoryContext,
): Record<string, any> | null {
  if (!config.enabled) {
    return null
  }
  // No API key needed! Just return the tools
  return createGrepAppTools(config)
}

export { createGrepAppTools }

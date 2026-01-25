import type { ToolFactoryContext, Context7ToolConfig } from "../types"
import { createContext7Tools } from "./tools"

const ENV_KEY = "CONTEXT7_API_KEY"

export function loadContext7Tools(
  config: Context7ToolConfig,
  factoryCtx: ToolFactoryContext,
): Record<string, any> | null {
  if (!config.enabled) {
    return null
  }

  const apiKey = config.key || process.env[ENV_KEY]
  if (!apiKey) {
    factoryCtx
      .showToast(
        "Context7: Missing API Key",
        `Set ${ENV_KEY} environment variable to enable Context7 tools.`,
      )
      .catch(() => {})
    return null
  }

  return createContext7Tools(config)
}

export { createContext7Tools }

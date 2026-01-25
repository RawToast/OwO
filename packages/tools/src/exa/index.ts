import type { ToolFactoryContext, ExaToolConfig } from "../types"
import { createExaTools } from "./tools"

const ENV_KEY = "EXA_API_KEY"

export function loadExaTools(
  config: ExaToolConfig,
  factoryCtx: ToolFactoryContext,
): Record<string, any> | null {
  if (!config.enabled) {
    return null
  }

  const apiKey = config.key || process.env[ENV_KEY]
  if (!apiKey) {
    factoryCtx
      .showToast("Exa: Missing API Key", `Set ${ENV_KEY} environment variable to enable Exa tools.`)
      .catch(() => {})
    return null
  }

  return createExaTools(config)
}

export { createExaTools }

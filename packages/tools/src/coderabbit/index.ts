import type { ToolFactoryContext, CodeRabbitToolConfig } from "../types"
import { createCodeRabbitTools } from "./tools"

const ENV_KEY = "CODERABBIT_API_KEY"

export function loadCodeRabbitTools(
  config: CodeRabbitToolConfig,
  factoryCtx: ToolFactoryContext,
): Record<string, any> | null {
  if (!config.enabled) {
    return null
  }

  const apiKey = config.key || process.env[ENV_KEY]
  if (!apiKey) {
    factoryCtx
      .showToast(
        "CodeRabbit: Missing API Key",
        `Set ${ENV_KEY} environment variable to enable CodeRabbit tools.`,
      )
      .catch(() => {})
    return null
  }

  return createCodeRabbitTools(config)
}

export { createCodeRabbitTools }

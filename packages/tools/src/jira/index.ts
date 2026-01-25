import type { ToolFactoryContext, JiraToolConfig } from "../types"
import { createJiraTools } from "./tools"

const ENV_KEY = "JIRA_API_TOKEN"

export function loadJiraTools(
  config: JiraToolConfig,
  factoryCtx: ToolFactoryContext,
): Record<string, any> | null {
  if (!config.enabled) {
    return null
  }

  const apiToken = config.key || process.env[ENV_KEY]
  if (!apiToken) {
    factoryCtx
      .showToast(
        "Jira: Missing API Token",
        `Set ${ENV_KEY} environment variable to enable Jira tools.`,
      )
      .catch(() => {})
    return null
  }

  if (!config.cloudId || !config.email) {
    factoryCtx
      .showToast("Jira: Missing Config", "Set cloudId and email in owo.json tools.jira config.")
      .catch(() => {})
    return null
  }

  return createJiraTools({ ...config, apiToken })
}

export { createJiraTools }

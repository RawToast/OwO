import type { PromptInjectorConfig } from "@owo/config"
import { resolveContext } from "@owo/config"

/**
 * Resolves context items for an agent
 */
export function resolveAgentContext(
  agent: string | undefined,
  config: PromptInjectorConfig | undefined,
  configDir: string,
): string[] {
  if (!config?.enabled) return []
  if (!agent || !config.agents?.[agent]) return []

  const agentConfig = config.agents[agent]
  const contextItems = agentConfig.context ?? []

  return contextItems.map((item) => resolveContext(item, configDir)).filter((s) => s.length > 0)
}

/**
 * Builds the complete prompt for an agent
 */
export function buildPrompt(
  agent: string | undefined,
  config: PromptInjectorConfig | undefined,
  configDir: string,
): string | undefined {
  const parts = resolveAgentContext(agent, config, configDir)
  return parts.length > 0 ? parts.join("\n\n") : undefined
}

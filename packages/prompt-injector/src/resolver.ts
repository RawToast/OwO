import type { PromptInjectorConfig } from "@owo/config"
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

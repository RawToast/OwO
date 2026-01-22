import * as p from "@clack/prompts"
import pc from "picocolors"
import { findConfigFile, readConfig } from "./config-manager"
import {
  readZenoxConfig,
  updateAgentModels,
  getCurrentModels,
  getZenoxConfigPath,
} from "./owo-config"
import { extractUserModels, selectAgentsToReconfigure, pickModelForAgent } from "./model-picker"
import { PACKAGE_NAME, AGENTS, DEFAULT_MODELS } from "./constants"
import type { AgentName } from "./constants"
import type { UserModelInfo } from "./types"

export async function runConfig(): Promise<void> {
  p.intro(pc.cyan(`${PACKAGE_NAME} model configurator`))

  const cwd = process.cwd()

  // Try to read opencode.json for user's custom models
  let userModels: UserModelInfo[] = []
  const configFile = findConfigFile(cwd)
  if (configFile) {
    try {
      const { config } = await readConfig(configFile.path)
      userModels = extractUserModels(config)
    } catch {
      // Ignore errors, just won't have user models
    }
  }

  // Read current zenox config
  const zenoxConfig = await readZenoxConfig()
  const currentModels = getCurrentModels(zenoxConfig)

  // Show current configuration
  p.log.info("Current model configuration:")
  for (const agent of AGENTS) {
    const model = currentModels[agent.name] ?? agent.defaultModel
    const isCustom = currentModels[agent.name] !== undefined
    const suffix = isCustom ? pc.yellow(" (custom)") : pc.dim(" (default)")
    p.log.message(`  ${agent.displayName}: ${model}${suffix}`)
  }

  // Select which agents to configure
  const selectedAgents = await selectAgentsToReconfigure(currentModels)

  if (selectedAgents === null) {
    p.cancel("Configuration cancelled")
    process.exit(0)
  }

  if (selectedAgents.length === 0) {
    p.log.warn("No agents selected")
    p.outro(pc.yellow("No changes made"))
    return
  }

  // Pick models for selected agents
  const newModels: Partial<Record<AgentName, string>> = {}

  for (const agentName of selectedAgents) {
    const agent = AGENTS.find((a) => a.name === agentName)!
    const current = currentModels[agentName]
    const model = await pickModelForAgent(agent, userModels, current)

    if (model === null) {
      p.cancel("Configuration cancelled")
      process.exit(0)
    }

    // Only store if different from default
    if (model !== agent.defaultModel) {
      newModels[agentName] = model
    } else {
      // If user selected default, we need to track this to potentially remove custom setting
      newModels[agentName] = model
    }
  }

  // Merge with existing config, removing defaults
  const finalModels: Partial<Record<AgentName, string>> = {}

  // Keep existing custom models for agents not reconfigured
  for (const [agent, model] of Object.entries(currentModels)) {
    if (!selectedAgents.includes(agent as AgentName)) {
      finalModels[agent as AgentName] = model
    }
  }

  // Add newly configured models (only non-defaults)
  for (const [agent, model] of Object.entries(newModels)) {
    if (model !== DEFAULT_MODELS[agent as AgentName]) {
      finalModels[agent as AgentName] = model
    }
  }

  const spinner = p.spinner()
  spinner.start("Saving model configuration")

  try {
    await updateAgentModels(finalModels)
    if (Object.keys(finalModels).length > 0) {
      spinner.stop(`Updated ${getZenoxConfigPath()}`)
    } else {
      spinner.stop("All agents using default models")
    }
  } catch (err) {
    spinner.stop("Failed to save config")
    p.log.error(err instanceof Error ? err.message : "Unknown error")
    process.exit(1)
  }

  p.outro(pc.green("Configuration updated!"))
}

import * as p from "@clack/prompts"
import pc from "picocolors"
import type { OpencodeConfig, UserModelInfo, ProviderConfig, ModelConfig } from "./types"
import type { AgentName, AgentInfo } from "./constants"
import { AGENTS } from "./constants"

const CUSTOM_MODEL_OPTION = "__custom__"

function formatModelName(modelId: string): string {
  return modelId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function extractUserModels(config: OpencodeConfig): UserModelInfo[] {
  const models: Map<string, UserModelInfo> = new Map()

  // 1. Extract from provider.*.models (with provider prefix)
  const provider = config.provider
  if (provider) {
    for (const [providerName, providerConfig] of Object.entries(provider)) {
      if (!providerConfig || typeof providerConfig !== "object") continue
      const providerModels = (providerConfig as ProviderConfig).models
      if (!providerModels) continue

      for (const [modelId, modelConfig] of Object.entries(providerModels)) {
        const fullId = `${providerName}/${modelId}`
        const cfg = modelConfig as ModelConfig | undefined
        models.set(fullId, {
          id: fullId,
          displayName: cfg?.name ?? formatModelName(modelId),
          provider: providerName,
        })
      }
    }
  }

  // 2. Extract from top-level "model"
  if (config.model && typeof config.model === "string" && config.model.includes("/")) {
    const [providerName, modelId] = config.model.split("/")
    if (!models.has(config.model)) {
      models.set(config.model, {
        id: config.model,
        displayName: formatModelName(modelId),
        provider: providerName,
      })
    }
  }

  // 3. Extract from top-level "small_model"
  if (
    config.small_model &&
    typeof config.small_model === "string" &&
    config.small_model.includes("/")
  ) {
    const [providerName, modelId] = config.small_model.split("/")
    if (!models.has(config.small_model)) {
      models.set(config.small_model, {
        id: config.small_model,
        displayName: formatModelName(modelId),
        provider: providerName,
      })
    }
  }

  return Array.from(models.values()).sort((a, b) => a.id.localeCompare(b.id))
}

interface ModelOption {
  value: string
  label: string
  hint?: string
}

function buildModelOptions(
  agent: AgentInfo,
  userModels: UserModelInfo[],
  currentModel?: string,
): ModelOption[] {
  const options: ModelOption[] = []
  const userModelIds = userModels.map((m) => m.id)

  // 1. Recommended default
  const isDefault = !currentModel || currentModel === agent.defaultModel
  options.push({
    value: agent.defaultModel,
    label: `${agent.defaultModel}${isDefault ? " (Current)" : ""}`,
    hint: "Recommended - Default",
  })

  // 2. User's custom models from their config with display names
  for (const model of userModels) {
    if (model.id === agent.defaultModel) continue
    const isCurrent = currentModel === model.id
    options.push({
      value: model.id,
      label: `${model.id}${isCurrent ? " (Current)" : ""}`,
      hint: `${model.displayName} • Your config`,
    })
  }

  // 3. Current model if not in above options
  if (currentModel && currentModel !== agent.defaultModel && !userModelIds.includes(currentModel)) {
    options.push({
      value: currentModel,
      label: `${currentModel} (Current)`,
      hint: "Custom",
    })
  }

  // 4. Custom input option
  options.push({
    value: CUSTOM_MODEL_OPTION,
    label: "Enter custom model name",
    hint: "Get names from models.dev",
  })

  return options
}

export async function pickModelForAgent(
  agent: AgentInfo,
  userModels: UserModelInfo[],
  currentModel?: string,
): Promise<string | null> {
  // Show agent info clearly before selection
  p.note(
    `${pc.bold(agent.description)}\n${pc.dim(`Default: ${agent.defaultModel}`)}`,
    agent.displayName,
  )

  const options = buildModelOptions(agent, userModels, currentModel)

  const selected = await p.select({
    message: "Select model:",
    options,
  })

  if (p.isCancel(selected)) return null

  if (selected === CUSTOM_MODEL_OPTION) {
    const customModel = await p.text({
      message: "Enter custom model name:",
      placeholder: "e.g., anthropic/claude-sonnet-4 (see models.dev)",
      validate: (value) => {
        if (!value.trim()) return "Model name is required"
        if (!value.includes("/")) return "Model should be in format: provider/model-name"
        return undefined
      },
    })

    if (p.isCancel(customModel)) return null
    return customModel as string
  }

  return selected as string
}

export async function pickModelsForAllAgents(
  userModels: UserModelInfo[],
  currentModels: Partial<Record<AgentName, string>>,
): Promise<Partial<Record<AgentName, string>> | null> {
  const result: Partial<Record<AgentName, string>> = {}

  for (const agent of AGENTS) {
    const current = currentModels[agent.name]
    const model = await pickModelForAgent(agent, userModels, current)

    if (model === null) return null // User cancelled

    // Only store if different from default
    if (model !== agent.defaultModel) {
      result[agent.name] = model
    }
  }

  return result
}

export async function askConfigureModels(): Promise<"defaults" | "customize" | null> {
  const result = await p.select({
    message: "Configure sub-agent models?",
    options: [
      {
        value: "defaults",
        label: "Use recommended defaults",
        hint: "No config file needed",
      },
      {
        value: "customize",
        label: "Customize models",
        hint: "Choose models for each agent",
      },
    ],
  })

  if (p.isCancel(result)) return null
  return result as "defaults" | "customize"
}

export async function selectAgentsToReconfigure(
  currentModels: Partial<Record<AgentName, string>>,
): Promise<AgentName[] | null> {
  const options = AGENTS.map((agent) => {
    const current = currentModels[agent.name] ?? agent.defaultModel
    return {
      value: agent.name,
      label: agent.displayName,
      hint: `current: ${current}`,
    }
  })

  const selected = await p.multiselect({
    message: "Which agents to configure?",
    options,
    required: true,
  })

  if (p.isCancel(selected)) return null
  return selected as AgentName[]
}

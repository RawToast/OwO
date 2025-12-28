/**
 * ayush-opencode - Custom OpenCode Plugin
 *
 * This plugin provides:
 * 1. Custom subagents: explorer, librarian, oracle, ui-planner
 * 2. Orchestration injection into Build/Plan agents for better delegation
 * 3. Auto-loaded MCP servers: exa, grep_app, sequential-thinking
 * 4. Optional configuration via ayush-opencode.json for model/MCP overrides
 */

import type { Plugin } from "@opencode-ai/plugin"
import type { AgentConfig } from "@opencode-ai/sdk"
import {
  explorerAgent,
  librarianAgent,
  oracleAgent,
  uiPlannerAgent,
} from "./agents"
import { ORCHESTRATION_PROMPT } from "./orchestration/prompt"
import { loadPluginConfig, type AgentName } from "./config"
import { createBuiltinMcps } from "./mcp"

const AyushOpenCodePlugin: Plugin = async (ctx) => {
  // Load user/project configuration
  const pluginConfig = loadPluginConfig(ctx.directory)
  const disabledAgents = new Set(pluginConfig.disabled_agents ?? [])
  const disabledMcps = pluginConfig.disabled_mcps ?? []

  // Helper to apply model override from config
  const applyModelOverride = (
    agentName: AgentName,
    baseAgent: AgentConfig
  ): AgentConfig => {
    const override = pluginConfig.agents?.[agentName]
    if (override?.model) {
      return { ...baseAgent, model: override.model }
    }
    return baseAgent
  }

  return {
    config: async (config) => {
      // Initialize agent config if not present
      config.agent = config.agent ?? {}

      // Register custom subagents (unless disabled)
      if (!disabledAgents.has("explorer")) {
        config.agent.explorer = applyModelOverride("explorer", explorerAgent)
      }

      if (!disabledAgents.has("librarian")) {
        config.agent.librarian = applyModelOverride("librarian", librarianAgent)
      }

      if (!disabledAgents.has("oracle")) {
        config.agent.oracle = applyModelOverride("oracle", oracleAgent)
      }

      if (!disabledAgents.has("ui-planner")) {
        config.agent["ui-planner"] = applyModelOverride("ui-planner", uiPlannerAgent)
      }

      // Inject orchestration into Build agent (append to existing prompt)
      if (config.agent.build) {
        const existingPrompt = config.agent.build.prompt ?? ""
        config.agent.build.prompt = existingPrompt + ORCHESTRATION_PROMPT
      }

      // Inject orchestration into Plan agent (append to existing prompt)
      if (config.agent.plan) {
        const existingPrompt = config.agent.plan.prompt ?? ""
        config.agent.plan.prompt = existingPrompt + ORCHESTRATION_PROMPT
      }

      // Inject MCP servers (our MCPs win over user's conflicting MCPs)
      // User's other MCPs are preserved
      const builtinMcps = createBuiltinMcps(disabledMcps)
      config.mcp = {
        ...config.mcp,    // User's existing MCPs (preserved)
        ...builtinMcps,   // Our MCPs (overwrites conflicts)
      }
    },
  }
}

// Default export for OpenCode plugin system
export default AyushOpenCodePlugin

// NOTE: Do NOT export functions from main index.ts!
// OpenCode treats ALL exports as plugin instances and calls them.
// Only export types for external usage.
export type {
  BuiltinAgentName,
  AgentOverrideConfig,
  AgentOverrides,
} from "./agents"

export type {
  AyushOpenCodeConfig,
  AgentName,
} from "./config"

export type { McpName } from "./mcp"

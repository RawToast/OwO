/**
 * @owo/tools
 *
 * API-based tools for OpenCode: exa, context7, jira, coderabbit.
 * Tools are disabled by default - enable via owo.json config.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "@owo/config"
import type { ToolsConfig, ToolFactoryContext } from "./types"
import { loadExaTools } from "./exa"
import { loadContext7Tools } from "./context7"
import { loadJiraTools } from "./jira"
import { loadCodeRabbitTools } from "./coderabbit"
import { loadGrepAppTools } from "./grep-app"

const ToolsPlugin: Plugin = async (ctx) => {
  let configResult
  try {
    configResult = loadConfig(ctx.directory)
  } catch (err) {
    const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error(`[owo/tools] Failed to load config: ${errorMessage}`)
    throw err
  }

  const { config } = configResult
  const toolsConfig: ToolsConfig = (config as any).tools ?? {}

  // Helper to show toast notifications
  const showToast = async (title: string, message: string) => {
    try {
      await ctx.client.tui.showToast({
        body: { title, message, variant: "warning", duration: 5000 },
      })
    } catch {
      // Silently ignore toast errors
    }
  }

  const factoryCtx: ToolFactoryContext = {
    client: ctx.client,
    showToast,
  }

  // Collect enabled tools
  const tools: Record<string, any> = {}

  // Load Exa tools
  if (toolsConfig.exa) {
    const exaTools = loadExaTools(toolsConfig.exa, factoryCtx)
    if (exaTools) {
      Object.assign(tools, exaTools)
    }
  }

  // Load Context7 tools
  if (toolsConfig.context7) {
    const context7Tools = loadContext7Tools(toolsConfig.context7, factoryCtx)
    if (context7Tools) {
      Object.assign(tools, context7Tools)
    }
  }

  // Load Jira tools
  if (toolsConfig.jira) {
    const jiraTools = loadJiraTools(toolsConfig.jira, factoryCtx)
    if (jiraTools) {
      Object.assign(tools, jiraTools)
    }
  }

  // Load CodeRabbit tools
  if (toolsConfig.coderabbit) {
    const coderabbitTools = loadCodeRabbitTools(toolsConfig.coderabbit, factoryCtx)
    if (coderabbitTools) {
      Object.assign(tools, coderabbitTools)
    }
  }

  // Load grep.app tools
  if (toolsConfig.grep_app) {
    const grepAppTools = loadGrepAppTools(toolsConfig.grep_app, factoryCtx)
    if (grepAppTools) {
      Object.assign(tools, grepAppTools)
    }
  }

  return {
    tool: tools,
  }
}

export default ToolsPlugin
export type {
  ToolsConfig,
  ExaToolConfig,
  Context7ToolConfig,
  JiraToolConfig,
  CodeRabbitToolConfig,
  GrepAppToolConfig,
  ToolFactoryContext,
} from "./types"

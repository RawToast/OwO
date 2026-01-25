import type { PluginInput } from "@opencode-ai/plugin"

/**
 * Base config for tools that only need enabled + optional API key
 */
export interface BaseToolConfig {
  enabled?: boolean
  key?: string
}

/**
 * Exa web search tool config
 */
export interface ExaToolConfig extends BaseToolConfig {}

/**
 * Context7 library docs tool config
 */
export interface Context7ToolConfig extends BaseToolConfig {}

/**
 * Jira issue tracking tool config
 */
export interface JiraToolConfig extends BaseToolConfig {
  cloudId?: string
  email?: string
}

/**
 * CodeRabbit code review tool config
 */
export interface CodeRabbitToolConfig extends BaseToolConfig {}

/**
 * grep.app GitHub code search tool config (no API key needed!)
 */
export interface GrepAppToolConfig {
  enabled?: boolean
}

/**
 * All tools configuration
 */
export interface ToolsConfig {
  exa?: ExaToolConfig
  context7?: Context7ToolConfig
  jira?: JiraToolConfig
  coderabbit?: CodeRabbitToolConfig
  grep_app?: GrepAppToolConfig
}

/**
 * Context passed to tool factories
 */
export interface ToolFactoryContext {
  client: PluginInput["client"]
  showToast: (title: string, message: string) => Promise<void>
}

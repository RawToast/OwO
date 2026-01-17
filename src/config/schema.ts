import { z } from "zod"
import { McpNameSchema } from "../mcp/types"

/**
 * Agent names that can be configured
 */
export const AgentNameSchema = z.enum(["explorer", "librarian", "oracle", "ui-planner"])

export type AgentName = z.infer<typeof AgentNameSchema>

/**
 * Configuration for overriding an agent's settings
 * Supports model and variant overrides for thinking modes
 */
export const AgentOverrideConfigSchema = z.object({
  model: z.string().optional(),
  variant: z.string().optional(),
})

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>

/**
 * Agent overrides mapping
 */
export const AgentOverridesSchema = z.object({
  explorer: AgentOverrideConfigSchema.optional(),
  librarian: AgentOverrideConfigSchema.optional(),
  oracle: AgentOverrideConfigSchema.optional(),
  "ui-planner": AgentOverrideConfigSchema.optional(),
})

export type AgentOverrides = z.infer<typeof AgentOverridesSchema>

/**
 * Tool names that can be configured
 */
export const ToolNameSchema = z.enum(["exa", "context7"])

export type ToolName = z.infer<typeof ToolNameSchema>

/**
 * Configuration for a single tool (Exa or Context7)
 * - enabled: Whether the tool is available (undefined = true)
 * - key: API key (falls back to environment variable if not set)
 */
export const ToolConfigSchema = z.object({
  enabled: z.boolean().optional(),
  key: z.string().optional(),
})

export type ToolConfig = z.infer<typeof ToolConfigSchema>

/**
 * Tools configuration mapping
 */
export const ToolsConfigSchema = z.object({
  exa: ToolConfigSchema.optional(),
  context7: ToolConfigSchema.optional(),
})

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>

/**
 * Main configuration schema for zenox
 */
export const ZenoxConfigSchema = z.object({
  $schema: z.string().optional(),
  agents: AgentOverridesSchema.optional(),
  tools: ToolsConfigSchema.optional(),
  disabled_agents: z.array(AgentNameSchema).optional(),
  disabled_mcps: z.array(McpNameSchema).optional(),
})

export type ZenoxConfig = z.infer<typeof ZenoxConfigSchema>

import { z } from "zod"

/**
 * MCP Server names that can be configured/disabled
 */
export const McpNameSchema = z.enum([
  "exa",
  "grep_app",
  "sequential-thinking",
])

export type McpName = z.infer<typeof McpNameSchema>

/**
 * Local MCP server configuration (spawns a process)
 */
export interface LocalMcpServerConfig {
  type: "local"
  command: string[]
  enabled: boolean
  timeout?: number
}

/**
 * Remote MCP server configuration (connects to URL)
 */
export interface RemoteMcpServerConfig {
  type: "remote"
  url: string
  enabled: boolean
  timeout?: number
}

/**
 * Union type for all MCP server configurations
 */
export type McpServerConfig = LocalMcpServerConfig | RemoteMcpServerConfig

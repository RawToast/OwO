export interface ModelConfig {
  id?: string
  name?: string
  options?: Record<string, unknown>
  variants?: Record<string, unknown>
}

export interface ProviderConfig {
  npm?: string
  name?: string
  options?: Record<string, unknown>
  models?: Record<string, ModelConfig>
}

export interface OpencodeConfig {
  plugins?: string[]
  plugin?: string[] // OpenCode standard (singular)
  model?: string // Default model in provider/model format
  small_model?: string
  provider?: Record<string, ProviderConfig>
  [key: string]: unknown
}

export interface UserModelInfo {
  id: string // Full ID: "anthropic/claude-sonnet-4-5"
  displayName: string // From config or generated
  provider: string // "anthropic", "openai", etc.
}

export interface InstallOptions {
  noTui?: boolean
  configPath?: string
}

export type ConfigFormat = "json" | "jsonc"

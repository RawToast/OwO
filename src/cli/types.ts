export interface OpencodeConfig {
  plugins?: string[]
  [key: string]: unknown
}

export interface InstallOptions {
  noTui?: boolean
  configPath?: string
}

export type ConfigFormat = "json" | "jsonc"

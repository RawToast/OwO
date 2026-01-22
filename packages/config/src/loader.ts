import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, isAbsolute } from "node:path"
import stripJsonComments from "strip-json-comments"
import { OwoConfigSchema, type OwoConfig, type Context } from "./schema"

const CONFIG_FILENAMES = ["owo.json"]

/**
 * Find config file in standard locations
 * Priority: project dir > ~/.config/opencode/ > home dir
 */
export function findConfigFile(projectDir?: string): string | undefined {
  const searchPaths: string[] = []

  // Project directory first
  if (projectDir) {
    for (const filename of CONFIG_FILENAMES) {
      searchPaths.push(join(projectDir, filename))
      searchPaths.push(join(projectDir, ".opencode", filename))
    }
  }

  // User config directory
  const configDir = join(homedir(), ".config", "opencode")
  for (const filename of CONFIG_FILENAMES) {
    searchPaths.push(join(configDir, filename))
  }

  // Home directory
  for (const filename of CONFIG_FILENAMES) {
    searchPaths.push(join(homedir(), filename))
  }

  for (const path of searchPaths) {
    if (existsSync(path)) {
      return path
    }
  }

  return undefined
}

/**
 * Resolve context - either inline string or load from file
 */
export function resolveContext(context: Context, configDir: string): string {
  if (typeof context === "string") {
    return context
  }

  // File reference - resolve path relative to config file
  const filePath = isAbsolute(context.file) ? context.file : join(configDir, context.file)

  try {
    return readFileSync(filePath, "utf-8")
  } catch (err) {
    console.warn(
      `[owo/config] Failed to load context from ${filePath}:`,
      err instanceof Error ? err.message : String(err),
    )
    return ""
  }
}

/**
 * Load and parse config file
 */
export function loadConfig(projectDir?: string): { config: OwoConfig; configDir: string } {
  const configPath = findConfigFile(projectDir)

  if (!configPath) {
    return { config: {}, configDir: projectDir ?? process.cwd() }
  }

  const configDir = dirname(configPath)

  try {
    const content = readFileSync(configPath, "utf-8")
    const json = JSON.parse(stripJsonComments(content))
    const result = OwoConfigSchema.safeParse(json)

    if (!result.success) {
      console.warn(`[owo/config] Invalid config at ${configPath}:`, result.error.message)
      return { config: {}, configDir }
    }

    return { config: result.data, configDir }
  } catch (err) {
    console.warn(
      `[owo/config] Failed to load config from ${configPath}:`,
      err instanceof Error ? err.message : String(err),
    )
    return { config: {}, configDir }
  }
}

/**
 * Get config path for writing
 */
export function getConfigWritePath(): string {
  const configDir = join(homedir(), ".config", "opencode")
  return join(configDir, "owo.json")
}

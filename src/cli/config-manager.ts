import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { OpencodeConfig, ConfigFormat } from "./types"

const PACKAGE_NAME = "zenox"
const CONFIG_FILENAMES = ["opencode.json", "opencode.jsonc"]

export function findConfigFile(directory: string): { path: string; format: ConfigFormat } | null {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = join(directory, filename)
    if (existsSync(configPath)) {
      const format: ConfigFormat = filename.endsWith(".jsonc") ? "jsonc" : "json"
      return { path: configPath, format }
    }
  }
  return null
}

export async function readConfig(configPath: string): Promise<{ content: string; config: OpencodeConfig }> {
  const content = await readFile(configPath, "utf-8")
  // Strip comments for JSONC files
  const jsonContent = content
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
  const config = JSON.parse(jsonContent) as OpencodeConfig
  return { content, config }
}

export function isPluginInstalled(config: OpencodeConfig): boolean {
  const plugins = config.plugins ?? []
  return plugins.some((p) => p === PACKAGE_NAME || p.startsWith(`${PACKAGE_NAME}@`))
}

function addPluginToJsonc(content: string): string {
  // For JSONC, preserve comments by using regex insertion
  const pluginsMatch = content.match(/"plugins"\s*:\s*\[/)

  if (pluginsMatch) {
    const insertIndex = content.indexOf("[", pluginsMatch.index!) + 1
    const beforeBracket = content.slice(0, insertIndex)
    const afterBracket = content.slice(insertIndex)
    const afterTrimmed = afterBracket.trimStart()

    if (afterTrimmed.startsWith("]")) {
      return `${beforeBracket}"${PACKAGE_NAME}"${afterBracket}`
    } else {
      return `${beforeBracket}"${PACKAGE_NAME}", ${afterBracket}`
    }
  } else {
    const openBraceIndex = content.indexOf("{")
    if (openBraceIndex === -1) {
      throw new Error("Invalid JSON: no opening brace found")
    }

    const beforeBrace = content.slice(0, openBraceIndex + 1)
    const afterBrace = content.slice(openBraceIndex + 1)
    const afterTrimmed = afterBrace.trimStart()

    if (afterTrimmed.startsWith("}")) {
      return `${beforeBrace}\n  "plugins": ["${PACKAGE_NAME}"]\n}`
    } else {
      return `${beforeBrace}\n  "plugins": ["${PACKAGE_NAME}"],${afterBrace}`
    }
  }
}

function addPluginToJson(config: OpencodeConfig): string {
  // For plain JSON, use proper parsing to maintain clean formatting
  const newConfig = {
    plugins: [PACKAGE_NAME, ...(config.plugins ?? [])],
    ...Object.fromEntries(
      Object.entries(config).filter(([key]) => key !== "plugins")
    ),
  }
  return JSON.stringify(newConfig, null, 2) + "\n"
}

export async function installPlugin(configPath: string): Promise<void> {
  const { content, config } = await readConfig(configPath)

  if (isPluginInstalled(config)) {
    throw new Error(`${PACKAGE_NAME} is already installed`)
  }

  const isJsonc = configPath.endsWith(".jsonc")
  const newContent = isJsonc ? addPluginToJsonc(content) : addPluginToJson(config)

  await writeFile(configPath, newContent, "utf-8")
}

export function getDefaultConfigPath(directory: string): string {
  return join(directory, "opencode.json")
}

export async function createDefaultConfig(configPath: string): Promise<void> {
  const defaultConfig = {
    plugins: [PACKAGE_NAME],
  }
  await writeFile(configPath, JSON.stringify(defaultConfig, null, 2) + "\n", "utf-8")
}

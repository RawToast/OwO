import * as p from "@clack/prompts"
import pc from "picocolors"
import {
  findConfigFile,
  installPlugin,
  createDefaultConfig,
  getDefaultConfigPath,
  readConfig,
  isPluginInstalled,
} from "./config-manager"
import type { InstallOptions } from "./types"

const PACKAGE_NAME = "zenox"

export async function runInstall(options: InstallOptions = {}): Promise<void> {
  const { noTui = false, configPath: customConfigPath } = options
  const cwd = process.cwd()

  if (noTui) {
    await runNonInteractive(cwd, customConfigPath)
    return
  }

  await runInteractive(cwd, customConfigPath)
}

async function runInteractive(cwd: string, customConfigPath?: string): Promise<void> {
  p.intro(pc.cyan(`${PACKAGE_NAME} installer`))

  const configFile = customConfigPath
    ? { path: customConfigPath, format: "json" as const }
    : findConfigFile(cwd)

  if (!configFile) {
    const shouldCreate = await p.confirm({
      message: "No opencode.json found. Create one?",
      initialValue: true,
    })

    if (p.isCancel(shouldCreate) || !shouldCreate) {
      p.cancel("Installation cancelled")
      process.exit(0)
    }

    const configPath = getDefaultConfigPath(cwd)
    const spinner = p.spinner()
    spinner.start("Creating opencode.json")

    try {
      await createDefaultConfig(configPath)
      spinner.stop("Created opencode.json")
      p.outro(pc.green(`${PACKAGE_NAME} installed successfully!`))
    } catch (err) {
      spinner.stop("Failed to create config")
      p.log.error(err instanceof Error ? err.message : "Unknown error")
      process.exit(1)
    }
    return
  }

  // Config exists - check if already installed
  try {
    const { config } = await readConfig(configFile.path)
    if (isPluginInstalled(config)) {
      p.log.warn(`${PACKAGE_NAME} is already installed in ${configFile.path}`)
      p.outro(pc.yellow("No changes made"))
      return
    }
  } catch (err) {
    p.log.error(`Failed to read config: ${err instanceof Error ? err.message : "Unknown error"}`)
    process.exit(1)
  }

  const shouldInstall = await p.confirm({
    message: `Add ${PACKAGE_NAME} to ${configFile.path}?`,
    initialValue: true,
  })

  if (p.isCancel(shouldInstall) || !shouldInstall) {
    p.cancel("Installation cancelled")
    process.exit(0)
  }

  const spinner = p.spinner()
  spinner.start(`Adding ${PACKAGE_NAME} to plugins`)

  try {
    await installPlugin(configFile.path)
    spinner.stop(`Added ${PACKAGE_NAME} to plugins`)
    p.outro(pc.green(`${PACKAGE_NAME} installed successfully!`))
  } catch (err) {
    spinner.stop("Failed to install")
    p.log.error(err instanceof Error ? err.message : "Unknown error")
    process.exit(1)
  }
}

async function runNonInteractive(cwd: string, customConfigPath?: string): Promise<void> {
  const configFile = customConfigPath
    ? { path: customConfigPath, format: "json" as const }
    : findConfigFile(cwd)

  if (!configFile) {
    console.log(`Creating opencode.json with ${PACKAGE_NAME}...`)
    const configPath = getDefaultConfigPath(cwd)
    await createDefaultConfig(configPath)
    console.log(`Created opencode.json with ${PACKAGE_NAME}`)
    return
  }

  // Check if already installed
  const { config } = await readConfig(configFile.path)
  if (isPluginInstalled(config)) {
    console.log(`${PACKAGE_NAME} is already installed`)
    return
  }

  console.log(`Adding ${PACKAGE_NAME} to ${configFile.path}...`)
  await installPlugin(configFile.path)
  console.log(`${PACKAGE_NAME} installed successfully!`)
}

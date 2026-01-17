import * as p from "@clack/prompts"
import pc from "picocolors"
import {
  readZenoxConfig,
  getDisabledMcps,
  updateDisabledMcps,
  getZenoxConfigPath,
} from "./owo-config"
import { pickMcpsToEnable, showMcpStatus } from "./mcp-picker"
import { PACKAGE_NAME } from "./constants"

export async function runMcp(): Promise<void> {
  p.intro(pc.cyan(`${PACKAGE_NAME} MCP configurator`))

  const zenoxConfig = await readZenoxConfig()
  const currentDisabled = getDisabledMcps(zenoxConfig)

  showMcpStatus(currentDisabled)

  const newDisabled = await pickMcpsToEnable(currentDisabled)

  if (newDisabled === null) {
    p.cancel("Configuration cancelled")
    process.exit(0)
  }

  // Check if anything changed
  const hasChanges =
    newDisabled.length !== currentDisabled.length ||
    newDisabled.some((m) => !currentDisabled.includes(m))

  if (!hasChanges) {
    p.outro(pc.yellow("No changes made"))
    return
  }

  const spinner = p.spinner()
  spinner.start("Saving MCP configuration")

  try {
    await updateDisabledMcps(newDisabled)
    if (newDisabled.length === 0) {
      spinner.stop("All MCPs enabled")
    } else {
      spinner.stop(`Updated ${getZenoxConfigPath()}`)
    }
  } catch (err) {
    spinner.stop("Failed to save config")
    p.log.error(err instanceof Error ? err.message : "Unknown error")
    process.exit(1)
  }

  showMcpStatus(newDisabled)
  p.outro(pc.green("MCP configuration updated!"))
}

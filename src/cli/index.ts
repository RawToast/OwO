#!/usr/bin/env node
import { Command } from "commander"
import { runInstall } from "./install"

const program = new Command()

program
  .name("zenox")
  .description("Zenox - OpenCode plugin for intelligent agent orchestration")
  .version("0.1.0")

program
  .command("install")
  .description("Add zenox to your opencode.json plugins")
  .option("--no-tui", "Run in non-interactive mode")
  .option("-c, --config <path>", "Path to opencode.json")
  .action(async (options: { tui: boolean; config?: string }) => {
    try {
      await runInstall({
        noTui: !options.tui,
        configPath: options.config,
      })
    } catch (err) {
      console.error(err instanceof Error ? err.message : "Unknown error")
      process.exit(1)
    }
  })

program.parse()

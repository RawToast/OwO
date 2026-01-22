import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "@owo/config"
import { buildPrompt, resolveFlair, buildFlairSection, resolvePromptSections } from "./resolver"

export { buildPrompt, resolveFlair, buildFlairSection, resolvePromptSections } from "./resolver"

// Session agent tracking (simple in-memory map)
const sessionAgents = new Map<string, string | undefined>()

const PromptInjectorPlugin: Plugin = async (ctx) => {
  const { config, configDir } = loadConfig(ctx.directory)

  // Check if disabled
  if (config.prompts?.enabled === false) {
    return {}
  }

  return {
    // Track which agent is active per session
    "chat.message": async (
      input: { sessionID: string; agent?: string },
      _output: unknown,
    ): Promise<void> => {
      sessionAgents.set(input.sessionID, input.agent)
    },

    // Inject prompt into system prompt
    "experimental.chat.system.transform": async (
      input: unknown,
      output: { system: string[] },
    ): Promise<void> => {
      const { sessionID } = input as { sessionID?: string }
      if (!sessionID) return

      const agent = sessionAgents.get(sessionID)
      const prompt = buildPrompt(agent, config.prompts, configDir)

      if (prompt) {
        output.system.push(prompt)
      }
    },
  }
}

export default PromptInjectorPlugin

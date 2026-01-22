import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "@owo/config"
import { createKeywordDetectorHook } from "./detector"

export { createKeywordDetectorHook } from "./detector"

const KeywordDetectorPlugin: Plugin = async (ctx) => {
  const { config, configDir } = loadConfig(ctx.directory)
  const hook = createKeywordDetectorHook(ctx, config.keywords, configDir)

  return {
    "chat.message": hook["chat.message"],
  }
}

export default KeywordDetectorPlugin

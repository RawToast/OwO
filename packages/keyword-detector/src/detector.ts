import type { PluginInput } from "@opencode-ai/plugin"
import type { KeywordPattern, KeywordDetectorConfig } from "@owo/config"
import { resolveContext } from "@owo/config"

const TOAST_DURATION = 4000

type MessagePart = {
  type: string
  text?: string
  synthetic?: boolean
}

type ChatMessageOutput = {
  parts: MessagePart[]
  message: Record<string, unknown>
}

type CompiledPattern = {
  type: string
  regex: RegExp
  context: string
  toast: {
    title: string
    message: string
  }
}

function compilePatterns(patterns: KeywordPattern[], configDir: string): CompiledPattern[] {
  return patterns.map((p) => ({
    type: p.type,
    regex: new RegExp(p.pattern, p.flags ?? "i"),
    context: resolveContext(p.context, configDir),
    toast: p.toast,
  }))
}

function extractTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text ?? "")
    .join(" ")
}

function removeCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "")
}

function detectKeywords(text: string, patterns: CompiledPattern[]): CompiledPattern[] {
  const cleanText = removeCodeBlocks(text)
  const detected: CompiledPattern[] = []

  for (const pattern of patterns) {
    if (pattern.regex.test(cleanText)) {
      detected.push(pattern)
    }
  }

  return detected
}

export function createKeywordDetectorHook(
  ctx: PluginInput,
  config: KeywordDetectorConfig | undefined,
  configDir: string,
) {
  // Check if disabled or no patterns
  if (config?.enabled === false) {
    return {}
  }

  const patterns = config?.patterns ?? []
  if (patterns.length === 0) {
    return {}
  }

  // Compile patterns to RegExp (resolving file contexts)
  const compiledPatterns = compilePatterns(patterns, configDir)

  // Track detected sessions to prevent duplicates
  const detectedSessions = new Set<string>()

  return {
    "chat.message": async (
      input: { sessionID: string; agent?: string },
      output: ChatMessageOutput,
    ): Promise<void> => {
      const promptText = extractTextFromParts(output.parts)
      const detectedKeywords = detectKeywords(promptText, compiledPatterns)

      if (detectedKeywords.length === 0) return

      // Prevent duplicate detection in same session
      const sessionKey = `${input.sessionID}-${detectedKeywords.map((k) => k.type).join("-")}`
      if (detectedSessions.has(sessionKey)) return
      detectedSessions.add(sessionKey)

      // Get highest priority keyword (first match)
      const primaryKeyword = detectedKeywords[0]

      // Inject context by appending to existing text part or adding new one
      const textPartIndex = output.parts.findIndex((p) => p.type === "text" && p.text)

      if (textPartIndex >= 0) {
        const existingPart = output.parts[textPartIndex]
        existingPart.text = `${existingPart.text ?? ""}\n\n${primaryKeyword.context}`
      } else {
        output.parts.push({
          type: "text",
          text: primaryKeyword.context,
          synthetic: true,
        })
      }

      // Show toast notification
      await ctx.client.tui
        .showToast({
          body: {
            title: primaryKeyword.toast.title,
            message: primaryKeyword.toast.message,
            variant: "success",
            duration: TOAST_DURATION,
          },
        })
        .catch(() => {})

      // Clean up old session keys periodically
      if (detectedSessions.size > 100) {
        const entries = [...detectedSessions]
        entries.slice(0, 50).forEach((key) => detectedSessions.delete(key))
      }
    },
  }
}

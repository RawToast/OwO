import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { PRReviewConfigSchema, type PRReviewConfig, type ReviewerConfig } from "./types"
import {
  DEFAULT_QUALITY_PROMPT,
  DEFAULT_SECURITY_PROMPT,
  DEFAULT_VERIFIER_PROMPT,
} from "./defaults"

const DEFAULT_REVIEWERS: ReviewerConfig[] = [
  {
    name: "quality",
    prompt: DEFAULT_QUALITY_PROMPT,
    focus: "code quality",
    enabled: true,
  },
  {
    name: "security",
    prompt: DEFAULT_SECURITY_PROMPT,
    focus: "security",
    enabled: true,
  },
]

/**
 * Load PR review configuration
 * Looks for .github/pr-review.json or uses defaults
 */
export function loadConfig(repoRoot: string): PRReviewConfig {
  const configPath = join(repoRoot, ".github", "pr-review.json")

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8")
      const parsed = JSON.parse(content)
      return PRReviewConfigSchema.parse(parsed)
    } catch (err) {
      console.warn(`[pr-review] Failed to load config from ${configPath}:`, err)
      console.warn("[pr-review] Falling back to default configuration")
    }
  }

  return {
    version: 1,
    reviewers: DEFAULT_REVIEWERS,
    verifier: {
      prompt: DEFAULT_VERIFIER_PROMPT,
      enabled: true,
      level: "info",
      diagrams: true,
    },
  }
}

/**
 * Load a reviewer prompt from file or return inline prompt
 */
export function loadReviewerPrompt(repoRoot: string, reviewer: ReviewerConfig): string {
  if (reviewer.promptFile) {
    const promptPath = join(repoRoot, reviewer.promptFile)
    if (existsSync(promptPath)) {
      try {
        return readFileSync(promptPath, "utf-8")
      } catch (err) {
        console.warn(`[pr-review] Failed to load prompt from ${promptPath}:`, err)
      }
    }
  }

  return reviewer.prompt || "Review this code and provide feedback."
}

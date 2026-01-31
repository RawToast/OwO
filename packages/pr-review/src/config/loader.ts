import { readFileSync, existsSync, statSync } from "fs"
import { join, dirname, resolve } from "path"
import { PRReviewConfigSchema, type PRReviewConfig, type ReviewerConfig } from "./types"
import { DEFAULT_COMPREHENSIVE_PROMPT, DEFAULT_VERIFIER_PROMPT } from "./defaults"

const DEFAULT_REVIEWERS: ReviewerConfig[] = [
  {
    name: "comprehensive",
    prompt: DEFAULT_COMPREHENSIVE_PROMPT,
    focus: "code quality, security, and best practices",
    temperature: 0.1,
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
      level: "warning",
      diagrams: true,
    },
    resolution: {
      enabled: true,
      trigger: "first-push",
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

/**
 * Load config from a path (file or directory)
 * Returns both the config and the resolved repoRoot for loading prompt files
 */
export function loadConfigFromPath(configPath?: string): {
  config: PRReviewConfig
  repoRoot: string
} {
  // Default to cwd if no path provided
  if (!configPath) {
    const repoRoot = process.cwd()
    return { config: loadConfig(repoRoot), repoRoot }
  }

  const resolved = resolve(configPath)

  // Check if it's a file or directory
  if (existsSync(resolved)) {
    const stat = statSync(resolved)

    if (stat.isFile()) {
      // Direct config file path
      try {
        const content = readFileSync(resolved, "utf-8")
        const parsed = JSON.parse(content)
        const config = PRReviewConfigSchema.parse(parsed)
        // repoRoot is the directory containing the config file's parent
        // e.g., /foo/bar/.github/pr-review.json -> /foo/bar
        const repoRoot = dirname(dirname(resolved))
        console.log(`[pr-review] Loaded config from: ${resolved}`)
        return { config, repoRoot }
      } catch (err) {
        console.warn(`[pr-review] Failed to load config from ${resolved}:`, err)
        console.warn("[pr-review] Falling back to default configuration")
        return { config: loadConfig(process.cwd()), repoRoot: process.cwd() }
      }
    }

    if (stat.isDirectory()) {
      // Directory path - look for .github/pr-review.json
      console.log(`[pr-review] Looking for config in: ${resolved}`)
      return { config: loadConfig(resolved), repoRoot: resolved }
    }
  }

  // Path doesn't exist - try treating it as a directory anyway
  console.warn(`[pr-review] Config path not found: ${resolved}`)
  console.warn("[pr-review] Falling back to default configuration")
  return { config: loadConfig(process.cwd()), repoRoot: process.cwd() }
}

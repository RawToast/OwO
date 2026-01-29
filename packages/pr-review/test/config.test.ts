import { describe, expect, test } from "bun:test"

describe("config/types", () => {
  test("ReviewerConfigSchema validates minimal config", async () => {
    const { ReviewerConfigSchema } = await import("../src/config/types")
    const config = { name: "quality" }
    const result = ReviewerConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  test("ReviewerConfigSchema validates full config", async () => {
    const { ReviewerConfigSchema } = await import("../src/config/types")
    const config = {
      name: "security",
      prompt: "You are a security reviewer",
      promptFile: ".github/reviewers/security.md",
      focus: "security vulnerabilities",
      model: "anthropic/claude-sonnet-4-20250514",
      enabled: true,
    }
    const result = ReviewerConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  test("PRReviewConfigSchema provides defaults", async () => {
    const { PRReviewConfigSchema } = await import("../src/config/types")
    const config = { version: 1 }
    const result = PRReviewConfigSchema.parse(config)
    expect(result.reviewers).toEqual([])
  })

  test("SeverityLevelSchema validates valid levels", async () => {
    const { SeverityLevelSchema } = await import("../src/config/types")
    expect(SeverityLevelSchema.safeParse("critical").success).toBe(true)
    expect(SeverityLevelSchema.safeParse("warning").success).toBe(true)
    expect(SeverityLevelSchema.safeParse("info").success).toBe(true)
    expect(SeverityLevelSchema.safeParse("invalid").success).toBe(false)
  })
})

describe("config/loader", () => {
  test("loadConfig returns defaults when no config file exists", async () => {
    const { loadConfig } = await import("../src/config/loader")
    const config = loadConfig("/nonexistent/path")
    expect(config.version).toBe(1)
    expect(config.reviewers.length).toBeGreaterThan(0)
  })

  test("loadReviewerPrompt returns inline prompt when no file", async () => {
    const { loadReviewerPrompt } = await import("../src/config/loader")
    const reviewer = { name: "test", prompt: "Test prompt" }
    const prompt = loadReviewerPrompt("/nonexistent", reviewer)
    expect(prompt).toBe("Test prompt")
  })

  test("loadReviewerPrompt returns default when no prompt specified", async () => {
    const { loadReviewerPrompt } = await import("../src/config/loader")
    const reviewer = { name: "test" }
    const prompt = loadReviewerPrompt("/nonexistent", reviewer)
    expect(prompt).toContain("Review this code")
  })
})

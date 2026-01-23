import { expect, test, describe } from "bun:test"
import { CodeReviewConfigSchema } from "@owo/config"

describe("Code Review Config Schema", () => {
  test("accepts valid config with 1 reviewer", () => {
    const config = {
      enabled: true,
      reviewers: [{ agent: "oracle" }],
    }
    expect(() => CodeReviewConfigSchema.parse(config)).not.toThrow()
  })

  test("accepts valid config with 2 reviewers", () => {
    const config = {
      reviewers: [
        { agent: "oracle", focus: "security" },
        { agent: "explorer", context: { file: "style.md" } },
      ],
    }
    expect(() => CodeReviewConfigSchema.parse(config)).not.toThrow()
  })

  test("rejects config with 0 reviewers", () => {
    const config = {
      reviewers: [],
    }
    expect(() => CodeReviewConfigSchema.parse(config)).toThrow()
  })

  test("rejects config with 3+ reviewers", () => {
    const config = {
      reviewers: [{ agent: "a" }, { agent: "b" }, { agent: "c" }],
    }
    expect(() => CodeReviewConfigSchema.parse(config)).toThrow()
  })

  test("applies default reviewers when not specified", () => {
    const config = { enabled: true }
    const parsed = CodeReviewConfigSchema.parse(config)
    expect(parsed.reviewers).toEqual([{ agent: "oracle" }])
  })

  test("accepts verify guidance as string", () => {
    const config = {
      reviewers: [{ agent: "oracle" }],
      verify: { guidance: "Ignore test files" },
    }
    const parsed = CodeReviewConfigSchema.parse(config)
    expect(parsed.verify?.guidance).toBe("Ignore test files")
  })

  test("accepts verify guidance as file reference", () => {
    const config = {
      reviewers: [{ agent: "oracle" }],
      verify: { guidance: { file: "guidance.md" } },
    }
    const parsed = CodeReviewConfigSchema.parse(config)
    expect(parsed.verify?.guidance).toEqual({ file: "guidance.md" })
  })

  test("accepts output template", () => {
    const config = {
      reviewers: [{ agent: "oracle" }],
      output: { template: { file: "template.md" } },
    }
    const parsed = CodeReviewConfigSchema.parse(config)
    expect(parsed.output?.template).toEqual({ file: "template.md" })
  })
})

describe("Review Tool", () => {
  test("createReviewTool returns a tool definition", async () => {
    // Dynamic import to avoid module resolution issues in test
    const { createReviewTool } = await import("../src/tool")

    const mockClient = {} as any
    const mockExec = async () => "diff output"
    const mockResolve = (ctx: any) => (typeof ctx === "string" ? ctx : "resolved")

    const tool = createReviewTool({
      client: mockClient,
      config: { enabled: true, reviewers: [{ agent: "oracle" }] },
      directory: "/test",
      exec: mockExec,
      resolveContext: mockResolve,
    })

    expect(tool).toBeDefined()
    expect(tool.description).toContain("Review code changes")
  })
})

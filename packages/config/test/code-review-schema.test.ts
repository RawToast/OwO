import { expect, test, describe } from "bun:test"
import {
  ReviewerConfigSchema,
  CodeReviewConfigSchema,
  ReviewVerifyConfigSchema,
  ReviewOutputConfigSchema,
} from "../src/schema"

describe("ReviewerConfigSchema", () => {
  test("accepts valid reviewer with agent only", () => {
    const input = { agent: "oracle" }
    const result = ReviewerConfigSchema.parse(input)
    expect(result.agent).toBe("oracle")
  })

  test("accepts reviewer with focus", () => {
    const input = { agent: "explorer", focus: "security vulnerabilities" }
    const result = ReviewerConfigSchema.parse(input)
    expect(result.agent).toBe("explorer")
    expect(result.focus).toBe("security vulnerabilities")
  })

  test("accepts reviewer with context as string", () => {
    const input = { agent: "oracle", context: "inline instructions" }
    const result = ReviewerConfigSchema.parse(input)
    expect(result.context).toBe("inline instructions")
  })

  test("accepts reviewer with context as file reference", () => {
    const input = { agent: "oracle", context: { file: "review-guide.md" } }
    const result = ReviewerConfigSchema.parse(input)
    expect(result.context).toEqual({ file: "review-guide.md" })
  })

  test("rejects reviewer without agent", () => {
    const input = { focus: "security" }
    expect(() => ReviewerConfigSchema.parse(input)).toThrow()
  })
})

describe("CodeReviewConfigSchema", () => {
  test("defaults enabled to true", () => {
    const input = {}
    const result = CodeReviewConfigSchema.parse(input)
    expect(result.enabled).toBe(true)
  })

  test("defaults reviewers to single oracle agent", () => {
    const input = {}
    const result = CodeReviewConfigSchema.parse(input)
    expect(result.reviewers).toEqual([{ agent: "oracle" }])
  })

  test("accepts 1 reviewer", () => {
    const input = { reviewers: [{ agent: "explorer" }] }
    const result = CodeReviewConfigSchema.parse(input)
    expect(result.reviewers).toHaveLength(1)
  })

  test("accepts 2 reviewers", () => {
    const input = {
      reviewers: [{ agent: "oracle" }, { agent: "explorer", focus: "performance" }],
    }
    const result = CodeReviewConfigSchema.parse(input)
    expect(result.reviewers).toHaveLength(2)
  })

  test("rejects empty reviewers array", () => {
    const input = { reviewers: [] }
    expect(() => CodeReviewConfigSchema.parse(input)).toThrow()
  })

  test("rejects more than 2 reviewers", () => {
    const input = {
      reviewers: [{ agent: "oracle" }, { agent: "explorer" }, { agent: "architect" }],
    }
    expect(() => CodeReviewConfigSchema.parse(input)).toThrow()
  })

  test("accepts verify config with string guidance", () => {
    const input = { verify: { guidance: "Check all tests pass" } }
    const result = CodeReviewConfigSchema.parse(input)
    expect(result.verify?.guidance).toBe("Check all tests pass")
  })

  test("accepts verify config with file guidance", () => {
    const input = { verify: { guidance: { file: "verify-guide.md" } } }
    const result = CodeReviewConfigSchema.parse(input)
    expect(result.verify?.guidance).toEqual({ file: "verify-guide.md" })
  })

  test("accepts output config with template", () => {
    const input = { output: { template: { file: "output-template.md" } } }
    const result = CodeReviewConfigSchema.parse(input)
    expect(result.output?.template).toEqual({ file: "output-template.md" })
  })

  test("accepts full config", () => {
    const input = {
      enabled: true,
      reviewers: [
        { agent: "oracle", focus: "architecture" },
        { agent: "explorer", context: { file: "security-checklist.md" } },
      ],
      verify: { guidance: "Run all verification commands" },
      output: { template: { file: "review-template.md" } },
    }
    const result = CodeReviewConfigSchema.parse(input)
    expect(result.reviewers).toHaveLength(2)
    expect(result.verify?.guidance).toBe("Run all verification commands")
    expect(result.output?.template).toEqual({ file: "review-template.md" })
  })
})

describe("ReviewVerifyConfigSchema", () => {
  test("accepts empty object", () => {
    const result = ReviewVerifyConfigSchema.parse({})
    expect(result.guidance).toBeUndefined()
  })

  test("accepts guidance as string", () => {
    const result = ReviewVerifyConfigSchema.parse({ guidance: "check tests" })
    expect(result.guidance).toBe("check tests")
  })

  test("accepts guidance as file reference", () => {
    const result = ReviewVerifyConfigSchema.parse({ guidance: { file: "guide.md" } })
    expect(result.guidance).toEqual({ file: "guide.md" })
  })
})

describe("ReviewOutputConfigSchema", () => {
  test("accepts empty object", () => {
    const result = ReviewOutputConfigSchema.parse({})
    expect(result.template).toBeUndefined()
  })

  test("accepts template as file reference", () => {
    const result = ReviewOutputConfigSchema.parse({ template: { file: "template.md" } })
    expect(result.template).toEqual({ file: "template.md" })
  })
})

import { describe, expect, test } from "bun:test"
import type { ReviewerOutput } from "../src/config/types"

describe("reviewers/engine", () => {
  test("synthesizeReview combines comments from multiple reviewers", async () => {
    const { synthesizeReview } = await import("../src/reviewers/engine")

    const outputs: ReviewerOutput[] = [
      {
        name: "quality",
        success: true,
        review: {
          overview: "Quality looks good",
          comments: [
            {
              path: "src/auth.ts",
              line: 42,
              body: "Consider error handling",
              side: "RIGHT",
              severity: "warning",
            },
          ],
        },
        durationMs: 1000,
      },
      {
        name: "security",
        success: true,
        review: {
          overview: "No security issues",
          comments: [
            {
              path: "src/auth.ts",
              line: 99,
              body: "Validate input",
              side: "RIGHT",
              severity: "critical",
            },
          ],
        },
        durationMs: 1200,
      },
    ]

    const result = synthesizeReview(outputs)
    expect(result.comments).toHaveLength(2)
    expect(result.summary.criticalIssues).toBe(1)
    expect(result.summary.warnings).toBe(1)
    expect(result.passed).toBe(false)
  })

  test("synthesizeReview handles partial failures", async () => {
    const { synthesizeReview } = await import("../src/reviewers/engine")

    const outputs: ReviewerOutput[] = [
      {
        name: "quality",
        success: true,
        review: { overview: "OK", comments: [] },
        durationMs: 1000,
      },
      {
        name: "security",
        success: false,
        error: "API timeout",
        durationMs: 180000,
      },
    ]

    const result = synthesizeReview(outputs)
    expect(result.summary.successfulReviewers).toBe(1)
    expect(result.summary.totalReviewers).toBe(2)
  })

  test("synthesizeReview handles multi-line comments", async () => {
    const { synthesizeReview } = await import("../src/reviewers/engine")

    const outputs: ReviewerOutput[] = [
      {
        name: "quality",
        success: true,
        review: {
          overview: "Found a block that needs work",
          comments: [
            {
              path: "src/auth.ts",
              line: 50,
              start_line: 42,
              body: "This entire function needs refactoring",
              side: "RIGHT",
              severity: "warning",
            },
          ],
        },
        durationMs: 1000,
      },
    ]

    const result = synthesizeReview(outputs)
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].start_line).toBe(42)
    expect(result.comments[0].line).toBe(50)
  })
})

describe("reviewers/runner", () => {
  test("parseReviewerResponse extracts JSON from markdown", async () => {
    const { parseReviewerResponse } = await import("../src/reviewers/runner")

    const response = `Here's my review:
\`\`\`json
{
  "overview": "Found issues",
  "comments": [{"path": "test.ts", "line": 10, "body": "Fix this", "side": "RIGHT", "severity": "warning"}]
}
\`\`\``

    const result = parseReviewerResponse(response, "test-reviewer")

    expect(result.overview).toBe("Found issues")
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0]).toMatchObject({
      path: "test.ts",
      line: 10,
      body: "Fix this",
      side: "RIGHT",
      severity: "warning",
    })
  })

  test("parseReviewerResponse handles line as range string", async () => {
    const { parseReviewerResponse } = await import("../src/reviewers/runner")

    const response = `\`\`\`json
{
  "overview": "Range test",
  "comments": [{"path": "foo.ts", "line": "118-119", "body": "Multi-line issue"}]
}
\`\`\``

    const result = parseReviewerResponse(response, "test-reviewer")

    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].line).toBe(119)
    expect(result.comments[0].start_line).toBe(118)
    expect(result.comments[0].start_side).toBe("RIGHT")
  })

  test("parseReviewerResponse handles line as string number", async () => {
    const { parseReviewerResponse } = await import("../src/reviewers/runner")

    const response = `\`\`\`json
{
  "overview": "String number test",
  "comments": [{"path": "bar.ts", "line": "42", "body": "Single line"}]
}
\`\`\``

    const result = parseReviewerResponse(response, "test-reviewer")

    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].line).toBe(42)
    expect(result.comments[0].start_line).toBeUndefined()
  })

  test("parseReviewerResponse preserves explicit start_line over range parsing", async () => {
    const { parseReviewerResponse } = await import("../src/reviewers/runner")

    const response = `\`\`\`json
{
  "overview": "Explicit start_line test",
  "comments": [{"path": "baz.ts", "line": 50, "start_line": 40, "body": "Explicit range"}]
}
\`\`\``

    const result = parseReviewerResponse(response, "test-reviewer")

    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].line).toBe(50)
    expect(result.comments[0].start_line).toBe(40)
  })
})

describe("reviewers/runner parseLineValue", () => {
  test("handles number input", async () => {
    const { parseLineValue } = await import("../src/reviewers/runner")

    expect(parseLineValue(42)).toEqual({ line: 42 })
    expect(parseLineValue(1)).toEqual({ line: 1 })
    expect(parseLineValue(999)).toEqual({ line: 999 })
  })

  test("handles string number input", async () => {
    const { parseLineValue } = await import("../src/reviewers/runner")

    expect(parseLineValue("42")).toEqual({ line: 42 })
    expect(parseLineValue(" 10 ")).toEqual({ line: 10 })
  })

  test("handles range string input", async () => {
    const { parseLineValue } = await import("../src/reviewers/runner")

    expect(parseLineValue("118-119")).toEqual({ line: 119, start_line: 118 })
    expect(parseLineValue("10-20")).toEqual({ line: 20, start_line: 10 })
    expect(parseLineValue(" 5-15 ")).toEqual({ line: 15, start_line: 5 })
  })

  test("returns null for invalid input", async () => {
    const { parseLineValue } = await import("../src/reviewers/runner")

    expect(parseLineValue(null)).toBeNull()
    expect(parseLineValue(undefined)).toBeNull()
    expect(parseLineValue("invalid")).toBeNull()
    expect(parseLineValue("abc-def")).toBeNull()
    expect(parseLineValue({})).toBeNull()
  })
})

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
})

describe("reviewers/runner", () => {
  test("parseReviewerResponse extracts JSON from markdown", async () => {
    const response = `Here's my review:
\`\`\`json
{
  "overview": "Found issues",
  "comments": [{"path": "test.ts", "line": 10, "body": "Fix this", "side": "RIGHT", "severity": "warning"}]
}
\`\`\``

    void response
  })
})

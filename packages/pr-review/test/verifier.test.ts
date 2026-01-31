import { describe, expect, test } from "bun:test"
import type { ReviewerOutput } from "../src/config/types"
import { deduplicateComments } from "../src/verifier/comments"
import { filterCommentsByLevel } from "../src/verifier/comments"
import { basicSynthesis } from "../src/verifier/synthesizer"

describe("verifier/synthesizer", () => {
  test("deduplicateComments preserves exact line numbers", () => {
    const comments = [
      {
        path: "src/auth.ts",
        line: 42,
        body: "Issue A",
        side: "RIGHT" as const,
        severity: "warning" as const,
        reviewer: "quality",
      },
      {
        path: "src/auth.ts",
        line: 99,
        body: "Issue B",
        side: "RIGHT" as const,
        severity: "critical" as const,
        reviewer: "security",
      },
    ]

    const result = deduplicateComments(comments)

    expect(result.find((c) => c.body === "Issue A")?.line).toBe(42)
    expect(result.find((c) => c.body === "Issue B")?.line).toBe(99)
  })

  test("deduplicateComments keeps highest severity for same line", () => {
    const comments = [
      {
        path: "src/auth.ts",
        line: 42,
        body: "Minor issue",
        side: "RIGHT" as const,
        severity: "info" as const,
        reviewer: "quality",
      },
      {
        path: "src/auth.ts",
        line: 42,
        body: "Critical issue!",
        side: "RIGHT" as const,
        severity: "critical" as const,
        reviewer: "security",
      },
    ]

    const result = deduplicateComments(comments)

    const line42Comments = result.filter((c) => c.line === 42)
    expect(line42Comments).toHaveLength(1)
    expect(line42Comments[0].severity).toBe("critical")
  })

  test("filterCommentsByLevel filters correctly", () => {
    const comments = [{ severity: "critical" }, { severity: "warning" }, { severity: "info" }]

    expect(filterCommentsByLevel(comments, "critical")).toHaveLength(1)
    expect(filterCommentsByLevel(comments, "warning")).toHaveLength(2)
    expect(filterCommentsByLevel(comments, "info")).toHaveLength(3)
  })

  test("basicSynthesis preserves all line numbers from reviewers", () => {
    const outputs: ReviewerOutput[] = [
      {
        name: "quality",
        success: true,
        review: {
          overview: "Found issues",
          comments: [
            {
              path: "src/auth.ts",
              line: 42,
              body: "Issue here",
              side: "RIGHT",
              severity: "warning",
            },
            {
              path: "src/auth.ts",
              line: 99,
              body: "Another issue",
              side: "RIGHT",
              severity: "critical",
            },
            {
              path: "src/utils.ts",
              line: 15,
              body: "Consider this",
              side: "RIGHT",
              severity: "info",
            },
          ],
        },
        durationMs: 1000,
      },
    ]

    const result = basicSynthesis(outputs, undefined, "info")

    expect(result.comments.find((c) => c.path === "src/auth.ts" && c.line === 42)).toBeDefined()
    expect(result.comments.find((c) => c.path === "src/auth.ts" && c.line === 99)).toBeDefined()
    expect(result.comments.find((c) => c.path === "src/utils.ts" && c.line === 15)).toBeDefined()
  })

  test("basicSynthesis filters inline comments by severity level", () => {
    const outputs: ReviewerOutput[] = [
      {
        name: "quality",
        success: true,
        review: {
          overview: "Found issues",
          comments: [
            {
              path: "src/auth.ts",
              line: 42,
              body: "Warning issue",
              side: "RIGHT",
              severity: "warning",
            },
            {
              path: "src/auth.ts",
              line: 99,
              body: "Critical issue",
              side: "RIGHT",
              severity: "critical",
            },
            {
              path: "src/utils.ts",
              line: 15,
              body: "Info issue",
              side: "RIGHT",
              severity: "info",
            },
          ],
        },
        durationMs: 1000,
      },
    ]

    // With level="critical", only critical comments should be included
    const criticalResult = basicSynthesis(outputs, undefined, "critical")
    expect(criticalResult.comments).toHaveLength(1)
    expect(criticalResult.comments[0].severity).toBe("critical")

    // With level="warning", critical and warning comments should be included
    const warningResult = basicSynthesis(outputs, undefined, "warning")
    expect(warningResult.comments).toHaveLength(2)
    expect(warningResult.comments.every((c) => c.severity !== "info")).toBe(true)

    // With level="info" (default), all comments should be included
    const infoResult = basicSynthesis(outputs, undefined, "info")
    expect(infoResult.comments).toHaveLength(3)
  })
})

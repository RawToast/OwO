import { describe, expect, test } from "bun:test"
import { validateCommentLines, mapCommentsToLines } from "../../src/diff/position"
import type { InlineComment } from "../../src/github/types"

const SAMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..abcdefg 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,8 @@ export function authenticate(user: string) {
   const token = generateToken(user)
+  // New validation
+  validateToken(token)
   return token
 }
@@ -20,3 +22,7 @@ function generateToken(user: string) {
   return hash(user + Date.now())
 }
+
+function validateToken(token: string) {
+  if (!token) throw new Error("Invalid token")
+}
`

describe("diff/position", () => {
  describe("validateCommentLines", () => {
    test("validates single line in diff (RIGHT side)", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 12, "RIGHT")
      expect(result.valid).toBe(true)
    })

    test("validates single line in diff (LEFT side)", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 10, "LEFT")
      expect(result.valid).toBe(true)
    })

    test("rejects line not in diff", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 100, "RIGHT")
      expect(result.valid).toBe(false)
    })

    test("validates multi-line range", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 13, "RIGHT", 11, "RIGHT")
      expect(result.valid).toBe(true)
    })

    test("rejects range where start_line not in diff", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "src/auth.ts", 13, "RIGHT", 5, "RIGHT")
      expect(result.valid).toBe(false)
    })

    test("rejects unknown file", () => {
      const result = validateCommentLines(SAMPLE_DIFF, "unknown.ts", 10, "RIGHT")
      expect(result.valid).toBe(false)
    })
  })

  describe("mapCommentsToLines", () => {
    test("maps valid single-line comments", () => {
      const comments: InlineComment[] = [
        { path: "src/auth.ts", line: 12, body: "Nice!", side: "RIGHT" },
      ]
      const { mapped, unmapped } = mapCommentsToLines(SAMPLE_DIFF, comments)
      expect(mapped).toHaveLength(1)
      expect(unmapped).toHaveLength(0)
      expect(mapped[0].line).toBe(12)
    })

    test("maps valid multi-line comments", () => {
      const comments: InlineComment[] = [
        {
          path: "src/auth.ts",
          line: 13,
          body: "This block",
          side: "RIGHT",
          start_line: 11,
          start_side: "RIGHT",
        },
      ]
      const { mapped, unmapped } = mapCommentsToLines(SAMPLE_DIFF, comments)
      expect(mapped).toHaveLength(1)
      expect(mapped[0].start_line).toBe(11)
      expect(mapped[0].line).toBe(13)
    })

    test("moves invalid comments to unmapped", () => {
      const comments: InlineComment[] = [
        { path: "src/auth.ts", line: 100, body: "Not in diff", side: "RIGHT" },
      ]
      const { mapped, unmapped } = mapCommentsToLines(SAMPLE_DIFF, comments)
      expect(mapped).toHaveLength(0)
      expect(unmapped).toHaveLength(1)
    })
  })
})

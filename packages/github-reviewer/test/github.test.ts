import { expect, test, describe } from "bun:test"
import { mapLineToPosition, mapCommentsToPositions } from "../src/github"
import { readFileSync } from "fs"
import { join } from "path"

const sampleDiff = readFileSync(join(import.meta.dir, "fixtures/sample.diff"), "utf-8")

describe("mapLineToPosition", () => {
  test("maps added line to correct position", () => {
    // Line 15 in new file: "if (user.length > 100)..."
    const position = mapLineToPosition(sampleDiff, "src/auth.ts", 15, "RIGHT")
    expect(position).toBe(6)
  })

  test("maps context line to correct position", () => {
    // Line 11 in new file: "if (!user || !pass) {"
    const position = mapLineToPosition(sampleDiff, "src/auth.ts", 11, "RIGHT")
    expect(position).toBe(2)
  })

  test("returns null for line not in diff", () => {
    // Line 1 is not in the diff
    const position = mapLineToPosition(sampleDiff, "src/auth.ts", 1, "RIGHT")
    expect(position).toBeNull()
  })

  test("returns null for non-existent file", () => {
    const position = mapLineToPosition(sampleDiff, "nonexistent.ts", 10, "RIGHT")
    expect(position).toBeNull()
  })
})

describe("mapCommentsToPositions", () => {
  test("separates mapped and unmapped comments", () => {
    const comments = [
      { path: "src/auth.ts", line: 15, body: "Good validation!", side: "RIGHT" as const },
      { path: "src/auth.ts", line: 1, body: "Consider adding docs", side: "RIGHT" as const },
      { path: "other.ts", line: 5, body: "Not in diff", side: "RIGHT" as const },
    ]

    const { mapped, unmapped } = mapCommentsToPositions(sampleDiff, comments)

    expect(mapped).toHaveLength(1)
    expect(mapped[0].position).toBe(6)
    expect(unmapped).toHaveLength(2)
  })
})

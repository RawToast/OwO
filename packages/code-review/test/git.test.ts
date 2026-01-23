import { expect, test, describe, mock } from "bun:test"
import { gatherDiff } from "../src/git"

describe("gatherDiff", () => {
  test("vs-main mode generates correct git command", async () => {
    const mockExec = mock(() => Promise.resolve("diff output"))
    const result = await gatherDiff(
      { mode: "vs-main" },
      { exec: mockExec, cwd: "/test" }
    )
    expect(mockExec).toHaveBeenCalledWith("git diff main...HEAD", {
      cwd: "/test",
    })
    expect(result.diff).toBe("diff output")
    expect(result.mode).toBe("vs-main")
  })

  test("unstaged mode generates correct git command", async () => {
    const mockExec = mock(() => Promise.resolve("unstaged diff"))
    const result = await gatherDiff(
      { mode: "unstaged" },
      { exec: mockExec, cwd: "/test" }
    )
    expect(mockExec).toHaveBeenCalledWith("git diff", { cwd: "/test" })
    expect(result.diff).toBe("unstaged diff")
  })

  test("staged mode generates correct git command", async () => {
    const mockExec = mock(() => Promise.resolve("staged diff"))
    const result = await gatherDiff(
      { mode: "staged" },
      { exec: mockExec, cwd: "/test" }
    )
    expect(mockExec).toHaveBeenCalledWith("git diff --cached", { cwd: "/test" })
    expect(result.diff).toBe("staged diff")
  })

  test("commits mode with refs generates correct git command", async () => {
    const mockExec = mock(() => Promise.resolve("commit diff"))
    const result = await gatherDiff(
      { mode: "commits", refs: ["abc123", "def456"] },
      { exec: mockExec, cwd: "/test" }
    )
    expect(mockExec).toHaveBeenCalledWith("git diff abc123 def456", {
      cwd: "/test",
    })
    expect(result.diff).toBe("commit diff")
    expect(result.refs).toEqual(["abc123", "def456"])
  })

  test("commits mode with single ref diffs against parent", async () => {
    const mockExec = mock(() => Promise.resolve("single commit diff"))
    const result = await gatherDiff(
      { mode: "commits", refs: ["abc123"] },
      { exec: mockExec, cwd: "/test" }
    )
    expect(mockExec).toHaveBeenCalledWith("git show abc123 --format=", {
      cwd: "/test",
    })
    expect(result.diff).toBe("single commit diff")
    expect(result.refs).toEqual(["abc123"])
  })

  test("commits mode with no refs defaults to HEAD~1", async () => {
    const mockExec = mock(() => Promise.resolve("default diff"))
    const result = await gatherDiff(
      { mode: "commits" },
      { exec: mockExec, cwd: "/test" }
    )
    expect(mockExec).toHaveBeenCalledWith("git diff HEAD~1 HEAD", {
      cwd: "/test",
    })
    expect(result.diff).toBe("default diff")
  })
})

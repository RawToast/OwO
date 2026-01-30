import { describe, expect, test } from "bun:test"
import type { AIClient } from "../../src/ai/client"
import type { GitHubClient } from "../../src/github/client"
import type { PRData } from "../../src/github/types"
import type { ResolutionConfig } from "../../src/config/types"

type RestCall = {
  method: string
  args: Record<string, unknown>
}

type GraphqlCall = {
  query: string
  variables: Record<string, unknown>
}

function createMockPR(overrides: Partial<PRData> = {}): PRData {
  return {
    owner: "test-owner",
    repo: "test-repo",
    number: 123,
    title: "Test PR",
    body: "Test description",
    author: "test-author",
    baseSha: "base-sha",
    headSha: "head-sha",
    baseRef: "main",
    headRef: "feature",
    additions: 10,
    deletions: 5,
    state: "open",
    createdAt: "2024-01-01T00:00:00Z",
    commits: [
      { oid: "abc123", message: "Fix bug", author: { name: "Dev", email: "dev@test.com" } },
    ],
    files: [{ path: "src/file.ts", additions: 10, deletions: 5, changeType: "MODIFIED" }],
    comments: [],
    reviews: [],
    ...overrides,
  }
}

function createMockGitHubClient(options: {
  reviewComments?: Array<{ id: number; path: string; line: number; body: string }>
  threads?: Array<{ id: string; isResolved: boolean; commentDatabaseId: number }>
  fileContents?: Map<string, string>
  restCalls?: RestCall[]
  graphqlCalls?: GraphqlCall[]
}): GitHubClient {
  const restCalls = options.restCalls ?? []
  const graphqlCalls = options.graphqlCalls ?? []
  const reviewComments = options.reviewComments ?? []
  const threads = options.threads ?? []
  const fileContents = options.fileContents ?? new Map()

  return {
    owner: "test-owner",
    repo: "test-repo",
    rest: {
      pulls: {
        listReviewComments: async (args: Record<string, unknown>) => {
          restCalls.push({ method: "pulls.listReviewComments", args })
          return { data: reviewComments }
        },
      },
      repos: {
        getContent: async (args: { path: string }) => {
          restCalls.push({ method: "repos.getContent", args })
          const content = fileContents.get(args.path)
          if (content) {
            return {
              data: { content: Buffer.from(content).toString("base64") },
            }
          }
          throw new Error("File not found")
        },
      },
    } as unknown as GitHubClient["rest"],
    graphql: async (query: string, variables: Record<string, unknown>) => {
      graphqlCalls.push({ query, variables })

      // Handle fetchAllThreads
      if (query.includes("GetReviewThreads")) {
        return {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: threads.map((t) => ({
                  id: t.id,
                  isResolved: t.isResolved,
                  comments: { nodes: [{ databaseId: t.commentDatabaseId }] },
                })),
              },
            },
          },
        }
      }

      // Handle reply
      if (query.includes("AddReply")) {
        return { addPullRequestReviewThreadReply: { comment: { id: "reply-id" } } }
      }

      // Handle resolve
      if (query.includes("ResolveThread")) {
        return { resolveReviewThread: { thread: { isResolved: true } } }
      }

      return {}
    },
  } satisfies GitHubClient
}

function createMockAIClient(
  responses: Array<{ results: Array<{ commentId: number; status: string; reason: string }> }>,
): AIClient {
  let callIndex = 0
  return {
    client: {
      session: {
        create: async () => ({ data: { id: "session-1" } }),
        prompt: async () => {
          const response = responses[callIndex] ?? { results: [] }
          callIndex++
          return {
            data: {
              parts: [{ type: "text", text: JSON.stringify(response) }],
            },
          }
        },
      },
    },
  } as unknown as AIClient
}

describe("resolution/checker", () => {
  describe("runResolutionCheck", () => {
    test("returns empty result when no owo comments exist", async () => {
      const { runResolutionCheck } = await import("../../src/resolution/checker")

      const github = createMockGitHubClient({ reviewComments: [] })
      const ai = createMockAIClient([])
      const pr = createMockPR()
      const config: ResolutionConfig = { enabled: true }

      const result = await runResolutionCheck(github, ai, pr, "", config, "/repo")

      expect(result).toEqual({
        checked: 0,
        fixed: 0,
        partiallyFixed: 0,
        notFixed: 0,
        deletedFiles: 0,
      })
    })

    test("filters comments by owo marker", async () => {
      const { runResolutionCheck } = await import("../../src/resolution/checker")

      const restCalls: RestCall[] = []
      const github = createMockGitHubClient({
        reviewComments: [
          { id: 1, path: "file.ts", line: 10, body: "<!-- owo-comment -->\nIssue here" },
          { id: 2, path: "file.ts", line: 20, body: "Regular comment without marker" },
          { id: 3, path: "file.ts", line: 30, body: "Another <!-- owo-comment --> issue" },
        ],
        threads: [
          { id: "thread-1", isResolved: false, commentDatabaseId: 1 },
          { id: "thread-3", isResolved: false, commentDatabaseId: 3 },
        ],
        fileContents: new Map([["file.ts", "const x = 1\nconst y = 2"]]),
        restCalls,
      })

      const ai = createMockAIClient([
        {
          results: [
            { commentId: 1, status: "FIXED", reason: "Done" },
            { commentId: 3, status: "NOT_FIXED", reason: "Still present" },
          ],
        },
      ])

      const pr = createMockPR()
      const config: ResolutionConfig = { enabled: true }

      const result = await runResolutionCheck(github, ai, pr, "", config, "/repo")

      // Only 2 owo comments should be checked
      expect(result.checked).toBe(2)
      expect(result.fixed).toBe(1)
      expect(result.notFixed).toBe(1)
    })

    test("auto-resolves comments on deleted files", async () => {
      const { runResolutionCheck } = await import("../../src/resolution/checker")

      const graphqlCalls: GraphqlCall[] = []
      const github = createMockGitHubClient({
        reviewComments: [
          { id: 1, path: "deleted.ts", line: 10, body: "<!-- owo-comment -->\nIssue" },
          { id: 2, path: "existing.ts", line: 20, body: "<!-- owo-comment -->\nIssue" },
        ],
        threads: [
          { id: "thread-1", isResolved: false, commentDatabaseId: 1 },
          { id: "thread-2", isResolved: false, commentDatabaseId: 2 },
        ],
        fileContents: new Map([["existing.ts", "const x = 1"]]),
        graphqlCalls,
      })

      const ai = createMockAIClient([
        {
          results: [{ commentId: 2, status: "NOT_FIXED", reason: "Still there" }],
        },
      ])

      const pr = createMockPR({
        files: [
          { path: "deleted.ts", additions: 0, deletions: 50, changeType: "DELETED" },
          { path: "existing.ts", additions: 10, deletions: 5, changeType: "MODIFIED" },
        ],
      })

      const config: ResolutionConfig = { enabled: true }

      const result = await runResolutionCheck(github, ai, pr, "", config, "/repo")

      expect(result.deletedFiles).toBe(1)
      expect(result.notFixed).toBe(1)

      // Verify deleted file comment was resolved with correct message
      const replyCall = graphqlCalls.find(
        (c) => c.query.includes("AddReply") && c.variables.threadId === "thread-1",
      )
      expect(replyCall?.variables.body).toBe("📁 File was deleted — resolving.")

      const resolveCall = graphqlCalls.find(
        (c) => c.query.includes("ResolveThread") && c.variables.threadId === "thread-1",
      )
      expect(resolveCall).toBeDefined()
    })

    test("resolves fixed comments with correct message", async () => {
      const { runResolutionCheck } = await import("../../src/resolution/checker")

      const graphqlCalls: GraphqlCall[] = []
      const github = createMockGitHubClient({
        reviewComments: [
          { id: 1, path: "file.ts", line: 10, body: "<!-- owo-comment -->\nNull check missing" },
        ],
        threads: [{ id: "thread-1", isResolved: false, commentDatabaseId: 1 }],
        fileContents: new Map([["file.ts", "if (x != null) { doThing() }"]]),
        graphqlCalls,
      })

      const ai = createMockAIClient([
        {
          results: [{ commentId: 1, status: "FIXED", reason: "Null check added" }],
        },
      ])

      const pr = createMockPR()
      const config: ResolutionConfig = { enabled: true }

      const result = await runResolutionCheck(github, ai, pr, "", config, "/repo")

      expect(result.fixed).toBe(1)

      // Should reply and resolve
      const replyCall = graphqlCalls.find((c) => c.query.includes("AddReply"))
      expect(replyCall?.variables.body).toBe("✅ This issue has been addressed in recent commits.")

      const resolveCall = graphqlCalls.find((c) => c.query.includes("ResolveThread"))
      expect(resolveCall?.variables.threadId).toBe("thread-1")
    })

    test("replies to partially fixed comments without resolving", async () => {
      const { runResolutionCheck } = await import("../../src/resolution/checker")

      const graphqlCalls: GraphqlCall[] = []
      const github = createMockGitHubClient({
        reviewComments: [
          { id: 1, path: "file.ts", line: 10, body: "<!-- owo-comment -->\nMultiple issues" },
        ],
        threads: [{ id: "thread-1", isResolved: false, commentDatabaseId: 1 }],
        fileContents: new Map([["file.ts", "const x = 1"]]),
        graphqlCalls,
      })

      const ai = createMockAIClient([
        {
          results: [{ commentId: 1, status: "PARTIALLY_FIXED", reason: "Only one issue fixed" }],
        },
      ])

      const pr = createMockPR()
      const config: ResolutionConfig = { enabled: true }

      const result = await runResolutionCheck(github, ai, pr, "", config, "/repo")

      expect(result.partiallyFixed).toBe(1)

      // Should reply but NOT resolve
      const replyCall = graphqlCalls.find((c) => c.query.includes("AddReply"))
      expect(replyCall?.variables.body).toBe("⚠️ Partially addressed: Only one issue fixed")

      // No resolve call should be made for this thread
      const resolveCall = graphqlCalls.find(
        (c) => c.query.includes("ResolveThread") && c.variables.threadId === "thread-1",
      )
      expect(resolveCall).toBeUndefined()
    })

    test("does nothing for not fixed comments", async () => {
      const { runResolutionCheck } = await import("../../src/resolution/checker")

      const graphqlCalls: GraphqlCall[] = []
      const github = createMockGitHubClient({
        reviewComments: [{ id: 1, path: "file.ts", line: 10, body: "<!-- owo-comment -->\nBug" }],
        threads: [{ id: "thread-1", isResolved: false, commentDatabaseId: 1 }],
        fileContents: new Map([["file.ts", "const buggy = true"]]),
        graphqlCalls,
      })

      const ai = createMockAIClient([
        {
          results: [{ commentId: 1, status: "NOT_FIXED", reason: "Bug still present" }],
        },
      ])

      const pr = createMockPR()
      const config: ResolutionConfig = { enabled: true }

      const result = await runResolutionCheck(github, ai, pr, "", config, "/repo")

      expect(result.notFixed).toBe(1)

      // Should not reply or resolve for NOT_FIXED
      const replyForThread1 = graphqlCalls.filter(
        (c) =>
          (c.query.includes("AddReply") || c.query.includes("ResolveThread")) &&
          c.variables.threadId === "thread-1",
      )
      expect(replyForThread1).toHaveLength(0)
    })

    test("handles all deleted files gracefully", async () => {
      const { runResolutionCheck } = await import("../../src/resolution/checker")

      const github = createMockGitHubClient({
        reviewComments: [
          { id: 1, path: "deleted.ts", line: 10, body: "<!-- owo-comment -->\nIssue" },
        ],
        threads: [{ id: "thread-1", isResolved: false, commentDatabaseId: 1 }],
      })

      // AI should NOT be called since all comments are on deleted files
      let aiCalled = false
      const ai = {
        client: {
          session: {
            create: async () => {
              aiCalled = true
              return { data: { id: "session-1" } }
            },
            prompt: async () => {
              aiCalled = true
              return { data: { parts: [{ type: "text", text: '{"results":[]}' }] } }
            },
          },
        },
      } as unknown as AIClient

      const pr = createMockPR({
        files: [{ path: "deleted.ts", additions: 0, deletions: 50, changeType: "DELETED" }],
      })

      const config: ResolutionConfig = { enabled: true }

      const result = await runResolutionCheck(github, ai, pr, "", config, "/repo")

      expect(result.deletedFiles).toBe(1)
      expect(result.checked).toBe(1)
      expect(aiCalled).toBe(false)
    })

    test("handles multiple comments correctly", async () => {
      const { runResolutionCheck } = await import("../../src/resolution/checker")

      const github = createMockGitHubClient({
        reviewComments: [
          { id: 1, path: "a.ts", line: 10, body: "<!-- owo-comment -->\nIssue A" },
          { id: 2, path: "b.ts", line: 20, body: "<!-- owo-comment -->\nIssue B" },
          { id: 3, path: "c.ts", line: 30, body: "<!-- owo-comment -->\nIssue C" },
          { id: 4, path: "deleted.ts", line: 40, body: "<!-- owo-comment -->\nIssue D" },
        ],
        threads: [
          { id: "thread-1", isResolved: false, commentDatabaseId: 1 },
          { id: "thread-2", isResolved: false, commentDatabaseId: 2 },
          { id: "thread-3", isResolved: false, commentDatabaseId: 3 },
          { id: "thread-4", isResolved: false, commentDatabaseId: 4 },
        ],
        fileContents: new Map([
          ["a.ts", "const a = 1"],
          ["b.ts", "const b = 2"],
          ["c.ts", "const c = 3"],
        ]),
      })

      const ai = createMockAIClient([
        {
          results: [
            { commentId: 1, status: "FIXED", reason: "Fixed" },
            { commentId: 2, status: "PARTIALLY_FIXED", reason: "Partial" },
            { commentId: 3, status: "NOT_FIXED", reason: "Not fixed" },
          ],
        },
      ])

      const pr = createMockPR({
        files: [
          { path: "a.ts", additions: 5, deletions: 2, changeType: "MODIFIED" },
          { path: "b.ts", additions: 3, deletions: 1, changeType: "MODIFIED" },
          { path: "c.ts", additions: 1, deletions: 0, changeType: "MODIFIED" },
          { path: "deleted.ts", additions: 0, deletions: 100, changeType: "DELETED" },
        ],
      })

      const config: ResolutionConfig = { enabled: true }

      const result = await runResolutionCheck(github, ai, pr, "", config, "/repo")

      expect(result.checked).toBe(4)
      expect(result.fixed).toBe(1)
      expect(result.partiallyFixed).toBe(1)
      expect(result.notFixed).toBe(1)
      expect(result.deletedFiles).toBe(1)
    })

    test("passes PR info to resolution agent", async () => {
      const { runResolutionCheck } = await import("../../src/resolution/checker")

      let capturedPromptInput: unknown
      const ai = {
        client: {
          session: {
            create: async () => ({ data: { id: "session-1" } }),
            prompt: async (args: { body: { parts: Array<{ text: string }> } }) => {
              capturedPromptInput = args.body.parts[0].text
              return {
                data: {
                  parts: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        results: [{ commentId: 1, status: "FIXED", reason: "Done" }],
                      }),
                    },
                  ],
                },
              }
            },
          },
        },
      } as unknown as AIClient

      const github = createMockGitHubClient({
        reviewComments: [
          { id: 1, path: "file.ts", line: 10, body: "<!-- owo-comment -->\nBug here" },
        ],
        threads: [{ id: "thread-1", isResolved: false, commentDatabaseId: 1 }],
        fileContents: new Map([["file.ts", "const fixed = true"]]),
      })

      const pr = createMockPR({
        title: "Fix critical bug",
        body: "This fixes the bug reported in #42",
        commits: [
          { oid: "abc123", message: "First fix", author: { name: "Dev", email: "d@t.com" } },
          { oid: "def456", message: "Second fix", author: { name: "Dev", email: "d@t.com" } },
        ],
      })

      const config: ResolutionConfig = { enabled: true }

      await runResolutionCheck(github, ai, pr, "", config, "/repo")

      const promptText = capturedPromptInput as string
      expect(promptText).toContain("Fix critical bug")
      expect(promptText).toContain("This fixes the bug reported in #42")
      expect(promptText).toContain("abc123")
      expect(promptText).toContain("First fix")
      expect(promptText).toContain("Bug here")
    })
  })
})

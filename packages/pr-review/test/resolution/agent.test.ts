import { describe, expect, test } from "bun:test"
import type { AIClient } from "../../src/ai/client"
import type {
  CodeSnippet,
  OldComment,
  ResolutionInput,
  ResolutionOutput,
} from "../../src/resolution/agent"

describe("resolution/agent", () => {
  describe("buildResolutionPrompt", () => {
    test("builds prompt with all sections", async () => {
      const { buildResolutionPrompt } = await import("../../src/resolution/agent")

      const input: ResolutionInput = {
        prTitle: "Fix authentication bug",
        prDescription: "This PR fixes the auth bypass issue",
        oldComments: [
          {
            id: 123,
            threadId: "thread-1",
            path: "src/auth.ts",
            line: 42,
            body: "This allows null bypass",
          },
        ],
        currentCode: [
          {
            path: "src/auth.ts",
            content: "if (user != null) { authorize(user) }",
          },
        ],
        recentCommits: [{ sha: "abc1234567890", message: "Fix null check in auth" }],
      }

      const prompt = buildResolutionPrompt(input)

      // Check for system instruction
      expect(prompt).toContain("resolution checking agent")

      // Check PR context
      expect(prompt).toContain("Fix authentication bug")
      expect(prompt).toContain("This PR fixes the auth bypass issue")

      // Check commits section
      expect(prompt).toContain("## Recent Commits")
      expect(prompt).toContain("`abc1234`")
      expect(prompt).toContain("Fix null check in auth")

      // Check comments section
      expect(prompt).toContain("## Comments to Check")
      expect(prompt).toContain("Comment 123")
      expect(prompt).toContain("src/auth.ts")
      expect(prompt).toContain("Line:** 42")
      expect(prompt).toContain("This allows null bypass")

      // Check code section
      expect(prompt).toContain("## Current Code")
      expect(prompt).toContain("if (user != null)")
    })

    test("handles empty description", async () => {
      const { buildResolutionPrompt } = await import("../../src/resolution/agent")

      const input: ResolutionInput = {
        prTitle: "Quick fix",
        prDescription: "",
        oldComments: [],
        currentCode: [],
        recentCommits: [],
      }

      const prompt = buildResolutionPrompt(input)

      expect(prompt).toContain("Quick fix")
      expect(prompt).not.toContain("**Description:**")
    })

    test("handles multiple comments and snippets", async () => {
      const { buildResolutionPrompt } = await import("../../src/resolution/agent")

      const input: ResolutionInput = {
        prTitle: "Multi-file fix",
        prDescription: "Fixing multiple issues",
        oldComments: [
          { id: 1, threadId: "t1", path: "a.ts", line: 10, body: "Issue A" },
          { id: 2, threadId: "t2", path: "b.ts", line: 20, body: "Issue B" },
        ],
        currentCode: [
          { path: "a.ts", content: "code A" },
          { path: "b.ts", content: "code B" },
        ],
        recentCommits: [],
      }

      const prompt = buildResolutionPrompt(input)

      expect(prompt).toContain("Comment 1")
      expect(prompt).toContain("Comment 2")
      expect(prompt).toContain("Issue A")
      expect(prompt).toContain("Issue B")
      expect(prompt).toContain("### a.ts")
      expect(prompt).toContain("### b.ts")
    })
  })

  describe("parseResolutionResponse", () => {
    test("parses JSON in code block", async () => {
      const { parseResolutionResponse } = await import("../../src/resolution/agent")

      const response = `Here's the analysis:

\`\`\`json
{
  "results": [
    { "commentId": 123, "status": "FIXED", "reason": "Null check added" }
  ]
}
\`\`\`

Let me know if you need more details.`

      const output = parseResolutionResponse(response)

      expect(output.results).toHaveLength(1)
      expect(output.results[0]).toEqual({
        commentId: 123,
        status: "FIXED",
        reason: "Null check added",
      })
    })

    test("parses raw JSON", async () => {
      const { parseResolutionResponse } = await import("../../src/resolution/agent")

      const response = `{
  "results": [
    { "commentId": 456, "status": "NOT_FIXED", "reason": "Issue still present" }
  ]
}`

      const output = parseResolutionResponse(response)

      expect(output.results).toHaveLength(1)
      expect(output.results[0].status).toBe("NOT_FIXED")
    })

    test("parses PARTIALLY_FIXED status", async () => {
      const { parseResolutionResponse } = await import("../../src/resolution/agent")

      const response = `{
  "results": [
    { "commentId": 789, "status": "PARTIALLY_FIXED", "reason": "Half done" }
  ]
}`

      const output = parseResolutionResponse(response)

      expect(output.results[0].status).toBe("PARTIALLY_FIXED")
    })

    test("parses multiple results", async () => {
      const { parseResolutionResponse } = await import("../../src/resolution/agent")

      const response = `{
  "results": [
    { "commentId": 1, "status": "FIXED", "reason": "Done" },
    { "commentId": 2, "status": "NOT_FIXED", "reason": "Still broken" },
    { "commentId": 3, "status": "PARTIALLY_FIXED", "reason": "WIP" }
  ]
}`

      const output = parseResolutionResponse(response)

      expect(output.results).toHaveLength(3)
      expect(output.results.map((r) => r.status)).toEqual(["FIXED", "NOT_FIXED", "PARTIALLY_FIXED"])
    })

    test("throws on malformed JSON", async () => {
      const { parseResolutionResponse } = await import("../../src/resolution/agent")

      expect(() => parseResolutionResponse("not json at all")).toThrow(
        /Failed to parse resolution response/,
      )
    })

    test("throws on missing results array", async () => {
      const { parseResolutionResponse } = await import("../../src/resolution/agent")

      expect(() => parseResolutionResponse('{ "data": [] }')).toThrow(/missing 'results' array/)
    })

    test("throws on invalid status", async () => {
      const { parseResolutionResponse } = await import("../../src/resolution/agent")

      const response = `{
  "results": [
    { "commentId": 1, "status": "INVALID", "reason": "Bad" }
  ]
}`

      expect(() => parseResolutionResponse(response)).toThrow(/Invalid status/)
    })

    test("handles missing reason gracefully", async () => {
      const { parseResolutionResponse } = await import("../../src/resolution/agent")

      const response = `{
  "results": [
    { "commentId": 1, "status": "FIXED" }
  ]
}`

      const output = parseResolutionResponse(response)

      expect(output.results[0].reason).toBe("")
    })
  })

  describe("checkResolutions", () => {
    test("returns empty results for no comments", async () => {
      const { checkResolutions } = await import("../../src/resolution/agent")

      const mockAI = {} as AIClient
      const input: ResolutionInput = {
        prTitle: "Test",
        prDescription: "",
        oldComments: [],
        currentCode: [],
        recentCommits: [],
      }

      const output = await checkResolutions(mockAI, input, { enabled: true })

      expect(output.results).toEqual([])
    })

    test("calls AI with correct prompt and parses response", async () => {
      const { checkResolutions } = await import("../../src/resolution/agent")

      let capturedPrompt = ""
      let capturedModel: { providerID: string; modelID: string } | undefined

      const mockAI = {
        client: {
          session: {
            create: async () => ({ data: { id: "session-1" } }),
            prompt: async (args: {
              path: { id: string }
              body: { parts: Array<{ type: string; text: string }>; model?: unknown }
            }) => {
              capturedPrompt = args.body.parts[0].text
              capturedModel = args.body.model as typeof capturedModel
              return {
                data: {
                  parts: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        results: [{ commentId: 100, status: "FIXED", reason: "Addressed" }],
                      }),
                    },
                  ],
                },
              }
            },
          },
        },
      } as unknown as AIClient

      const input: ResolutionInput = {
        prTitle: "Fix bug",
        prDescription: "Bug fix",
        oldComments: [{ id: 100, threadId: "t1", path: "file.ts", line: 5, body: "Bug here" }],
        currentCode: [{ path: "file.ts", content: "fixed code" }],
        recentCommits: [{ sha: "abc123", message: "Fix" }],
      }

      const output = await checkResolutions(mockAI, input, { enabled: true })

      expect(capturedPrompt).toContain("Fix bug")
      expect(capturedPrompt).toContain("Bug here")
      expect(capturedModel).toEqual({ providerID: "anthropic", modelID: "claude-3-5-haiku-latest" })
      expect(output.results).toHaveLength(1)
      expect(output.results[0].status).toBe("FIXED")
    })

    test("uses custom model from config", async () => {
      const { checkResolutions } = await import("../../src/resolution/agent")

      let capturedModel: { providerID: string; modelID: string } | undefined

      const mockAI = {
        client: {
          session: {
            create: async () => ({ data: { id: "session-1" } }),
            prompt: async (args: {
              path: { id: string }
              body: { parts: Array<{ type: string; text: string }>; model?: unknown }
            }) => {
              capturedModel = args.body.model as typeof capturedModel
              return {
                data: {
                  parts: [{ type: "text", text: '{ "results": [] }' }],
                },
              }
            },
          },
        },
      } as unknown as AIClient

      const input: ResolutionInput = {
        prTitle: "Test",
        prDescription: "",
        oldComments: [{ id: 1, threadId: "t", path: "f.ts", line: 1, body: "x" }],
        currentCode: [],
        recentCommits: [],
      }

      await checkResolutions(mockAI, input, {
        enabled: true,
        model: "openai/gpt-4o-mini",
      })

      expect(capturedModel).toEqual({ providerID: "openai", modelID: "gpt-4o-mini" })
    })

    test("maps results to comment IDs when AI returns them in order", async () => {
      const { checkResolutions } = await import("../../src/resolution/agent")

      const mockAI = {
        client: {
          session: {
            create: async () => ({ data: { id: "session-1" } }),
            prompt: async () => ({
              data: {
                parts: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      results: [
                        { commentId: 0, status: "FIXED", reason: "Done" },
                        { commentId: 0, status: "NOT_FIXED", reason: "Nope" },
                      ],
                    }),
                  },
                ],
              },
            }),
          },
        },
      } as unknown as AIClient

      const input: ResolutionInput = {
        prTitle: "Test",
        prDescription: "",
        oldComments: [
          { id: 111, threadId: "t1", path: "a.ts", line: 1, body: "A" },
          { id: 222, threadId: "t2", path: "b.ts", line: 2, body: "B" },
        ],
        currentCode: [],
        recentCommits: [],
      }

      const output = await checkResolutions(mockAI, input, { enabled: true })

      expect(output.results[0].commentId).toBe(111)
      expect(output.results[1].commentId).toBe(222)
    })
  })
})

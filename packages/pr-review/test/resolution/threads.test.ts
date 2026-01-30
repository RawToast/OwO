import { describe, expect, test } from "bun:test"
import type { GitHubClient } from "../../src/github/client"

type GraphqlCall = {
  query: string
  variables: Record<string, unknown>
}

describe("resolution/threads", () => {
  test("fetchAllThreads returns all pages of threads", async () => {
    const { fetchAllThreads } = await import("../../src/resolution/threads")

    const calls: GraphqlCall[] = []
    const client = {
      owner: "octo",
      repo: "robot",
      rest: {} as GitHubClient["rest"],
      graphql: async (query: string, variables: Record<string, unknown>) => {
        calls.push({ query, variables })

        if (variables.cursor == null) {
          return {
            repository: {
              pullRequest: {
                reviewThreads: {
                  pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
                  nodes: [
                    {
                      id: "thread-1",
                      isResolved: false,
                      comments: { nodes: [{ databaseId: 101 }] },
                    },
                  ],
                },
              },
            },
          }
        }

        return {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    id: "thread-2",
                    isResolved: true,
                    comments: { nodes: [{ databaseId: 202 }] },
                  },
                ],
              },
            },
          },
        }
      },
    } satisfies GitHubClient

    const threads = await fetchAllThreads(client, 42)

    expect(threads).toEqual([
      { id: "thread-1", isResolved: false, commentDatabaseId: 101 },
      { id: "thread-2", isResolved: true, commentDatabaseId: 202 },
    ])
    expect(calls).toHaveLength(2)
    expect(calls[0]?.variables).toEqual({ owner: "octo", repo: "robot", pr: 42, cursor: null })
    expect(calls[1]?.variables).toEqual({
      owner: "octo",
      repo: "robot",
      pr: 42,
      cursor: "cursor-1",
    })
  })

  test("replyToThread sends reply mutation", async () => {
    const { replyToThread } = await import("../../src/resolution/threads")

    const calls: GraphqlCall[] = []
    const client = {
      owner: "octo",
      repo: "robot",
      rest: {} as GitHubClient["rest"],
      graphql: async (query: string, variables: Record<string, unknown>) => {
        calls.push({ query, variables })
        return { addPullRequestReviewThreadReply: { comment: { id: "reply" } } }
      },
    } satisfies GitHubClient

    await replyToThread(client, "thread-1", "LGTM")

    expect(calls).toHaveLength(1)
    expect(calls[0]?.variables).toEqual({ threadId: "thread-1", body: "LGTM" })
    expect(calls[0]?.query).toContain("mutation AddReply")
  })

  test("resolveThread sends resolve mutation", async () => {
    const { resolveThread } = await import("../../src/resolution/threads")

    const calls: GraphqlCall[] = []
    const client = {
      owner: "octo",
      repo: "robot",
      rest: {} as GitHubClient["rest"],
      graphql: async (query: string, variables: Record<string, unknown>) => {
        calls.push({ query, variables })
        return { resolveReviewThread: { thread: { isResolved: true } } }
      },
    } satisfies GitHubClient

    await resolveThread(client, "thread-9")

    expect(calls).toHaveLength(1)
    expect(calls[0]?.variables).toEqual({ threadId: "thread-9" })
    expect(calls[0]?.query).toContain("mutation ResolveThread")
  })

  test("replyAndResolve calls reply then resolve", async () => {
    const { replyAndResolve } = await import("../../src/resolution/threads")

    const calls: GraphqlCall[] = []
    const client = {
      owner: "octo",
      repo: "robot",
      rest: {} as GitHubClient["rest"],
      graphql: async (query: string, variables: Record<string, unknown>) => {
        calls.push({ query, variables })
        if (query.includes("AddReply")) {
          return { addPullRequestReviewThreadReply: { comment: { id: "reply" } } }
        }
        return { resolveReviewThread: { thread: { isResolved: true } } }
      },
    } satisfies GitHubClient

    await replyAndResolve(client, "thread-5", "Fixed")

    expect(calls).toHaveLength(2)
    expect(calls[0]?.query).toContain("mutation AddReply")
    expect(calls[1]?.query).toContain("mutation ResolveThread")
  })
})

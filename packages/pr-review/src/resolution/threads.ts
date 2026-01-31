import type { GitHubClient } from "../github/client"

export type ReviewThread = {
  id: string
  isResolved: boolean
  commentDatabaseId: number | null
}

type ReviewThreadsResponse = {
  repository: {
    pullRequest: {
      reviewThreads: {
        pageInfo: {
          hasNextPage: boolean
          endCursor: string | null
        }
        nodes: Array<{
          id: string
          isResolved: boolean
          comments: {
            nodes: Array<{
              databaseId: number | null
            }>
          }
        }>
      }
    }
  }
}

const FETCH_REVIEW_THREADS = `
query GetReviewThreads($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes {
              databaseId
            }
          }
        }
      }
    }
  }
}
`

const ADD_REPLY = `
mutation AddReply($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {
    pullRequestReviewThreadId: $threadId,
    body: $body
  }) {
    comment { id }
  }
}
`

const RESOLVE_THREAD = `
mutation ResolveThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { isResolved }
  }
}
`

export async function fetchAllThreads(
  client: GitHubClient,
  prNumber: number,
): Promise<ReviewThread[]> {
  const threads: ReviewThread[] = []
  let cursor: string | null = null
  let hasNextPage = true

  while (hasNextPage) {
    const response: ReviewThreadsResponse = await client.graphql(FETCH_REVIEW_THREADS, {
      owner: client.owner,
      repo: client.repo,
      pr: prNumber,
      cursor,
    })

    const reviewThreads = response.repository.pullRequest.reviewThreads
    for (const node of reviewThreads.nodes ?? []) {
      const commentDatabaseId = node.comments?.nodes?.[0]?.databaseId ?? null
      threads.push({
        id: node.id,
        isResolved: node.isResolved,
        commentDatabaseId,
      })
    }

    hasNextPage = reviewThreads.pageInfo.hasNextPage
    cursor = reviewThreads.pageInfo.endCursor
  }

  return threads
}

export async function replyToThread(
  client: GitHubClient,
  threadId: string,
  body: string,
): Promise<void> {
  await client.graphql(ADD_REPLY, {
    threadId,
    body,
  })
}

export async function resolveThread(client: GitHubClient, threadId: string): Promise<void> {
  await client.graphql(RESOLVE_THREAD, { threadId })
}

export async function replyAndResolve(
  client: GitHubClient,
  threadId: string,
  body: string,
): Promise<void> {
  await replyToThread(client, threadId, body)
  await resolveThread(client, threadId)
}

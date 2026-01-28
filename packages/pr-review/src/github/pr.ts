import type { GitHubClient } from "./client"
import type { PRData, PRContext } from "./types"

// GraphQL query for PR data (from opencode github.ts)
const PR_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      title
      body
      author { login }
      baseRefName
      headRefName
      baseRefOid
      headRefOid
      createdAt
      additions
      deletions
      state
      commits(first: 100) {
        totalCount
        nodes {
          commit {
            oid
            message
            author { name email }
          }
        }
      }
      files(first: 100) {
        nodes {
          path
          additions
          deletions
          changeType
        }
      }
      comments(first: 100) {
        nodes {
          id
          databaseId
          body
          author { login }
          createdAt
        }
      }
      reviews(first: 100) {
        nodes {
          id
          databaseId
          author { login }
          body
          state
          submittedAt
        }
      }
    }
  }
}
`

type PRQueryResponse = {
  repository: {
    pullRequest: {
      title: string
      body: string
      author: { login: string }
      baseRefName: string
      headRefName: string
      baseRefOid: string
      headRefOid: string
      createdAt: string
      additions: number
      deletions: number
      state: string
      commits: {
        totalCount: number
        nodes: Array<{
          commit: {
            oid: string
            message: string
            author: { name: string; email: string }
          }
        }>
      }
      files: {
        nodes: Array<{
          path: string
          additions: number
          deletions: number
          changeType: string
        }>
      }
      comments: {
        nodes: Array<{
          id: string
          databaseId: string
          body: string
          author: { login: string }
          createdAt: string
        }>
      }
      reviews: {
        nodes: Array<{
          id: string
          databaseId: string
          author: { login: string }
          body: string
          state: string
          submittedAt: string
        }>
      }
    }
  }
}

/**
 * Fetch full PR data via GraphQL
 */
export async function fetchPR(client: GitHubClient, prNumber: number): Promise<PRData> {
  const result = await client.graphql<PRQueryResponse>(PR_QUERY, {
    owner: client.owner,
    repo: client.repo,
    number: prNumber,
  })

  const pr = result.repository.pullRequest
  if (!pr) {
    throw new Error(`PR #${prNumber} not found`)
  }

  return {
    owner: client.owner,
    repo: client.repo,
    number: prNumber,
    title: pr.title,
    body: pr.body || "",
    author: pr.author.login,
    baseSha: pr.baseRefOid,
    headSha: pr.headRefOid,
    baseRef: pr.baseRefName,
    headRef: pr.headRefName,
    additions: pr.additions,
    deletions: pr.deletions,
    state: pr.state,
    createdAt: pr.createdAt,
    commits: pr.commits.nodes.map((n) => ({
      oid: n.commit.oid,
      message: n.commit.message,
      author: n.commit.author,
    })),
    files: pr.files.nodes,
    comments: pr.comments.nodes.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author.login,
      createdAt: c.createdAt,
    })),
    reviews: pr.reviews.nodes.map((r) => ({
      id: parseInt(r.databaseId),
      author: r.author.login,
      body: r.body,
      state: r.state,
      submittedAt: r.submittedAt,
    })),
  }
}

/**
 * Get PR diff via REST API
 */
export async function fetchPRDiff(client: GitHubClient, prNumber: number): Promise<string> {
  const { data } = await client.rest.pulls.get({
    owner: client.owner,
    repo: client.repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  })
  // When format is "diff", data is a string
  return data as unknown as string
}

/**
 * Get minimal PR context from GitHub Actions environment
 */
export function getPRContextFromEnv(): PRContext | null {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) return null

  try {
    const fs = require("fs")
    const event = JSON.parse(fs.readFileSync(eventPath, "utf-8"))
    const pr = event.pull_request
    if (!pr) return null

    const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/")

    return {
      owner,
      repo,
      number: pr.number,
      title: pr.title,
      body: pr.body || "",
      author: pr.user.login,
      baseSha: pr.base.sha,
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      headRef: pr.head.ref,
    }
  } catch {
    return null
  }
}

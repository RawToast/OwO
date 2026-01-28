import { Octokit } from "@octokit/rest"
import { graphql } from "@octokit/graphql"

export type GitHubClient = {
  rest: Octokit
  graphql: typeof graphql
  owner: string
  repo: string
}

/**
 * Create GitHub client from token
 */
export function createGitHubClient(options: {
  token: string
  owner: string
  repo: string
}): GitHubClient {
  const rest = new Octokit({ auth: options.token })
  const gql = graphql.defaults({
    headers: { authorization: `token ${options.token}` },
  })

  return {
    rest,
    graphql: gql,
    owner: options.owner,
    repo: options.repo,
  }
}

/**
 * Get token from environment
 */
export function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required")
  }
  return token
}

/**
 * Parse owner/repo from GITHUB_REPOSITORY env var
 */
export function parseGitHubRepository(): { owner: string; repo: string } {
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) {
    throw new Error("GITHUB_REPOSITORY environment variable is required")
  }
  const [owner, repo] = repository.split("/")
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY format: ${repository}`)
  }
  return { owner, repo }
}

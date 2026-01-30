import type { GitHubClient } from "./client"
import type { Review, ExistingReview } from "./types"

const REVIEW_MARKER = "<!-- owo-pr-review -->"
const COMMENT_MARKER = "<!-- owo-comment -->"

export function getReviewMarker(): string {
  return REVIEW_MARKER
}

export function getCommentMarker(): string {
  return COMMENT_MARKER
}

export async function findExistingReview(
  client: GitHubClient,
  prNumber: number,
): Promise<ExistingReview | null> {
  try {
    const { data: reviews } = await client.rest.pulls.listReviews({
      owner: client.owner,
      repo: client.repo,
      pull_number: prNumber,
      per_page: 100,
    })

    const ourReview = reviews.find((r) => r.body?.includes(REVIEW_MARKER))
    if (!ourReview) return null

    const { data: allComments } = await client.rest.pulls.listReviewComments({
      owner: client.owner,
      repo: client.repo,
      pull_number: prNumber,
      per_page: 100,
    })

    const reviewComments = allComments.filter((c) => c.pull_request_review_id === ourReview.id)

    return {
      id: ourReview.id,
      commentIds: reviewComments.map((c) => c.id),
    }
  } catch (error) {
    console.error("[pr-review] Error finding existing review:", error)
    return null
  }
}

export async function deleteReviewComments(
  client: GitHubClient,
  commentIds: number[],
): Promise<void> {
  await Promise.all(
    commentIds.map((id) =>
      client.rest.pulls
        .deleteReviewComment({
          owner: client.owner,
          repo: client.repo,
          comment_id: id,
        })
        .catch((err) => {
          console.warn(`[pr-review] Failed to delete comment ${id}:`, err.message)
        }),
    ),
  )
}

export async function updateReviewBody(
  client: GitHubClient,
  prNumber: number,
  reviewId: number,
  body: string,
): Promise<void> {
  await client.rest.pulls.updateReview({
    owner: client.owner,
    repo: client.repo,
    pull_number: prNumber,
    review_id: reviewId,
    body,
  })
}

export async function addReviewComments(
  client: GitHubClient,
  prNumber: number,
  commitId: string,
  comments: Array<{
    path: string
    line: number
    body: string
    side: "LEFT" | "RIGHT"
    start_line?: number
    start_side?: "LEFT" | "RIGHT"
  }>,
): Promise<void> {
  for (const comment of comments) {
    try {
      await client.rest.pulls.createReviewComment({
        owner: client.owner,
        repo: client.repo,
        pull_number: prNumber,
        commit_id: commitId,
        path: comment.path,
        line: comment.line,
        side: comment.side,
        ...(comment.start_line && {
          start_line: comment.start_line,
          start_side: comment.start_side || comment.side,
        }),
        body: `${COMMENT_MARKER}\n${comment.body}`,
      })
    } catch (err: any) {
      const lineRange = comment.start_line
        ? `${comment.start_line}-${comment.line}`
        : `${comment.line}`
      console.warn(
        `[pr-review] Failed to add comment on ${comment.path}:${lineRange}:`,
        err.message,
      )
    }
  }
}

export async function submitReview(
  client: GitHubClient,
  prNumber: number,
  commitId: string,
  review: Review,
  mappedComments: Array<{
    path: string
    line: number
    body: string
    side: "LEFT" | "RIGHT"
    start_line?: number
    start_side?: "LEFT" | "RIGHT"
  }>,
): Promise<{ reviewId: number; reviewUrl: string; isUpdate: boolean }> {
  const body = `${review.overview}\n\n${REVIEW_MARKER}\n---\n*Reviewed by [owo-pr-review](https://github.com/RawToast/owo) | ${mappedComments.length} inline comments*`

  const existing = await findExistingReview(client, prNumber)

  if (existing) {
    if (existing.commentIds.length > 0) {
      await deleteReviewComments(client, existing.commentIds)
    }

    await updateReviewBody(client, prNumber, existing.id, body)

    if (mappedComments.length > 0) {
      await addReviewComments(client, prNumber, commitId, mappedComments)
    }

    return {
      reviewId: existing.id,
      reviewUrl: `https://github.com/${client.owner}/${client.repo}/pull/${prNumber}#pullrequestreview-${existing.id}`,
      isUpdate: true,
    }
  }

  const { data } = await client.rest.pulls.createReview({
    owner: client.owner,
    repo: client.repo,
    pull_number: prNumber,
    commit_id: commitId,
    body,
    event: review.event,
    comments: mappedComments.map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side,
      ...(c.start_line && {
        start_line: c.start_line,
        start_side: c.start_side || c.side,
      }),
      body: `${COMMENT_MARKER}\n${c.body}`,
    })),
  })

  return {
    reviewId: data.id,
    reviewUrl: `https://github.com/${client.owner}/${client.repo}/pull/${prNumber}#pullrequestreview-${data.id}`,
    isUpdate: false,
  }
}

import { z } from "zod"

/**
 * PR metadata from GitHub context
 */
export type PRContext = {
  owner: string
  repo: string
  number: number
  baseSha: string
  headSha: string
  baseRef: string
  headRef: string
  title: string
  body: string
  author: string
}

/**
 * File change information
 */
export type FileChange = {
  path: string
  status: "added" | "modified" | "removed" | "renamed"
  additions: number
  deletions: number
  patch?: string
}

/**
 * Inline comment to post
 */
export const InlineCommentSchema = z.object({
  path: z.string().describe("File path relative to repo root"),
  line: z.number().describe("Line number in the NEW version of the file"),
  body: z.string().describe("Comment content (markdown supported)"),
  side: z.enum(["LEFT", "RIGHT"]).default("RIGHT").describe("Which side of diff"),
})

export type InlineComment = z.infer<typeof InlineCommentSchema>

/**
 * Review submission input
 */
export const ReviewInputSchema = z.object({
  overview: z.string().describe("Markdown overview comment for the PR"),
  comments: z.array(InlineCommentSchema).default([]).describe("Inline comments on specific lines"),
  event: z.enum(["COMMENT", "APPROVE", "REQUEST_CHANGES"]).default("COMMENT"),
})

export type ReviewInput = z.infer<typeof ReviewInputSchema>

/**
 * Diff position mapping result
 */
export type PositionMapping = {
  path: string
  line: number
  position: number | null // null if line not in diff
  side: "LEFT" | "RIGHT"
}

/**
 * Existing review found on the PR
 */
export type ExistingReview = {
  id: number
  commentIds: number[]
}

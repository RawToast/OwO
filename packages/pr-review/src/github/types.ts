import { z } from "zod"

/**
 * PR context - minimal info needed to review
 */
export type PRContext = {
  owner: string
  repo: string
  number: number
  title: string
  body: string
  author: string
  baseSha: string
  headSha: string
  baseRef: string
  headRef: string
}

/**
 * Full PR data from GraphQL
 */
export type PRData = PRContext & {
  additions: number
  deletions: number
  state: string
  createdAt: string
  commits: Array<{
    oid: string
    message: string
    author: { name: string; email: string }
  }>
  files: Array<{
    path: string
    additions: number
    deletions: number
    changeType: string
  }>
  comments: Array<{
    id: string
    body: string
    author: string
    createdAt: string
  }>
  reviews: Array<{
    id: number
    author: string
    body: string
    state: string
    submittedAt: string
  }>
}

/**
 * Inline comment for review
 */
export const InlineCommentSchema = z.object({
  path: z.string().describe("File path relative to repo root"),
  line: z.number().describe("Line number (end line for multi-line ranges)"),
  body: z.string().describe("Comment content (markdown supported)"),
  side: z.enum(["LEFT", "RIGHT"]).default("RIGHT").describe("Which side of diff"),
  start_line: z.number().optional().describe("Start line for multi-line comment range"),
  start_side: z
    .enum(["LEFT", "RIGHT"])
    .optional()
    .describe("Side for start line (defaults to same as side)"),
})

export type InlineComment = z.infer<typeof InlineCommentSchema>

/**
 * Review to submit
 */
export const ReviewSchema = z.object({
  overview: z.string().describe("Markdown overview/summary"),
  comments: z.array(InlineCommentSchema).default([]),
  event: z.enum(["COMMENT", "APPROVE", "REQUEST_CHANGES"]).default("COMMENT"),
})

export type Review = z.infer<typeof ReviewSchema>

/**
 * Existing review on PR (for updates)
 */
export type ExistingReview = {
  id: number
  commentIds: number[]
}

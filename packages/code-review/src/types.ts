/**
 * Code Review Plugin Types
 */

import type { CodeReviewConfig, ReviewerConfig } from "@owo/config"

export type ReviewMode = "vs-main" | "unstaged" | "staged" | "commits"

export type ReviewInput = {
  query: string
  mode: ReviewMode
  refs?: string[]
}

export type ReviewerResult = {
  agent: string
  focus?: string
  output: string
  sessionID: string
  duration: number
}

export type ReviewResult = {
  input: ReviewInput
  diff: string
  reviewers: ReviewerResult[]
  verifyGuidance?: string
  outputTemplate?: string
  totalDuration: number
}

export { CodeReviewConfig, ReviewerConfig }

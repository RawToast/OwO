import { z } from "zod"

/**
 * Single reviewer configuration
 */
export const ReviewerConfigSchema = z.object({
  name: z.string().describe("Reviewer identifier (e.g., 'security', 'quality')"),
  prompt: z.string().optional().describe("Inline prompt text (alternative to promptFile)"),
  promptFile: z.string().optional().describe("Path to prompt file relative to repo root"),
  focus: z.string().optional().describe("Short focus description"),
  model: z.string().optional().describe("Model override for this reviewer"),
  enabled: z.boolean().default(true),
})

export type ReviewerConfig = z.infer<typeof ReviewerConfigSchema>

/**
 * Severity level for filtering
 */
export const SeverityLevelSchema = z.enum(["critical", "warning", "info"])
export type SeverityLevel = z.infer<typeof SeverityLevelSchema>

/**
 * Verifier/Synthesizer configuration
 */
export const VerifierConfigSchema = z.object({
  prompt: z.string().optional(),
  promptFile: z.string().optional(),
  model: z.string().optional(),
  enabled: z.boolean().default(true),
  level: SeverityLevelSchema.optional()
    .default("info")
    .describe(
      "Minimum severity level to include in final review (critical=only critical, warning=critical+warning, info=all)",
    ),
})

export type VerifierConfig = z.infer<typeof VerifierConfigSchema>

/**
 * Main PR review configuration
 */
export const PRReviewConfigSchema = z.object({
  version: z.literal(1).default(1),
  reviewers: z.array(ReviewerConfigSchema).default([]),
  verifier: VerifierConfigSchema.optional(),
  defaults: z
    .object({
      model: z.string().optional(),
    })
    .optional(),
})

export type PRReviewConfig = z.infer<typeof PRReviewConfigSchema>

/**
 * Review output from a single reviewer
 */
export type ReviewerOutput = {
  name: string
  success: boolean
  review?: {
    overview: string
    comments: Array<{
      path: string
      line: number
      body: string
      side: "LEFT" | "RIGHT"
      severity?: "critical" | "warning" | "info"
    }>
  }
  error?: string
  durationMs: number
}

/**
 * Final synthesized review
 */
export type SynthesizedReview = {
  overview: string
  comments: Array<{
    path: string
    line: number
    body: string
    side: "LEFT" | "RIGHT"
    severity: "critical" | "warning" | "info"
    reviewer: string
  }>
  summary: {
    totalReviewers: number
    successfulReviewers: number
    criticalIssues: number
    warnings: number
    infos: number
  }
  passed: boolean
}

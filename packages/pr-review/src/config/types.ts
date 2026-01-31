import { z } from "zod"

/**
 * Single reviewer configuration
 */
export const ReviewerConfigSchema = z.object({
  name: z.string().describe("Reviewer identifier (e.g., 'security', 'quality')"),
  prompt: z.string().optional().describe("Inline prompt text (alternative to promptFile)"),
  promptFile: z.string().optional().describe("Path to prompt file relative to repo root"),
  focus: z.string().optional().describe("Short focus description"),
  model: z
    .string()
    .regex(
      /^[^/]+\/[^/]+$/,
      "Model must be in 'provider/model' format (e.g., 'anthropic/claude-sonnet-4-20250514')",
    )
    .optional()
    .describe("Model override for this reviewer"),
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
  model: z
    .string()
    .regex(/^[^/]+\/[^/]+$/, "Model must be in 'provider/model' format")
    .optional(),
  enabled: z.boolean().default(true),
  level: SeverityLevelSchema.optional()
    .default("info")
    .describe(
      "Minimum severity level to include in final review (critical=only critical, warning=critical+warning, info=all)",
    ),
  diagrams: z.boolean().default(true).describe("Generate mermaid diagrams in the review"),
})

export type VerifierConfig = z.infer<typeof VerifierConfigSchema>

/**
 * Resolution checking configuration
 */
export const ResolutionTriggerSchema = z.enum(["first-push", "all-pushes", "on-request"])
export type ResolutionTrigger = z.infer<typeof ResolutionTriggerSchema>

export const ResolutionConfigSchema = z.object({
  enabled: z.boolean().default(true).describe("Enable/disable resolution checking"),
  trigger: ResolutionTriggerSchema.default("first-push").describe("When to run resolution checks"),
  model: z
    .string()
    .regex(/^[^/]+\/[^/]+$/, "Model must be in 'provider/model' format")
    .optional()
    .describe("Model for resolution agent (recommend cheap/fast like Haiku)"),
  prompt: z.string().optional().describe("Custom resolution prompt"),
  promptFile: z.string().optional().describe("Path to custom prompt file"),
})

export type ResolutionConfig = z.infer<typeof ResolutionConfigSchema>

/**
 * Main PR review configuration
 */
export const PRReviewConfigSchema = z.object({
  version: z.literal(1).default(1),
  reviewers: z.array(ReviewerConfigSchema).default([]),
  verifier: VerifierConfigSchema.optional(),
  resolution: ResolutionConfigSchema.optional(),
  defaults: z
    .object({
      model: z
        .string()
        .regex(/^[^/]+\/[^/]+$/, "Model must be in 'provider/model' format")
        .optional(),
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
      start_line?: number
      start_side?: "LEFT" | "RIGHT"
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
    start_line?: number
    start_side?: "LEFT" | "RIGHT"
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

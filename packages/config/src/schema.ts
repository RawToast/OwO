import { z } from "zod"

/**
 * Context can be inline string OR file reference
 * - string: inline content
 * - { file: "path" }: load from file relative to config
 */
export const ContextSchema = z.union([z.string(), z.object({ file: z.string() })])

export type Context = z.infer<typeof ContextSchema>

/**
 * Toast notification configuration
 */
export const ToastConfigSchema = z.object({
  title: z.string(),
  message: z.string(),
})

export type ToastConfig = z.infer<typeof ToastConfigSchema>

/**
 * Keyword pattern configuration for keyword-detector plugin
 * No defaults - user defines everything in config
 */
export const KeywordPatternSchema = z.object({
  type: z.string(),
  pattern: z.string(),
  flags: z.string().optional().default("i"),
  context: ContextSchema,
  toast: ToastConfigSchema,
})

export type KeywordPattern = z.infer<typeof KeywordPatternSchema>

/**
 * Keyword detector configuration
 */
export const KeywordDetectorConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  patterns: z.array(KeywordPatternSchema).optional().default([]),
})

export type KeywordDetectorConfig = z.infer<typeof KeywordDetectorConfigSchema>

/**
 * Prompt template configuration for prompt-injector plugin
 * Agent names are open strings - user defines their own
 */
export const PromptTemplateSchema = z.object({
  flair: ContextSchema.optional(),
  sections: z.array(z.string()).optional(),
})

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>

export const PromptInjectorConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  agents: z.record(z.string(), PromptTemplateSchema).optional(),
  templates: z.record(z.string(), ContextSchema).optional(),
})

export type PromptInjectorConfig = z.infer<typeof PromptInjectorConfigSchema>

/**
 * Orchestration configuration
 */
export const OrchestrationConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  toasts: z.boolean().optional().default(true),
})

export type OrchestrationConfig = z.infer<typeof OrchestrationConfigSchema>

/**
 * Single reviewer configuration
 * Uses an existing agent with optional focus/context overrides
 */
export const ReviewerConfigSchema = z.object({
  agent: z.string().describe("Agent name to use for review (e.g., oracle, explorer)"),
  focus: z.string().optional().describe("Short focus instruction to steer the review"),
  context: ContextSchema.optional().describe("File with additional review instructions"),
})

export type ReviewerConfig = z.infer<typeof ReviewerConfigSchema>

/**
 * Verify step configuration
 */
export const ReviewVerifyConfigSchema = z.object({
  guidance: z.union([z.string(), ContextSchema]).optional().describe("Instructions for verification step"),
})

export type ReviewVerifyConfig = z.infer<typeof ReviewVerifyConfigSchema>

/**
 * Output formatting configuration
 */
export const ReviewOutputConfigSchema = z.object({
  template: ContextSchema.optional().describe("Template file with formatting instructions"),
})

export type ReviewOutputConfig = z.infer<typeof ReviewOutputConfigSchema>

/**
 * Code review plugin configuration
 */
export const CodeReviewConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  reviewers: z
    .array(ReviewerConfigSchema)
    .min(1)
    .max(2)
    .optional()
    .default([{ agent: "oracle" }])
    .describe("1-2 reviewer configurations"),
  verify: ReviewVerifyConfigSchema.optional(),
  output: ReviewOutputConfigSchema.optional(),
})

export type CodeReviewConfig = z.infer<typeof CodeReviewConfigSchema>

/**
 * Main unified configuration schema for all owo packages
 * Minimal - only package-specific sections, no agents/tools/flair at root
 */
export const OwoConfigSchema = z.object({
  $schema: z.string().optional(),
  keywords: KeywordDetectorConfigSchema.optional(),
  prompts: PromptInjectorConfigSchema.optional(),
  orchestration: OrchestrationConfigSchema.optional(),
  review: CodeReviewConfigSchema.optional(),
})

export type OwoConfig = z.infer<typeof OwoConfigSchema>

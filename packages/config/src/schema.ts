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
  context: z.array(ContextSchema),
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
  context: z.array(ContextSchema).optional(),
})

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>

export const PromptInjectorConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  agents: z.record(z.string(), PromptTemplateSchema).optional(),
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
  context: z.array(ContextSchema).optional().describe("Additional review instructions"),
})

export type ReviewerConfig = z.infer<typeof ReviewerConfigSchema>

/**
 * Verify step configuration
 */
export const ReviewVerifyConfigSchema = z.object({
  guidance: z.array(ContextSchema).optional().describe("Instructions for verification step"),
})

export type ReviewVerifyConfig = z.infer<typeof ReviewVerifyConfigSchema>

/**
 * Output formatting configuration
 */
export const ReviewOutputConfigSchema = z.object({
  template: z.array(ContextSchema).optional().describe("Template with formatting instructions"),
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
 * Model configuration for AI providers
 * Format: "provider/model" (e.g., "anthropic/claude-sonnet-4-5", "openai/gpt-4o")
 */
export const ModelConfigSchema = z.object({
  model: z
    .string()
    .optional()
    .describe("Model in provider/model format (e.g., anthropic/claude-sonnet-4-5)"),
  variant: z
    .enum(["low", "default", "high"])
    .optional()
    .default("default")
    .describe("Thinking level / variant"),
})

export type ModelConfig = z.infer<typeof ModelConfigSchema>

/**
 * Single GitHub reviewer configuration
 * Uses ContextSchema for prompts (supports inline strings or file references)
 */
export const GitHubReviewerConfigSchema = ModelConfigSchema.extend({
  name: z.string().describe("Reviewer identifier (e.g., 'security', 'quality')"),
  context: z
    .array(ContextSchema)
    .optional()
    .describe("Reviewer prompt/instructions (inline or file reference)"),
  focus: z.string().optional().describe("Short focus area (e.g., 'security', 'performance')"),
})

export type GitHubReviewerConfig = z.infer<typeof GitHubReviewerConfigSchema>

/**
 * GitHub review overview configuration
 * Uses ContextSchema for the synthesizer prompt
 */
export const GitHubReviewOverviewConfigSchema = ModelConfigSchema.extend({
  context: z
    .array(ContextSchema)
    .optional()
    .describe("Overview synthesizer prompt (inline or file reference)"),
  includeDiagram: z.boolean().optional().default(true).describe("Include mermaid diagram"),
  includeTable: z.boolean().optional().default(true).describe("Include changes table"),
})

export type GitHubReviewOverviewConfig = z.infer<typeof GitHubReviewOverviewConfigSchema>

/**
 * Default model settings for GitHub review
 */
export const GitHubReviewDefaultsSchema = ModelConfigSchema.extend({})

export type GitHubReviewDefaults = z.infer<typeof GitHubReviewDefaultsSchema>

/**
 * GitHub PR review plugin configuration
 */
export const GitHubReviewConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  trigger: z
    .enum(["auto", "command"])
    .optional()
    .default("command")
    .describe("'auto' reviews all PRs, 'command' waits for /review"),
  mentions: z
    .array(z.string())
    .optional()
    .default(["/review", "/oc-review"])
    .describe("Trigger phrases for command mode"),
  reviewers: z
    .array(GitHubReviewerConfigSchema)
    .optional()
    .default([{ name: "default", focus: "general code quality" }])
    .describe("Reviewer configurations (parallel in Phase 3)"),
  overview: GitHubReviewOverviewConfigSchema.optional(),
  defaults: GitHubReviewDefaultsSchema.optional().describe(
    "Default model settings for all reviewers",
  ),
})

export type GitHubReviewConfig = z.infer<typeof GitHubReviewConfigSchema>

/**
 * Base tool configuration (enabled + optional API key)
 */
export const BaseToolConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
  key: z.string().optional().describe("API key (prefer env var instead)"),
})

export type BaseToolConfig = z.infer<typeof BaseToolConfigSchema>

/**
 * Exa web search tool config
 */
export const ExaToolConfigSchema = BaseToolConfigSchema.extend({})

export type ExaToolConfig = z.infer<typeof ExaToolConfigSchema>

/**
 * Context7 library docs tool config
 */
export const Context7ToolConfigSchema = BaseToolConfigSchema.extend({})

export type Context7ToolConfig = z.infer<typeof Context7ToolConfigSchema>

/**
 * Jira issue tracking tool config
 */
export const JiraToolConfigSchema = BaseToolConfigSchema.extend({
  cloudId: z.string().optional().describe("Jira Cloud ID"),
  email: z.string().optional().describe("Jira account email"),
})

export type JiraToolConfig = z.infer<typeof JiraToolConfigSchema>

/**
 * CodeRabbit code review tool config
 */
export const CodeRabbitToolConfigSchema = BaseToolConfigSchema.extend({})

export type CodeRabbitToolConfig = z.infer<typeof CodeRabbitToolConfigSchema>

/**
 * grep.app GitHub code search tool config (no API key needed!)
 */
export const GrepAppToolConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
})

export type GrepAppToolConfig = z.infer<typeof GrepAppToolConfigSchema>

/**
 * All tools configuration
 */
export const ToolsConfigSchema = z.object({
  exa: ExaToolConfigSchema.optional(),
  context7: Context7ToolConfigSchema.optional(),
  jira: JiraToolConfigSchema.optional(),
  coderabbit: CodeRabbitToolConfigSchema.optional(),
  grep_app: GrepAppToolConfigSchema.optional(),
})

export type ToolsConfig = z.infer<typeof ToolsConfigSchema>

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
  "github-review": GitHubReviewConfigSchema.optional(),
  tools: ToolsConfigSchema.optional(),
})

export type OwoConfig = z.infer<typeof OwoConfigSchema>

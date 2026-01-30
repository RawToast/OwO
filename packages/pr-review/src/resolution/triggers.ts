import { match, P } from "ts-pattern"

/**
 * Events that can trigger resolution checking
 */
export type TriggerEvent = "pr-opened" | "pr-push" | "comment-request"

/**
 * Configuration for when resolution should run
 * Re-export from types for convenience
 */
export type TriggerConfig = "first-push" | "all-pushes" | "on-request"

/**
 * Context for detecting trigger events
 */
export type TriggerContext = {
  action?: string // GitHub event action: "opened", "synchronize", "created"
  commentBody?: string // Comment body if action is "created"
}

/**
 * Check if a comment body is a review request
 *
 * Returns true if body contains `@owo review` or `/owo review` (case insensitive)
 */
export function isReviewRequest(body?: string): boolean {
  if (!body) {
    return false
  }

  const normalized = body.toLowerCase()
  return normalized.includes("@owo review") || normalized.includes("/owo review")
}

/**
 * Detect what triggered the review based on GitHub event context
 *
 * @param context - GitHub event context
 * @returns The trigger event type, or null if not recognized
 */
export function detectTriggerEvent(context: TriggerContext): TriggerEvent | null {
  return match(context)
    .with({ action: "opened" }, () => "pr-opened" as const)
    .with({ action: "synchronize" }, () => "pr-push" as const)
    .with({ action: "created" }, ({ commentBody }) =>
      isReviewRequest(commentBody) ? ("comment-request" as const) : null,
    )
    .otherwise(() => null)
}

/**
 * Determine if resolution checking should run based on trigger and config
 *
 * Uses exhaustive pattern matching to ensure all cases are handled.
 *
 * Logic:
 * - pr-opened: Never run (no old comments yet)
 * - comment-request: Always run (explicit user request)
 * - pr-push + all-pushes: Run
 * - pr-push + first-push/on-request: Don't run
 */
export function shouldRunResolution(trigger: TriggerEvent, config: TriggerConfig): boolean {
  return match({ trigger, config })
    .with({ trigger: "pr-opened" }, () => false) // No old comments yet
    .with({ trigger: "comment-request" }, () => true) // Always run on request
    .with({ trigger: "pr-push", config: "all-pushes" }, () => true)
    .with({ trigger: "pr-push", config: P.union("first-push", "on-request") }, () => false)
    .exhaustive()
}

import { describe, expect, test } from "bun:test"
import {
  detectTriggerEvent,
  isReviewRequest,
  shouldRunResolution,
  type TriggerConfig,
  type TriggerEvent,
} from "../../src/resolution/triggers"

describe("resolution/triggers", () => {
  describe("isReviewRequest", () => {
    test("returns true for @owo review", () => {
      expect(isReviewRequest("@owo review")).toBe(true)
    })

    test("returns true for /owo review", () => {
      expect(isReviewRequest("/owo review")).toBe(true)
    })

    test("is case insensitive", () => {
      expect(isReviewRequest("@OWO REVIEW")).toBe(true)
      expect(isReviewRequest("/Owo Review")).toBe(true)
      expect(isReviewRequest("@OwO rEvIeW")).toBe(true)
    })

    test("returns true when keyword is part of larger text", () => {
      expect(isReviewRequest("Hey, can you @owo review this PR?")).toBe(true)
      expect(isReviewRequest("Running /owo review now")).toBe(true)
    })

    test("returns false for undefined", () => {
      expect(isReviewRequest(undefined)).toBe(false)
    })

    test("returns false for empty string", () => {
      expect(isReviewRequest("")).toBe(false)
    })

    test("returns false for unrelated comments", () => {
      expect(isReviewRequest("LGTM!")).toBe(false)
      expect(isReviewRequest("Please review this")).toBe(false)
      expect(isReviewRequest("@someone review")).toBe(false)
    })

    test("returns false for partial matches", () => {
      expect(isReviewRequest("@owo")).toBe(false)
      expect(isReviewRequest("/owo")).toBe(false)
      expect(isReviewRequest("review")).toBe(false)
    })
  })

  describe("detectTriggerEvent", () => {
    test("returns pr-opened for action=opened", () => {
      expect(detectTriggerEvent({ action: "opened" })).toBe("pr-opened")
    })

    test("returns pr-push for action=synchronize", () => {
      expect(detectTriggerEvent({ action: "synchronize" })).toBe("pr-push")
    })

    test("returns comment-request for action=created with review request", () => {
      expect(detectTriggerEvent({ action: "created", commentBody: "@owo review" })).toBe(
        "comment-request",
      )
    })

    test("returns null for action=created without review request", () => {
      expect(detectTriggerEvent({ action: "created", commentBody: "LGTM" })).toBe(null)
    })

    test("returns null for action=created with undefined comment", () => {
      expect(detectTriggerEvent({ action: "created" })).toBe(null)
    })

    test("returns null for unknown actions", () => {
      expect(detectTriggerEvent({ action: "closed" })).toBe(null)
      expect(detectTriggerEvent({ action: "labeled" })).toBe(null)
      expect(detectTriggerEvent({ action: "assigned" })).toBe(null)
    })

    test("returns null for empty context", () => {
      expect(detectTriggerEvent({})).toBe(null)
    })

    test("returns null for undefined action", () => {
      expect(detectTriggerEvent({ action: undefined })).toBe(null)
    })
  })

  describe("shouldRunResolution", () => {
    describe("pr-opened trigger", () => {
      test("returns false regardless of config", () => {
        const configs: TriggerConfig[] = ["first-push", "all-pushes", "on-request"]
        for (const config of configs) {
          expect(shouldRunResolution("pr-opened", config)).toBe(false)
        }
      })
    })

    describe("comment-request trigger", () => {
      test("returns true regardless of config", () => {
        const configs: TriggerConfig[] = ["first-push", "all-pushes", "on-request"]
        for (const config of configs) {
          expect(shouldRunResolution("comment-request", config)).toBe(true)
        }
      })
    })

    describe("pr-push trigger", () => {
      test("returns true with all-pushes config", () => {
        expect(shouldRunResolution("pr-push", "all-pushes")).toBe(true)
      })

      test("returns false with first-push config", () => {
        expect(shouldRunResolution("pr-push", "first-push")).toBe(false)
      })

      test("returns false with on-request config", () => {
        expect(shouldRunResolution("pr-push", "on-request")).toBe(false)
      })
    })

    describe("exhaustive matching", () => {
      test("all trigger/config combinations are handled", () => {
        const triggers: TriggerEvent[] = ["pr-opened", "pr-push", "comment-request"]
        const configs: TriggerConfig[] = ["first-push", "all-pushes", "on-request"]

        // This test ensures every combination returns a boolean without throwing
        for (const trigger of triggers) {
          for (const config of configs) {
            const result = shouldRunResolution(trigger, config)
            expect(typeof result).toBe("boolean")
          }
        }
      })
    })
  })
})

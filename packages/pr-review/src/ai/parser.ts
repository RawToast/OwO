import { ReviewSchema, type Review } from "../github/types"

/**
 * Parse AI response to Review format
 */
export function parseReviewResponse(response: string): Review {
  // Try to extract JSON from response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : response

  try {
    const parsed = JSON.parse(jsonStr.trim())
    return ReviewSchema.parse(parsed)
  } catch {
    // If parsing fails, treat entire response as overview
    console.warn("[pr-review] Failed to parse JSON response, using as overview")
    return {
      overview: response,
      comments: [],
      event: "COMMENT",
    }
  }
}

/**
 * Validate that comments reference valid files
 */
export function validateComments(
  review: Review,
  validPaths: string[],
): { valid: Review; warnings: string[] } {
  const warnings: string[] = []
  const validComments = review.comments.filter((c) => {
    if (!validPaths.includes(c.path)) {
      warnings.push(`Comment references unknown file: ${c.path}`)
      return false
    }
    return true
  })

  return {
    valid: { ...review, comments: validComments },
    warnings,
  }
}

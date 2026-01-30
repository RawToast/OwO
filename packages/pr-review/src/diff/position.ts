import parseDiff from "parse-diff"
import type { InlineComment } from "../github/types"

type ValidationResult = {
  valid: boolean
  reason?: string
}

/**
 * Check if a line (or line range) exists in the diff for a given file
 *
 * With modern GitHub API, we use actual line numbers (not diff positions).
 * This function validates that the lines exist in the diff.
 */
export function validateCommentLines(
  diffContent: string,
  filePath: string,
  line: number,
  side: "LEFT" | "RIGHT",
  startLine?: number,
  startSide?: "LEFT" | "RIGHT",
): ValidationResult {
  const files = parseDiff(diffContent)

  const file = files.find((f) => {
    const toPath = f.to?.replace(/^b\//, "")
    const fromPath = f.from?.replace(/^a\//, "")
    return toPath === filePath || fromPath === filePath
  })

  if (!file) {
    return { valid: false, reason: `File ${filePath} not found in diff` }
  }

  // Collect all line numbers present in the diff
  // parse-diff uses:
  // - ln1/ln2 for "normal" changes (context lines)
  // - ln for "add" changes (RIGHT side new line number)
  // - ln for "del" changes (LEFT side old line number)
  const rightLines = new Set<number>()
  const leftLines = new Set<number>()

  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      if (change.type === "add" && "ln" in change) {
        rightLines.add(change.ln)
      } else if (change.type === "del" && "ln" in change) {
        leftLines.add(change.ln)
      } else if (change.type === "normal") {
        if ("ln1" in change) leftLines.add(change.ln1)
        if ("ln2" in change) rightLines.add(change.ln2)
      }
    }
  }

  // Validate end line
  const endLineSet = side === "RIGHT" ? rightLines : leftLines
  if (!endLineSet.has(line)) {
    return { valid: false, reason: `Line ${line} not found in diff (${side} side)` }
  }

  // Validate start line if multi-line
  if (startLine !== undefined) {
    const startLineSet = (startSide || side) === "RIGHT" ? rightLines : leftLines
    if (!startLineSet.has(startLine)) {
      return { valid: false, reason: `Start line ${startLine} not found in diff` }
    }
  }

  return { valid: true }
}

/**
 * Validate and map comments - returns comments with line numbers (no position conversion needed)
 *
 * Unlike the old position-based approach, we just validate lines exist in the diff.
 * The GitHub API now accepts actual line numbers directly.
 */
export function mapCommentsToLines(
  diffContent: string,
  comments: InlineComment[],
): {
  mapped: InlineComment[]
  unmapped: InlineComment[]
} {
  const mapped: InlineComment[] = []
  const unmapped: InlineComment[] = []

  for (const comment of comments) {
    const result = validateCommentLines(
      diffContent,
      comment.path,
      comment.line,
      comment.side,
      comment.start_line,
      comment.start_side,
    )

    if (result.valid) {
      mapped.push(comment)
    } else {
      unmapped.push(comment)
    }
  }

  return { mapped, unmapped }
}

/**
 * @deprecated Use mapCommentsToLines instead. Kept for backward compatibility.
 */
export function mapCommentsToPositions(
  diffContent: string,
  comments: InlineComment[],
): {
  mapped: Array<InlineComment & { position: number }>
  unmapped: InlineComment[]
} {
  const { mapped, unmapped } = mapCommentsToLines(diffContent, comments)

  // For backward compatibility, add a dummy position (not used by modern API)
  return {
    mapped: mapped.map((c, i) => ({ ...c, position: i + 1 })),
    unmapped,
  }
}

/**
 * Format unmapped comments for inclusion in overview
 */
export function formatUnmappedComments(unmapped: InlineComment[]): string {
  if (unmapped.length === 0) return ""

  const commentLines: string[] = []

  for (const comment of unmapped) {
    const lineRange = comment.start_line
      ? `${comment.start_line}-${comment.line}`
      : `${comment.line}`
    commentLines.push(`### \`${comment.path}:${lineRange}\``)
    commentLines.push("")
    commentLines.push(comment.body)
    commentLines.push("")
  }

  const lines = [
    "",
    "<details>",
    `<summary>Additional Notes (${unmapped.length} comments for lines not in diff)</summary>`,
    "",
    ...commentLines,
    "</details>",
  ]

  return lines.join("\n")
}

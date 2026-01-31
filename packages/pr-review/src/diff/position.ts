import parseDiff from "parse-diff"
import type { InlineComment } from "../github/types"

/**
 * Map a file line number to a diff position
 *
 * GitHub API requires "position" which is the line number within the diff hunk,
 * NOT the actual file line number.
 */
export function mapLineToPosition(
  diffContent: string,
  filePath: string,
  lineNumber: number,
  side: "LEFT" | "RIGHT" = "RIGHT",
): number | null {
  const files = parseDiff(diffContent)

  const file = files.find((f) => {
    const toPath = f.to?.replace(/^b\//, "")
    const fromPath = f.from?.replace(/^a\//, "")
    return toPath === filePath || fromPath === filePath
  })

  if (!file) return null

  let position = 0

  for (const chunk of file.chunks) {
    for (const change of chunk.changes) {
      position++

      if (side === "RIGHT") {
        if ((change.type === "add" || change.type === "normal") && "ln2" in change) {
          if (change.ln2 === lineNumber) return position
        }
      } else {
        if ((change.type === "del" || change.type === "normal") && "ln1" in change) {
          if (change.ln1 === lineNumber) return position
        }
      }
    }
  }

  return null
}

/**
 * Map multiple comments to their diff positions
 */
export function mapCommentsToPositions(
  diffContent: string,
  comments: InlineComment[],
): {
  mapped: Array<InlineComment & { position: number }>
  unmapped: InlineComment[]
} {
  const mapped: Array<InlineComment & { position: number }> = []
  const unmapped: InlineComment[] = []

  for (const comment of comments) {
    const position = mapLineToPosition(diffContent, comment.path, comment.line, comment.side)

    if (position !== null) {
      mapped.push({ ...comment, position })
    } else {
      unmapped.push(comment)
    }
  }

  return { mapped, unmapped }
}

/**
 * Format unmapped comments for inclusion in overview
 */
export function formatUnmappedComments(unmapped: InlineComment[]): string {
  if (unmapped.length === 0) return ""

  const commentLines: string[] = []

  for (const comment of unmapped) {
    commentLines.push(`### \`${comment.path}:${comment.line}\``)
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

/**
 * Annotates unified diff with explicit line numbers for AI reviewers.
 *
 * Lines are prefixed with:
 * - `R{num}| ` for new file lines (RIGHT side) - additions and context
 * - `L{num}| ` for old file lines (LEFT side) - deletions only
 *
 * This helps AI reviewers accurately identify line numbers without
 * having to parse hunk headers and count lines.
 */
export function annotateDiffWithLineNumbers(diff: string): string {
  if (!diff) return ""

  const lines = diff.split("\n")
  const result: string[] = []

  // Track line numbers for current hunk
  let oldLine = 0
  let newLine = 0
  let inHunk = false

  // Regex to parse hunk headers: @@ -oldStart,oldCount +newStart,newCount @@ optional context
  // Also handles single-line format: @@ -5 +5 @@
  const hunkHeaderRegex = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

  for (const line of lines) {
    const hunkMatch = line.match(hunkHeaderRegex)

    if (hunkMatch) {
      // Parse starting line numbers from hunk header
      oldLine = parseInt(hunkMatch[1], 10)
      newLine = parseInt(hunkMatch[2], 10)
      inHunk = true
      result.push(line)
      continue
    }

    // If not in a hunk, pass through unchanged (file headers, binary notices, etc.)
    if (!inHunk) {
      result.push(line)
      continue
    }

    // Check if this line ends the hunk (new file/hunk header or end of diff)
    if (line.startsWith("diff --git ") || line.startsWith("---") || line.startsWith("+++")) {
      inHunk = false
      result.push(line)
      continue
    }

    const prefix = line[0]
    const content = line

    if (prefix === "+") {
      // Addition: use new line number (RIGHT side)
      result.push(`R${newLine}| ${content}`)
      newLine++
    } else if (prefix === "-") {
      // Deletion: use old line number (LEFT side)
      result.push(`L${oldLine}| ${content}`)
      oldLine++
    } else if (prefix === " " || prefix === undefined) {
      // Context line: use new line number (RIGHT side), increment both
      result.push(`R${newLine}| ${content}`)
      oldLine++
      newLine++
    } else {
      // Unknown line type (e.g., "\ No newline at end of file")
      result.push(line)
    }
  }

  return result.join("\n")
}

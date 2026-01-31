import type { PRData } from "../github/types"
import type { FileContext } from "../context/types"
import { annotateDiffWithLineNumbers } from "../diff/annotate"

/**
 * Format file context for inclusion in prompts
 */
export function formatFileContext(files: FileContext[], skippedFiles: string[]): string {
  if (files.length === 0) {
    return ""
  }

  const parts: string[] = []
  parts.push("### Full File Context")
  parts.push("")
  parts.push("The following files are included in full for additional context:")
  parts.push("")

  for (const file of files) {
    const ext = file.path.split(".").pop() || ""
    parts.push("<details>")
    parts.push(`<summary>${file.path} (${Math.round(file.sizeBytes / 1024)}KB)</summary>`)
    parts.push("")
    parts.push("```" + ext)
    parts.push(file.content)
    parts.push("```")
    parts.push("")
    parts.push("</details>")
    parts.push("")
  }

  if (skippedFiles.length > 0) {
    parts.push(`*${skippedFiles.length} files skipped (too large or not found)*`)
    parts.push("")
  }

  return parts.join("\n")
}

/**
 * Build the review prompt for the AI
 */
export function buildReviewPrompt(pr: PRData, diff: string): string {
  const filesTable = pr.files
    .map((f) => `| ${f.path} | +${f.additions}/-${f.deletions} | ${f.changeType} |`)
    .join("\n")

  const annotatedDiff = annotateDiffWithLineNumbers(diff)

  return `You are a senior code reviewer. Review this pull request thoroughly.

## PR Information

**Title:** ${pr.title}
**Author:** ${pr.author}
**Branch:** ${pr.headRef} -> ${pr.baseRef}
**Changes:** +${pr.additions}/-${pr.deletions} lines

### Description
${pr.body || "*No description provided*"}

### Changed Files
| File | Changes | Type |
|------|---------|------|
${filesTable}

### Diff

Lines are prefixed with \`R{num}|\` for new file lines (RIGHT side) and \`L{num}|\` for old file lines (LEFT side).

\`\`\`diff
${annotatedDiff}
\`\`\`

## Your Task

Provide a code review with:

1. **Overview** - A summary of the changes and overall assessment
2. **Inline Comments** - Specific feedback on code lines

## Response Format

Respond with valid JSON in this exact format:
\`\`\`json
{
  "overview": "Your markdown overview here...",
  "comments": [
    {
      "path": "path/to/file.ts",
      "line": 42,
      "body": "Your comment here",
      "side": "RIGHT"
    },
    {
      "path": "path/to/file.ts",
      "start_line": 10,
      "line": 15,
      "body": "This entire block needs refactoring because...",
      "side": "RIGHT"
    }
  ],
  "event": "COMMENT"
}
\`\`\`

**Important:**
- \`line\` is the line number shown in the prefix (e.g., R42 means line 42, use 42 for the line field)
- \`start_line\` (optional) marks the beginning of a multi-line range
- \`side\` should be "RIGHT" for lines prefixed with R (new/modified code), "LEFT" for lines prefixed with L (deleted code)
- Use multi-line comments when feedback applies to a block of code (e.g., a function, loop, or related lines)
- Only comment on lines that appear in the diff
- Be constructive and specific
- Focus on: bugs, security, performance, readability, best practices`
}

/**
 * Build prompt for a specific reviewer in multi-reviewer mode
 */
export function buildMultiReviewerPrompt(
  pr: PRData,
  diff: string,
  reviewerPrompt: string,
  reviewerName: string,
  fileContext?: { files: FileContext[]; skippedFiles: string[] },
): string {
  const filesTable = pr.files
    .map((f) => `| ${f.path} | +${f.additions}/-${f.deletions} | ${f.changeType} |`)
    .join("\n")

  const annotatedDiff = annotateDiffWithLineNumbers(diff)
  const contextSection = fileContext
    ? formatFileContext(fileContext.files, fileContext.skippedFiles)
    : ""

  return `${reviewerPrompt}

## PR Information

**Title:** ${pr.title}
**Author:** ${pr.author}
**Branch:** ${pr.headRef} -> ${pr.baseRef}
**Changes:** +${pr.additions}/-${pr.deletions} lines

### Description
${pr.body || "*No description provided*"}

### Changed Files
| File | Changes | Type |
|------|---------|------|
${filesTable}

${contextSection}
### Diff

Lines are prefixed with \`R{num}|\` for new file lines (RIGHT side) and \`L{num}|\` for old file lines (LEFT side).

\`\`\`diff
${annotatedDiff}
\`\`\`

---
You are the "${reviewerName}" reviewer. Provide your review in the JSON format specified above.`
}

/**
 * Build a simpler prompt for quick reviews
 */
export function buildQuickReviewPrompt(pr: PRData, diff: string): string {
  const annotatedDiff = annotateDiffWithLineNumbers(diff)

  return `Review this PR briefly. Focus on critical issues only.

**${pr.title}** by ${pr.author}
+${pr.additions}/-${pr.deletions} lines

Lines are prefixed with \`R{num}|\` for new file lines (RIGHT side) and \`L{num}|\` for old file lines (LEFT side).

\`\`\`diff
${annotatedDiff}
\`\`\`

Respond with JSON:
\`\`\`json
{
  "overview": "Brief summary...",
  "comments": [
    {"path": "file.ts", "line": 10, "body": "Issue here", "side": "RIGHT"},
    {"path": "file.ts", "start_line": 20, "line": 25, "body": "This block...", "side": "RIGHT"}
  ],
  "event": "COMMENT"
}
\`\`\`

Use \`start_line\` for multi-line comments when feedback applies to a code block.`
}

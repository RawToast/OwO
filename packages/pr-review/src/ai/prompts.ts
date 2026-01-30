import type { PRData } from "../github/types"

/**
 * Build the review prompt for the AI
 */
export function buildReviewPrompt(pr: PRData, diff: string): string {
  const filesTable = pr.files
    .map((f) => `| ${f.path} | +${f.additions}/-${f.deletions} | ${f.changeType} |`)
    .join("\n")

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
\`\`\`diff
${diff}
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
- \`line\` is the line number (or end line for multi-line comments)
- \`start_line\` (optional) marks the beginning of a multi-line range
- \`side\` should be "RIGHT" for new/modified code, "LEFT" for deleted code
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
): string {
  const filesTable = pr.files
    .map((f) => `| ${f.path} | +${f.additions}/-${f.deletions} | ${f.changeType} |`)
    .join("\n")

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

### Diff
\`\`\`diff
${diff}
\`\`\`

---
You are the "${reviewerName}" reviewer. Provide your review in the JSON format specified above.`
}

/**
 * Build a simpler prompt for quick reviews
 */
export function buildQuickReviewPrompt(pr: PRData, diff: string): string {
  return `Review this PR briefly. Focus on critical issues only.

**${pr.title}** by ${pr.author}
+${pr.additions}/-${pr.deletions} lines

\`\`\`diff
${diff}
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

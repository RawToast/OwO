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
    }
  ],
  "event": "COMMENT"
}
\`\`\`

**Important:**
- \`line\` must be a line number in the NEW version of the file (shown with + in diff)
- \`side\` should be "RIGHT" for new code, "LEFT" for deleted code
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
  "comments": [],
  "event": "COMMENT"
}
\`\`\``
}

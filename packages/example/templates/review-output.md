# Code Review Output Format

Format the final review with these sections:

## Overview
2-3 sentence summary of the changes and overall assessment.

## Changes Summary
Bullet list of files changed with brief description of each.

## Issues Found
Group by severity (Critical, Warning, Info). Use <details> blocks:

<details>
<summary>🔴 Critical: [Issue Title]</summary>

**File:** path/to/file.ts:123
**Description:** What's wrong
**Suggestion:** How to fix

</details>

## Recommendations
Numbered list of actionable improvements.

## Verdict
APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION

# @owo/github-reviewer

AI-powered GitHub PR code review with inline comments.

## Features

- **Inline Comments** - Comments on specific lines in the diff
- **CodeRabbit-style Overview** - Summary, changes table, walkthrough
- **Configurable Reviewers** - Custom personas and focus areas
- **Parallel Reviews** - Multiple reviewers run simultaneously (Phase 3)

## Quick Start

### As a GitHub Action

```yaml
# .github/workflows/review.yml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: jmagar/owo/packages/github-reviewer@main
        with:
          model: anthropic/claude-sonnet-4-20250514
          github_token: ${{ secrets.GITHUB_TOKEN }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Configuration

Add to `owo.json`:

```json
{
  "github-review": {
    "enabled": true,
    "trigger": "command",
    "mentions": ["/review"],
    "reviewers": [
      {
        "name": "security",
        "context": [{ "file": "prompts/security.md" }],
        "focus": "security vulnerabilities"
      },
      {
        "name": "quality",
        "context": ["Focus on code quality and best practices"],
        "focus": "code quality"
      }
    ],
    "defaults": {
      "model": "anthropic/claude-sonnet-4-5"
    }
  }
}
```

## Tools

### `get_pr_context`

Get PR metadata, diff, and file changes.

```typescript
get_pr_context({
  include_diff: true, // Include full unified diff
  include_files: true, // Include file list with stats
})
```

### `submit_review`

Submit a review with overview and inline comments.

```typescript
submit_review({
  overview: "## Summary\n\nGreat PR!",
  comments: [
    {
      path: "src/auth.ts",
      line: 42,
      body: "Consider adding input validation here",
      side: "RIGHT",
    },
  ],
  event: "COMMENT", // or "APPROVE", "REQUEST_CHANGES"
})
```

## How It Works

1. **Diff Position Mapping** - Converts file line numbers to GitHub's diff positions
2. **Fallback for Non-Diff Lines** - Comments on lines not in the diff are moved to the overview
3. **Batch Submission** - All inline comments are submitted in a single API call

## Roadmap

- [x] Phase 1: Basic inline comments + overview (MVP)
- [ ] Phase 2: APPROVE/REQUEST_CHANGES actions
- [ ] Phase 3: Parallel multi-reviewer execution
- [ ] Phase 4: Mermaid diagrams and advanced formatting

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test packages/github-reviewer/test/

# Type check
bun run compile

# Build
bun run make
```

## License

MIT

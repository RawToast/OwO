# @owo/pr-review

AI-powered PR code review using opencode SDK + Octokit.

## Features

- Uses opencode SDK for AI-powered code analysis
- Posts reviews with inline comments on specific lines
- Updates existing reviews instead of creating duplicates
- Works as GitHub Action or standalone CLI
- No opencode fork required!

## Usage

### GitHub Action

```yaml
name: PR Review

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

      - uses: RawToast/owo/packages/pr-review@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          model: anthropic/claude-sonnet-4-20250514
```

### CLI

```bash
# Install
bun add @owo/pr-review

# Review a PR
GITHUB_TOKEN=ghp_xxx owo-review --pr 123 --owner myorg --repo myrepo

# Dry run
owo-review --pr 123 --owner myorg --repo myrepo --dry-run
```

### Library

```typescript
import { reviewPR } from "@owo/pr-review"

const result = await reviewPR({
  token: process.env.GITHUB_TOKEN,
  owner: "myorg",
  repo: "myrepo",
  prNumber: 123,
  model: "anthropic/claude-sonnet-4-20250514",
})

console.log(result.reviewUrl)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub token with PR read/write |
| `GITHUB_REPOSITORY` | No | Auto-set in Actions |
| `GITHUB_EVENT_PATH` | No | Auto-set in Actions |

## Architecture

```
Octokit (GitHub API)     opencode SDK (AI)
        │                       │
        └───────┬───────────────┘
                │
         @owo/pr-review
                │
    ┌───────────┼───────────┐
    │           │           │
 Fetch PR    AI Review   Post Review
```

## License

MIT

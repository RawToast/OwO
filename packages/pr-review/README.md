# @owo/pr-review

AI-powered PR review with multi-reviewer support.

## Features

- 🤖 Multi-Reviewer Mode - parallel reviewers
- ✅ Verifier Step - AI synthesizes findings
- 📝 Inline Comments - with severity levels
- 🔄 Review Updates - no duplicates
- ⚙️ Configurable - custom prompts
- 🎯 Smart Actions - auto REQUEST_CHANGES
- 🚀 Multiple Modes - Action, CLI, library

## Quick Start

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
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # Or for opencode models:
          # model: opencode/glm-4.7
          # opencode_api_key: ${{ secrets.OPENCODE_API_KEY }}
```

### Configuration

Create `.github/pr-review.json`:

```json
{
  "reviewers": [
    { "name": "architecture", "prompt": "Focus on structure and boundaries." },
    { "name": "security", "prompt": "Hunt for auth, secrets, and input risks." },
    { "name": "performance", "prompt": "Identify hot paths and waste." }
  ],
  "verifier": {
    "enabled": true,
    "prompt": "Synthesize and de-duplicate findings."
  },
  "levels": {
    "critical": "Must fix before merge",
    "warning": "Should fix soon",
    "info": "Nice to consider"
  }
}
```

### Level Options

Use `critical`, `warning`, or `info` to control severity. `critical` triggers `REQUEST_CHANGES` when findings exist, while `warning` and `info` keep the review as `COMMENT`.

### Custom Reviewer Prompt

```json
{
  "reviewers": [
    {
      "name": "testing",
      "prompt": "Look for missing tests and flaky patterns."
    }
  ]
}
```

### Per-Reviewer Models

Each reviewer (and the verifier) can use a different model:

```json
{
  "defaults": {
    "model": "anthropic/claude-sonnet-4-20250514"
  },
  "reviewers": [
    {
      "name": "quality",
      "prompt": "Focus on code quality and best practices."
    },
    {
      "name": "security",
      "prompt": "Hunt for vulnerabilities and secrets.",
      "model": "anthropic/claude-opus-4-20250514"
    },
    {
      "name": "quick-check",
      "prompt": "Fast sanity check for obvious issues.",
      "model": "anthropic/claude-haiku-4-20250514"
    }
  ],
  "verifier": {
    "enabled": true,
    "model": "anthropic/claude-sonnet-4-20250514"
  }
}
```

Model resolution order:
1. Reviewer/verifier-specific `model`
2. `defaults.model` from config
3. `--model` CLI flag / Action input
4. Falls back to `anthropic/claude-sonnet-4-20250514`

### CLI

```bash
# Install
bun add @owo/pr-review

# Review a PR
GITHUB_TOKEN=ghp_xxx owo-review --pr 123 --owner myorg --repo myrepo

# Dry run
owo-review --pr 123 --owner myorg --repo myrepo --dry-run

# Legacy single-reviewer mode
owo-review --pr 123 --owner myorg --repo myrepo --legacy
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
  configPath: ".github/pr-review.json",
})

console.log(result.reviewUrl)
```

## How It Works

1. Fetch PR metadata, commits, and diff hunks
2. Run multiple reviewers in parallel with custom prompts
3. Verify and synthesize findings into a single review payload
4. Post inline comments with severity and de-duplication
5. Update existing reviews to avoid duplicates

## Default Reviewers

- General code quality
- Security and secrets
- Performance and reliability
- Documentation and tests

## Environment Variables

| Variable            | Required | Description                         |
| ------------------- | -------- | ----------------------------------- |
| `GITHUB_TOKEN`      | Yes      | GitHub token with PR read/write     |
| `GITHUB_REPOSITORY` | No       | Auto-set in Actions                 |
| `GITHUB_EVENT_PATH` | No       | Auto-set in Actions                 |
| `ANTHROPIC_API_KEY` | No       | Required for Anthropic models       |
| `OPENCODE_API_KEY`  | No       | Required for opencode hosted models |

## License

MIT

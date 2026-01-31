# @owo/pr-review

AI-powered PR review with multi-reviewer support.

## Features

- 🤖 Multi-Reviewer Mode - parallel reviewers with different focuses
- ✅ Verifier Step - strongest model synthesizes and verifies findings
- 📊 Rich Formatting - collapsible sections, tables, mermaid diagrams
- 📝 Inline Comments - with severity levels (critical/warning/info)
- 🔄 Review Updates - no duplicates on re-review
- ⚙️ Configurable - custom prompts, per-reviewer models
- 🎯 Smart Actions - auto REQUEST_CHANGES on critical issues
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
          # Or for NanoGPT models:
          # model: nano-gpt/zai-org/glm-4.7
          # nanogpt_api_key: ${{ secrets.NANOGPT_API_KEY }}
```

### Configuration

Create `.github/pr-review.json` (with optional schema for IDE autocomplete):

```json
{
  "$schema": "https://raw.githubusercontent.com/RawToast/owo/main/packages/pr-review/schema.json",
  "reviewers": [
    { "name": "architecture", "prompt": "Focus on structure and boundaries." },
    { "name": "security", "prompt": "Hunt for auth, secrets, and input risks." },
    { "name": "performance", "prompt": "Identify hot paths and waste." }
  ],
  "verifier": {
    "enabled": true,
    "prompt": "Synthesize and de-duplicate findings."
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

### Verifier Options

The verifier synthesizes findings and produces the final formatted review:

```json
{
  "verifier": {
    "enabled": true,
    "model": "anthropic/claude-opus-4-20250514",
    "diagrams": true,
    "level": "warning"
  }
}
```

| Option       | Default     | Description                                                 |
| ------------ | ----------- | ----------------------------------------------------------- |
| `enabled`    | `true`      | Enable/disable the verifier step                            |
| `model`      | (default)   | Model for verification (use strongest for best results)     |
| `diagrams`   | `true`      | Generate mermaid diagrams in the review                     |
| `level`      | `"warning"` | Minimum severity to include (`critical`, `warning`, `info`) |
| `prompt`     | (built-in)  | Custom verifier prompt                                      |
| `promptFile` | -           | Path to custom prompt file                                  |

### File Context Options

Reviewers can access full file content (not just diffs) for better context:

```json
{
  "context": {
    "enabled": true,
    "maxFileSizeKb": 100,
    "maxTotalSizeKb": 500
  }
}
```

| Option           | Default | Description                                 |
| ---------------- | ------- | ------------------------------------------- |
| `enabled`        | `true`  | Enable/disable full file context            |
| `maxFileSizeKb`  | `100`   | Skip files larger than this (KB)            |
| `maxTotalSizeKb` | `500`   | Maximum total context size across all files |

**Note:** File context requires the repository to be checked out locally (automatic in GitHub Actions with `actions/checkout`).

### CLI

```bash
# Install
# bun add @owo/pr-review
# clone the repo, install with bun i

# Review a PR
GITHUB_TOKEN=ghp_xxx owo-review --pr 123 --owner myorg --repo myrepo

# Dry run with output to file
owo-review --pr 123 --owner myorg --repo myrepo --dry-run --output review.md

# Use config from another directory (picks up .github/pr-review.json)
owo-review --pr 123 --owner myorg --repo myrepo --config ../myrepo

# Use a specific config file
owo-review --pr 123 --owner myorg --repo myrepo --config ./custom-review.json

# Legacy single-reviewer mode
owo-review --pr 123 --owner myorg --repo myrepo --legacy

# Review a PR with source files from a specific directory
owo-review --pr 123 --owner myorg --repo myrepo --source-dir /path/to/checkout

# Useful for testing: review a remote PR using local files
owo-review --pr 456 --owner other-org --repo other-repo --source-dir ~/code/other-repo
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

1. **Fetch** PR metadata, commits, diff hunks, and full file content
2. **Review** Run multiple reviewers in parallel (fast/cheap models)
3. **Verify** Strongest model verifies claims and synthesizes findings
4. **Format** Produces structured markdown with tables, diagrams, collapsible sections
5. **Post** Inline comments with severity, updates existing reviews

### Output Format

The verifier produces a well-structured review:

- **Summary** - Overview with key changes bullet points
- **Changes** - Collapsible table with File, Change, Reason columns
- **Critical Issues** - Collapsible blocks with location, impact, resolution
- **Warnings** - Non-critical issues to consider
- **Observations** - Minor notes and suggestions
- **Diagrams** - Mermaid diagrams (architecture, flow, ERD)
- **Verdict** - PASSED or REQUIRES CHANGES

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
| `NANO_GPT_API_KEY`  | No       | Required for NanoGPT models         |

## License

MIT

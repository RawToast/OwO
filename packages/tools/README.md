# @owo/tools

API-based tools for OpenCode. All tools are disabled by default to avoid context bloat.

## Installation

Add to your `opencode.json`:

```json
{
  "plugins": ["@owo/tools"]
}
```

## Configuration

Enable tools in `~/.config/opencode/owo.json` (or `.opencode/owo.json`):

```json
{
  "tools": {
    "exa": { "enabled": true },
    "context7": { "enabled": true },
    "grep_app": { "enabled": true },
    "jira": {
      "enabled": true,
      "cloudId": "your-cloud-id",
      "email": "you@company.com"
    },
    "coderabbit": { "enabled": true }
  }
}
```

## Environment Variables

Set API keys as environment variables (recommended):

| Tool | Environment Variable | Get Key |
|------|---------------------|---------|
| Exa | `EXA_API_KEY` | https://exa.ai |
| Context7 | `CONTEXT7_API_KEY` | https://context7.com/dashboard |
| Jira | `JIRA_API_TOKEN` | https://id.atlassian.com/manage-profile/security/api-tokens |
| CodeRabbit | `CODERABBIT_API_KEY` | https://coderabbit.ai |

Alternatively, you can set keys directly in config (not recommended for shared configs):

```json
{
  "tools": {
    "exa": { "enabled": true, "key": "your-api-key" }
  }
}
```

## Available Tools

### Exa

Web search with AI-powered semantic understanding.

- `exa_search` - Search the web with semantic understanding
- `exa_code_context` - Search for code examples and documentation
- `exa_crawl` - Extract content from specific URLs

### Context7

Query up-to-date library documentation and code examples.

- `context7_search` - Search docs with automatic library resolution (use this first!)
- `context7_docs` - Query docs when you already have the library ID (for follow-ups)

### grep.app

Search public GitHub repositories - no API key required!

- `grep_app_search` - Search code across 1M+ public GitHub repos

### Jira

Interact with Jira issues.

- `jira` - Fetch a Jira issue by key
- `jira_search` - Search issues with JQL

### CodeRabbit

AI-powered code review.

- `coderabbit_review` - Review code changes

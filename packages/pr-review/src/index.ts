#!/usr/bin/env bun
// packages/pr-review/src/index.ts

// Library exports
export { reviewPR, type ReviewOptions, type ReviewResult } from "./reviewer"
export * from "./github"
export * from "./ai"
export * from "./diff"

import { reviewPR, type ReviewOptions } from "./reviewer"
import { getPRContextFromEnv } from "./github/pr"
import { getGitHubToken } from "./github/client"

async function main() {
  const args = process.argv.slice(2)

  // Help
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
@owo/pr-review - AI-powered PR code review

Usage:
  owo-review [options]
  owo-review --pr <number> --owner <owner> --repo <repo>

Options:
  --pr <number>      PR number to review
  --owner <owner>    Repository owner
  --repo <repo>      Repository name
  --model <model>    Model to use (e.g., anthropic/claude-sonnet-4-20250514)
  --dry-run          Don't post review, just print it
  --help, -h         Show this help

Environment:
  GITHUB_TOKEN       Required. GitHub token with PR read/write access
  GITHUB_REPOSITORY  Optional. owner/repo format (auto-detected in Actions)
  GITHUB_EVENT_PATH  Optional. Path to event JSON (auto-set in Actions)

Examples:
  # In GitHub Actions (auto-detects PR context)
  owo-review

  # Manual review
  owo-review --pr 123 --owner myorg --repo myrepo

  # Dry run
  owo-review --pr 123 --owner myorg --repo myrepo --dry-run
`)
    process.exit(0)
  }

  // Parse args
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`)
    return idx !== -1 ? args[idx + 1] : undefined
  }

  const prNumber = getArg("pr")
  const owner = getArg("owner")
  const repo = getArg("repo")
  const model = getArg("model")
  const dryRun = args.includes("--dry-run")

  // Build options
  let options: ReviewOptions

  if (prNumber && owner && repo) {
    // Manual mode
    options = {
      token: getGitHubToken(),
      owner,
      repo,
      prNumber: parseInt(prNumber, 10),
      model,
      dryRun,
    }
  } else {
    // Auto-detect from GitHub Actions environment
    const ctx = getPRContextFromEnv()
    if (!ctx) {
      console.error("Error: Could not detect PR context.")
      console.error("Either run in GitHub Actions or provide --pr, --owner, --repo")
      process.exit(1)
    }

    options = {
      token: getGitHubToken(),
      owner: ctx.owner,
      repo: ctx.repo,
      prNumber: ctx.number,
      model,
      dryRun,
    }
  }

  console.log(`@owo/pr-review v0.1.0`)
  console.log(`Reviewing ${options.owner}/${options.repo}#${options.prNumber}`)
  console.log("")

  const result = await reviewPR(options)

  if (!result.success) {
    console.error(`\nReview failed: ${result.error}`)
    process.exit(1)
  }

  if (dryRun && result.review) {
    console.log("\n--- Review (dry run) ---")
    console.log(result.review.overview)
    console.log(`\nInline comments: ${result.review.comments.length}`)
    for (const c of result.review.comments) {
      console.log(`  ${c.path}:${c.line} - ${c.body.slice(0, 50)}...`)
    }
  } else {
    console.log(`\nReview ${result.isUpdate ? "updated" : "posted"}: ${result.reviewUrl}`)
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})

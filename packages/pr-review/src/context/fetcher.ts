import { existsSync, readFileSync, statSync } from "fs"
import { join } from "path"
import type { ContextConfig } from "../config/types"
import type { ContextResult, FileContext } from "./types"

const DEFAULT_MAX_FILE_SIZE_KB = 100
const DEFAULT_MAX_TOTAL_SIZE_KB = 500

/**
 * Fetch file context from local filesystem
 */
export function fetchLocalContext(
  repoRoot: string,
  changedPaths: string[],
  config?: ContextConfig,
): ContextResult {
  const maxFileSizeBytes = (config?.maxFileSizeKb ?? DEFAULT_MAX_FILE_SIZE_KB) * 1024
  const maxTotalSizeBytes = (config?.maxTotalSizeKb ?? DEFAULT_MAX_TOTAL_SIZE_KB) * 1024

  const files: FileContext[] = []
  const skippedFiles: string[] = []
  const skippedReason = new Map<string, string>()
  let totalSizeBytes = 0

  for (const relativePath of changedPaths) {
    const fullPath = join(repoRoot, relativePath)

    // Check if file exists
    if (!existsSync(fullPath)) {
      skippedFiles.push(relativePath)
      skippedReason.set(relativePath, "file not found (possibly deleted)")
      continue
    }

    // Check file size
    const stats = statSync(fullPath)
    if (stats.size > maxFileSizeBytes) {
      skippedFiles.push(relativePath)
      skippedReason.set(
        relativePath,
        `file too large (${Math.round(stats.size / 1024)}KB > ${config?.maxFileSizeKb ?? DEFAULT_MAX_FILE_SIZE_KB}KB)`,
      )
      continue
    }

    // Check total size limit
    if (totalSizeBytes + stats.size > maxTotalSizeBytes) {
      skippedFiles.push(relativePath)
      skippedReason.set(relativePath, "total context size limit reached")
      continue
    }

    // Read file content
    try {
      const content = readFileSync(fullPath, "utf-8")
      files.push({
        path: relativePath,
        content,
        sizeBytes: stats.size,
        truncated: false,
      })
      totalSizeBytes += stats.size
    } catch (error) {
      skippedFiles.push(relativePath)
      skippedReason.set(
        relativePath,
        `read error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return {
    files,
    totalSizeBytes,
    skippedFiles,
    skippedReason,
  }
}

/**
 * Check if we're in a valid repo root (has the changed files)
 */
export function canFetchLocalContext(repoRoot: string, changedPaths: string[]): boolean {
  if (!repoRoot || changedPaths.length === 0) {
    return false
  }

  // Check if at least one changed file exists locally
  for (const relativePath of changedPaths) {
    const fullPath = join(repoRoot, relativePath)
    if (existsSync(fullPath)) {
      return true
    }
  }

  return false
}

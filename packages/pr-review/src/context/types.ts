/**
 * File content with metadata
 */
export type FileContext = {
  path: string
  content: string
  sizeBytes: number
  truncated: boolean
}

/**
 * Result of fetching context
 */
export type ContextResult = {
  files: FileContext[]
  totalSizeBytes: number
  skippedFiles: string[]
  skippedReason: Map<string, string>
}

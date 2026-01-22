/**
 * Background Task System Types
 * Minimal types for fire-and-forget parallel agent execution
 */

export type TaskStatus = "running" | "completed" | "failed" | "cancelled"

export type BackgroundTask = {
  id: string
  sessionID: string
  agent: string
  description: string
  prompt: string
  status: TaskStatus
  startedAt: Date
  completedAt?: Date
  error?: string
  parentAgent?: string
}

export type LaunchInput = {
  agent: string
  prompt: string
  description: string
  parentSessionID: string
  parentAgent?: string
}

export type CompletionNotification = {
  allComplete: boolean
  message: string
  completedTasks: BackgroundTask[]
  runningCount: number
  parentAgent?: string
}

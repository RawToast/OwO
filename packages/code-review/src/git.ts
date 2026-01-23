export type DiffMode = "vs-main" | "unstaged" | "staged" | "commits"

export type DiffInput = {
  mode: DiffMode
  refs?: string[]
}

export type DiffResult = {
  mode: DiffMode
  diff: string
  refs?: string[]
  command: string
}

export type ExecFn = (cmd: string, opts: { cwd: string }) => Promise<string>

export type GatherOptions = {
  exec: ExecFn
  cwd: string
}

function buildCommand(input: DiffInput): string {
  switch (input.mode) {
    case "vs-main":
      return "git diff main...HEAD"
    case "unstaged":
      return "git diff"
    case "staged":
      return "git diff --cached"
    case "commits": {
      const refs = input.refs ?? []
      if (refs.length === 0) {
        return "git diff HEAD~1 HEAD"
      }
      if (refs.length === 1) {
        return `git show ${refs[0]} --format=`
      }
      return `git diff ${refs[0]} ${refs[1]}`
    }
    default: {
      const _exhaustive: never = input.mode
      throw new Error(`Unknown diff mode: ${input.mode}`)
    }
  }
}

export async function gatherDiff(
  input: DiffInput,
  options: GatherOptions
): Promise<DiffResult> {
  const command = buildCommand(input)

  let diff: string
  try {
    diff = await options.exec(command, { cwd: options.cwd })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Git command failed: ${command} (cwd: ${options.cwd}): ${msg}`)
  }

  return { mode: input.mode, diff, refs: input.refs, command }
}

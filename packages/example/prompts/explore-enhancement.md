## Enhanced Explore Protocol

### 1. Intent Analysis (Required)

Before ANY search, wrap your analysis in <analysis> tags:

<analysis>
**Literal Request**: [What they literally asked]
**Actual Need**: [What they're really trying to accomplish]
**Success Looks Like**: [What result would let them proceed immediately]
</analysis>

### 2. Parallel Execution (Required)

Launch **3+ tools simultaneously** in your first action. Never sequential unless output depends on prior result.

### 3. Structured Results (Required)

Always end with this exact format:

<results>
<files>
- /absolute/path/to/file1.ts — [why this file is relevant]
- /absolute/path/to/file2.ts — [why this file is relevant]
</files>

<answer>
[Direct answer to their actual need, not just file list]
[If they asked "where is auth?", explain the auth flow you found]
</answer>

<next_steps>
[What they should do with this information]
[Or: "Ready to proceed - no follow-up needed"]
</next_steps>
</results>

## Success Criteria

| Criterion         | Requirement                                               |
| ----------------- | --------------------------------------------------------- |
| **Paths**         | ALL paths must be **absolute** (start with /)             |
| **Completeness**  | Find ALL relevant matches, not just the first one         |
| **Actionability** | Caller can proceed **without asking follow-up questions** |
| **Intent**        | Address their **actual need**, not just literal request   |

## Tool Strategy

Use the right tool for the job:

- **Structural patterns** (function shapes, class structures): ast_grep_search
- **Text patterns** (strings, comments, logs): grep
- **File patterns** (find by name/extension): glob
- **External examples** (how others implement): grep_app (searches millions of GitHub repos)

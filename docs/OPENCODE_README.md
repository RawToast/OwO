# OpenCode SDK Documentation Index

This directory contains comprehensive documentation on the OpenCode SDK, with a focus on **parallel agent requests and multi-agent patterns**.

## 📚 Documentation Files

### 1. **OPENCODE_QUICK_START.md** ⭐ START HERE

**Best for:** Getting started quickly with practical examples

- 3 core parallel patterns
- Key methods reference table
- Common patterns (analyze files, compare agents, parallel branches)
- Tips and best practices
- **Read time: 5-10 minutes**

### 2. **OPENCODE_SDK_ANALYSIS.md** 📖 COMPREHENSIVE REFERENCE

**Best for:** Understanding the full SDK architecture and capabilities

- Complete SDK architecture overview
- All core API methods documented
- 5 detailed parallel execution patterns
- Agent configuration and types
- Message parts system
- Plugin integration guide
- Advanced patterns (batch processing, cascading requests)
- Error handling and best practices
- **Read time: 20-30 minutes**

### 3. **OPENCODE_EXAMPLES.md** 💻 COPY-PASTE READY

**Best for:** Production-ready code examples

- 10 complete, runnable examples:
  1. Basic parallel agent analysis
  2. Batch file processing
  3. Fire-and-forget background tasks
  4. Parallel session forking
  5. Plugin with parallel tool
  6. Batch processing with concurrency control
  7. Compare agent performance
  8. Cascading parallel requests
  9. Error handling with parallel requests
  10. Real-world multi-agent code review system
- Debugging tips
- Production use guidelines
- **Read time: 15-20 minutes**

---

## 🎯 Quick Navigation

### I want to...

**...get started immediately**
→ Read: `OPENCODE_QUICK_START.md` (5 min)
→ Copy: Example 1 from `OPENCODE_EXAMPLES.md`

**...understand the full API**
→ Read: `OPENCODE_SDK_ANALYSIS.md` (sections 1-4)

**...implement parallel requests**
→ Read: `OPENCODE_QUICK_START.md` (Patterns 1-3)
→ Copy: Examples 1, 2, 6 from `OPENCODE_EXAMPLES.md`

**...build a plugin with parallel agents**
→ Read: `OPENCODE_SDK_ANALYSIS.md` (section 6)
→ Copy: Example 5 from `OPENCODE_EXAMPLES.md`

**...handle errors properly**
→ Read: `OPENCODE_SDK_ANALYSIS.md` (section 9)
→ Copy: Example 9 from `OPENCODE_EXAMPLES.md`

**...compare different agents**
→ Copy: Example 7 from `OPENCODE_EXAMPLES.md`

**...process many files efficiently**
→ Copy: Example 2 or 6 from `OPENCODE_EXAMPLES.md`

---

## 🚀 Key Capabilities

### ✅ Fully Supported

- **Parallel session creation** - Create multiple sessions simultaneously
- **Parallel message sending** - Send messages to multiple sessions in parallel
- **Fire-and-forget async** - Use `promptAsync()` for non-blocking requests
- **Multi-agent delegation** - Use `AgentPartInput` to delegate to subagents
- **Session forking** - Create independent parallel execution branches
- **Batch processing** - Process multiple items concurrently
- **Agent comparison** - Run same task with multiple agents in parallel
- **Cascading requests** - Chain parallel operations

### 🎯 Recommended Patterns

| Use Case                  | Pattern                                | Example  |
| ------------------------- | -------------------------------------- | -------- |
| Independent parallel work | `Promise.all()` with multiple sessions | Ex. 1, 2 |
| Background processing     | `promptAsync()`                        | Ex. 3    |
| Agent delegation          | `AgentPartInput` or `SubtaskPartInput` | Ex. 5    |
| Branching logic           | `session.fork()`                       | Ex. 4    |
| Resource management       | Batch requests                         | Ex. 6    |
| Agent comparison          | Same task, different agents            | Ex. 7    |
| Complex workflows         | Cascading requests                     | Ex. 8    |

---

## 📋 API Quick Reference

### Core Methods

```typescript
// Session Management
client.session.create() // Create new session
client.session.list() // List all sessions
client.session.fork() // Fork session at message point
client.session.delete() // Delete session

// Message/Prompt (Core for Parallel)
client.session.prompt() // Send message (blocking)
client.session.promptAsync() // Send message (non-blocking) ⭐
client.session.messages() // Get all messages
client.session.message() // Get specific message

// Agent Discovery
client.app.agents() // List available agents
client.app.skills() // List available skills
```

### Message Parts

```typescript
// Text
{ type: "text", text: "Your message" }

// File
{ type: "file", mime: "text/plain", url: "file:///path" }

// Delegate to agent
{ type: "agent", name: "code-review" }

// Structured subtask
{ type: "subtask", prompt: "...", agent: "...", model: {...} }
```

---

## 🔧 From Within a Plugin

```typescript
import type { Plugin } from "@opencode-ai/plugin"

const MyPlugin: Plugin = async (input) => {
  const { client, directory } = input

  // client is ready to use for parallel requests
  // See Example 5 in OPENCODE_EXAMPLES.md

  return {
    tool: {
      /* ... */
    },
    event: async ({ event }) => {
      /* ... */
    },
  }
}
```

---

## 📊 Concurrency Patterns

### All at once (fastest)

```typescript
await Promise.all(requests)
```

### First to complete

```typescript
const first = await Promise.race(requests)
```

### Sequential (slowest)

```typescript
for (const req of requests) await req
```

### Batches of N (balanced)

```typescript
for (let i = 0; i < requests.length; i += batchSize) {
  await Promise.all(requests.slice(i, i + batchSize))
}
```

---

## ⚠️ Common Pitfalls

❌ **DON'T:**

- Create unnecessary sessions (reuse when possible)
- Ignore errors in `Promise.all()` (use `Promise.allSettled()`)
- Spawn unlimited concurrent requests (batch large workloads)
- Rely on default agents (specify explicitly)
- Block on fire-and-forget requests (use `promptAsync()`)

✅ **DO:**

- Use `Promise.all()` for coordinated parallel work
- Use `promptAsync()` for background tasks
- Reuse sessions for multiple messages
- Specify agents explicitly
- Batch large workloads (100+ items)
- Handle errors with `Promise.allSettled()`

---

## 🔗 Source References

- **SDK Location**: `/Users/james.morris/github/opencode/packages/sdk/js/`
- **Official Example**: `/Users/james.morris/github/opencode/packages/sdk/js/example/example.ts`
- **Plugin Types**: `/Users/james.morris/github/opencode/packages/plugin/src/index.ts`
- **Generated Types**: `/Users/james.morris/github/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`
- **Generated SDK**: `/Users/james.morris/github/opencode/packages/sdk/js/src/v2/gen/sdk.gen.ts`

---

## 📝 Document Structure

```
OPENCODE_README.md (this file)
├── OPENCODE_QUICK_START.md
│   ├── 3 core patterns
│   ├── Key methods
│   └── Common patterns
├── OPENCODE_SDK_ANALYSIS.md
│   ├── Architecture overview
│   ├── Complete API reference
│   ├── 5 detailed patterns
│   ├── Agent configuration
│   ├── Plugin integration
│   └── Advanced patterns
└── OPENCODE_EXAMPLES.md
    ├── 10 complete examples
    ├── Production guidelines
    └── Debugging tips
```

---

## 🎓 Learning Path

### Beginner (30 minutes)

1. Read: `OPENCODE_QUICK_START.md`
2. Copy: Example 1 from `OPENCODE_EXAMPLES.md`
3. Run and modify the example

### Intermediate (1 hour)

1. Read: `OPENCODE_SDK_ANALYSIS.md` (sections 1-4)
2. Copy: Examples 2, 6 from `OPENCODE_EXAMPLES.md`
3. Implement batch processing

### Advanced (2 hours)

1. Read: `OPENCODE_SDK_ANALYSIS.md` (all sections)
2. Copy: Examples 5, 8, 10 from `OPENCODE_EXAMPLES.md`
3. Build a plugin with parallel agents

### Expert (ongoing)

1. Study: Generated SDK types and methods
2. Experiment: Combine patterns for your use case
3. Optimize: Profile and improve performance

---

## 💡 Key Insights

### 1. Parallel Requests are Native

The SDK is built for parallel execution. All methods return Promises and can be combined with `Promise.all()`.

### 2. Sessions are Independent

Each session is independent and can be processed in parallel. Create one per task or reuse for multiple messages.

### 3. Fire-and-Forget is Built-In

Use `promptAsync()` to send requests that process in the background without blocking.

### 4. Agents are Composable

Delegate to other agents using `AgentPartInput` or `SubtaskPartInput` for multi-agent workflows.

### 5. Plugins Get Full Access

Plugins receive the SDK client in their context and can spawn parallel requests just like standalone code.

---

## 🤝 Contributing

These documents are generated from analysis of:

- `/Users/james.morris/github/opencode/packages/sdk/js/src/v2/gen/sdk.gen.ts`
- `/Users/james.morris/github/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`
- `/Users/james.morris/github/opencode/packages/sdk/js/example/example.ts`
- `/Users/james.morris/github/opencode/packages/plugin/src/index.ts`

To update these docs, refer to the source files above.

---

## ❓ FAQ

**Q: Can I run unlimited parallel requests?**
A: Technically yes, but practically you should batch large workloads. The server may have limits.

**Q: Should I create one session or multiple?**
A: Depends on your use case. One session for related messages, multiple for independent tasks.

**Q: What's the difference between `prompt()` and `promptAsync()`?**
A: `prompt()` blocks until response, `promptAsync()` returns immediately and processes in background.

**Q: Can I use multiple agents in one session?**
A: Yes! Send messages with different `agent` parameters to the same session.

**Q: How do I handle errors in parallel requests?**
A: Use `Promise.allSettled()` instead of `Promise.all()` to handle partial failures.

**Q: Can I fork a session multiple times?**
A: Yes! Each fork is independent and can be forked again.

**Q: What agents are available?**
A: Call `client.app.agents()` to list available agents in your system.

---

## 📞 Support

For issues or questions:

1. Check the relevant documentation file
2. Review the examples in `OPENCODE_EXAMPLES.md`
3. Refer to the source code in `/Users/james.morris/github/opencode/packages/sdk/js/`

---

**Last Updated**: January 23, 2026
**SDK Version**: 1.1.33
**Documentation Version**: 1.0

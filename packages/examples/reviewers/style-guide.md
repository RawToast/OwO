# Style Guide Review Instructions

When reviewing code, check for:

## Code Style
- Consistent naming conventions (camelCase for variables, PascalCase for types)
- No semicolons (project uses oxfmt)
- Double quotes for strings
- Two-space indentation

## TypeScript
- Proper type annotations (avoid `any`)
- Use `type` for unions, `interface` for extendable shapes
- Type-only imports use `import type`

## Patterns
- Prefer `async/await` over raw Promises
- Error handling with proper context
- Fire-and-forget calls must catch errors

## Documentation
- JSDoc for exported functions
- Inline comments for complex logic

# @owo/examples

Example configurations for reference. This package is **NOT published** - it exists purely as documentation and inspiration.

## Contents

```
examples/
├── agents/           # Example agent definitions
│   ├── explorer.ts   # Codebase search specialist
│   ├── librarian.ts  # Open-source research agent
│   ├── oracle.ts     # Strategic technical advisor
│   └── ui-planner.ts # Designer-developer hybrid
├── prompts/          # Example prompt templates
│   ├── kaomoji-flair.txt
│   └── skills.txt
├── keywords/         # Example keyword contexts
│   ├── ultrawork.txt
│   ├── deep-research.txt
│   └── explore.txt
└── owo.example.json  # Example configuration file
```

## Usage

Copy and adapt these examples into your own configuration. The agents here are designed for the owo ecosystem but can be modified for any OpenCode setup.

### Example Config

See `owo.example.json` for a complete configuration example that uses:

- Custom keyword patterns with file-based contexts
- Agent-specific prompt injection
- Flair customization

## Agent Descriptions

### Explorer

Fast codebase grep - answers "Where is X?", "Find the code that does Y". Optimized for parallel search with structured results.

### Librarian

Open-source research specialist. Searches GitHub, documentation, and the web to find implementation examples and best practices.

### Oracle

Strategic technical advisor with deep reasoning. Use for architecture decisions, code reviews, and complex debugging.

### UI Planner

Designer-turned-developer. Creates stunning interfaces even without mockups. Focuses on aesthetics, animations, and user experience.

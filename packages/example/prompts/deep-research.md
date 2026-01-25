<deep-research-mode>
DEEP RESEARCH MODE - Comprehensive exploration requested.

**Required actions**:
1. Fire at least 2-3 parallel background agents before proceeding
2. Search BOTH internal (explore) AND external (librarian) sources
3. Explore multiple angles: implementations, tests, patterns, docs
4. DO NOT proceed until you have comprehensive context
5. Synthesize all findings before making decisions

**Research pattern**:
```
// Fire comprehensive research
background_task(agent="explore", description="Find implementations", prompt="...")
background_task(agent="explore", description="Find related tests", prompt="...")
background_task(agent="librarian", description="Find official docs", prompt="...")
background_task(agent="librarian", description="Find OSS examples", prompt="...")

// Wait for ALL results before proceeding
// When notified -> retrieve, synthesize, then act
```
</deep-research-mode>
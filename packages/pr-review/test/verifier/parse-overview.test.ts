import { describe, expect, test } from "bun:test"
import { parseOverviewResponse } from "../../src/verifier/synthesizer"

describe("parseOverviewResponse", () => {
  test("parses simple JSON response", () => {
    const response = `Here is my review:

\`\`\`json
{
  "overview": "## Summary\\n\\nThis PR looks good.",
  "passed": true
}
\`\`\`
`
    const result = parseOverviewResponse(response)
    expect(result.overview).toContain("## Summary")
    expect(result.overview).toContain("This PR looks good.")
    expect(result.passed).toBe(true)
  })

  test("parses JSON with embedded mermaid diagram", () => {
    const response = `\`\`\`json
{
  "overview": "## Summary\\n\\nChanges look good.\\n\\n## Diagrams\\n\\n\`\`\`mermaid\\nflowchart TD\\n    A[Start] --> B[End]\\n\`\`\`\\n\\nMore text after diagram.",
  "passed": true
}
\`\`\`
`
    const result = parseOverviewResponse(response)
    expect(result.overview).toContain("## Summary")
    expect(result.overview).toContain("mermaid")
    expect(result.overview).toContain("flowchart TD")
    expect(result.overview).toContain("More text after diagram")
    expect(result.passed).toBe(true)
  })

  test("parses JSON with multiple embedded code blocks", () => {
    const response = `\`\`\`json
{
  "overview": "## Code Examples\\n\\n\`\`\`typescript\\nconst x = 1;\\n\`\`\`\\n\\nAnd also:\\n\\n\`\`\`mermaid\\ngraph LR\\n    A --> B\\n\`\`\`\\n\\nDone.",
  "passed": false
}
\`\`\`
`
    const result = parseOverviewResponse(response)
    expect(result.overview).toContain("typescript")
    expect(result.overview).toContain("const x = 1")
    expect(result.overview).toContain("mermaid")
    expect(result.overview).toContain("graph LR")
    expect(result.passed).toBe(false)
  })

  test("falls back to raw JSON when no code block", () => {
    const response = `{
  "overview": "Simple review",
  "passed": true
}`
    const result = parseOverviewResponse(response)
    expect(result.overview).toBe("Simple review")
  })

  test("extracts overview field directly as last resort", () => {
    // Malformed JSON but extractable overview
    const response = `{"overview": "Extracted overview", "passed": true, extra stuff here`
    const result = parseOverviewResponse(response)
    expect(result.overview).toContain("Extracted overview")
  })

  test("returns raw response when nothing parseable", () => {
    const response = "Just some plain text review without any JSON"
    const result = parseOverviewResponse(response)
    expect(result.overview).toBe(response)
    expect(result.passed).toBeUndefined()
  })
})

#!/usr/bin/env bun
/**
 * Generates JSON Schema from Zod types
 * Run: bun run scripts/generate-schema.ts
 */

import * as z from "zod"
import { PRReviewConfigSchema } from "../src/config/types"

const jsonSchema = z.toJSONSchema(PRReviewConfigSchema, {
  target: "draft-07",
})

// Add $schema and metadata
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://raw.githubusercontent.com/RawToast/owo/main/packages/pr-review/schema.json",
  title: "PR Review Configuration",
  description: "Configuration schema for @owo/pr-review",
  ...jsonSchema,
}

const output = JSON.stringify(schema, null, 2)

// Write to schema.json
const path = new URL("../schema.json", import.meta.url).pathname
await Bun.write(path, output + "\n")

console.log("✅ Generated schema.json")

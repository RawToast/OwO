import { expect, test } from "bun:test"
import * as mod from "@owo/prompt-injector"

test("exports only default plugin", () => {
  expect(Object.keys(mod)).toEqual(["default"])
})

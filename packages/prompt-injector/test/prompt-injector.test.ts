import { expect, test } from "bun:test"
import * as mod from "../src/prompt-injector"

test("exports only default plugin", () => {
  expect(Object.keys(mod)).toEqual(["default"])
})

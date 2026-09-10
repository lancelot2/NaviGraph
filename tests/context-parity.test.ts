import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect } from "vitest"
import { generateContextFromGraph, type ContextResult } from "@/lib/engine/core"
import { cases } from "./fixtures/context.cases"

// The cross-language parity contract. In UPDATE mode this regenerates the shared
// fixtures from the canonical TS core; otherwise it asserts the TS core still
// matches them (a regression guard). The Python parity test asserts the SAME
// fixtures, which is what keeps the two implementations byte-identical.

const FIXTURE_PATH = resolve("tests/fixtures/context/cases.json")
const UPDATE = !!process.env.UPDATE_FIXTURES

type StoredCase = {
  name: string
  graph: (typeof cases)[number]["graph"]
  request: (typeof cases)[number]["request"]
  expected: ContextResult
}

if (UPDATE) {
  const stored: StoredCase[] = cases.map((c) => ({
    name: c.name,
    graph: c.graph,
    request: c.request,
    expected: generateContextFromGraph(c.graph, c.request),
  }))
  mkdirSync(resolve("tests/fixtures/context"), { recursive: true })
  writeFileSync(FIXTURE_PATH, JSON.stringify(stored, null, 2) + "\n", "utf8")
}

describe("context core — parity fixtures", () => {
  it("fixtures file exists (run with UPDATE_FIXTURES=1 to generate)", () => {
    expect(existsSync(FIXTURE_PATH)).toBe(true)
  })

  const stored: StoredCase[] = existsSync(FIXTURE_PATH)
    ? JSON.parse(readFileSync(FIXTURE_PATH, "utf8"))
    : []

  for (const c of stored) {
    it(`TS core matches fixture: ${c.name}`, () => {
      const actual = generateContextFromGraph(c.graph, c.request)
      expect(actual).toEqual(c.expected)
      // Guard the byte-identical contract explicitly on the context string.
      expect(actual.context).toBe(c.expected.context)
    })
  }

  it("covers every authored case", () => {
    expect(stored.map((s) => s.name).sort()).toEqual(
      cases.map((c) => c.name).sort(),
    )
  })
})

import { expect, test } from "vitest"

import {
  confirmedOnly,
  DEFAULT_SELECTION,
  describe,
  estimate,
  formatRange,
  formatWeeks,
  stepsFor,
  type Selection,
  type Step,
} from "./pricing"

const pick = (changes: Partial<Selection>): Selection => ({ ...DEFAULT_SELECTION, ...changes })

test("a one-pager is just its own price, with nothing to size", () => {
  const result = estimate(pick({ type: "landing", size: "huge", design: "ready" }))
  expect(result.lines).toEqual([{ label: "One-page site", price: [2000, 3500] }])
  expect(result.price).toEqual([2000, 3500])
  expect(result.weeks).toEqual([1, 2])
})

test("size, design and features each add a line and their weeks", () => {
  const result = estimate(pick({ type: "business", size: "medium", design: "brand", features: ["blog"] }))
  expect(result.lines.map((line) => line.label)).toEqual([
    "Small business site",
    "5 to 8 layouts",
    "Design it around my brand",
    "Blog or news",
  ])
  expect(result.price).toEqual([7750, 15500])
  expect(result.weeks).toEqual([5, 9])
})

test("a feature the site type already has costs nothing extra", () => {
  const store = estimate(pick({ type: "store", design: "ready", features: ["payments", "cms"] }))
  expect(store.lines.map((line) => line.label)).toEqual(["Online store"])
  const business = estimate(pick({ type: "business", design: "ready", features: ["payments"] }))
  expect(business.lines.map((line) => line.label)).toContain("Take payments")
})

test("rushing costs more and takes less time, never under a week", () => {
  const calm = estimate(pick({ type: "landing", design: "ready" }))
  const rushed = estimate(pick({ type: "landing", design: "ready", rush: true }))
  expect(rushed.price[0]).toBeGreaterThan(calm.price[0])
  expect(rushed.weeks).toEqual([1, 1])
})

test("totals round outward: to $250 below five figures, $500 above", () => {
  const result = estimate(pick({ type: "business", design: "brand", rush: true }))
  // 5,500–10,500 at 1.25 is 6,875–13,125.
  expect(result.price).toEqual([6750, 13500])
})

test("ranges and weeks read naturally", () => {
  expect(formatRange([4000, 7000])).toBe("$4,000–$7,000")
  expect(formatRange([500, 500])).toBe("$500")
  expect(formatWeeks([1, 1])).toBe("1 week")
  expect(formatWeeks([3, 5])).toBe("3–5 weeks")
})

test("the attached estimate carries its title, every line, the total and the plan", () => {
  const selection = pick({ type: "store", features: ["search"], care: "essentials" })
  const text = describe(selection, estimate(selection))
  expect(text.split("\n")[0]).toBe("Website estimate")
  expect(text).toContain("- Online store: $9,000–$18,000")
  expect(text).toContain("- Site search: $600–$1,500")
  expect(text).toContain("- Included: Edit it yourself (CMS), Take payments")
  expect(text).toContain("Hosting & care: Essentials, $79/month")
})

test("a one-pager skips the size question; everything else asks it", () => {
  expect(stepsFor("landing")).toEqual(["type", "design", "features", "timing", "care"])
  expect(stepsFor("app")).toEqual(["type", "size", "design", "features", "timing", "care"])
})

test("only confirmed answers count towards the total", () => {
  const selection = pick({ type: "business", size: "large", design: "scratch", features: ["blog"], rush: true })
  const typeOnly = estimate(confirmedOnly(selection, new Set<Step>(["type"])))
  expect(typeOnly.lines.map((line) => line.label)).toEqual(["Small business site"])
  expect(typeOnly.price).toEqual([4000, 7000])
  const all = estimate(confirmedOnly(selection, new Set(stepsFor("business"))))
  expect(all).toEqual(estimate(selection))
})

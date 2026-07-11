import { describe, it, expect } from "vitest"
import { generateGradient } from "./profile-card"

describe("generateGradient", () => {
  it("is deterministic for the same name", () => {
    expect(generateGradient("Gener")).toBe(generateGradient("Gener"))
  })

  it("stays within the documented warm band (60-80) for both hues", () => {
    const hueRegex = /oklch\(0\.\d+ 0\.\d+ (\d+(?:\.\d+)?)\)/g
    for (const name of ["Gener", "Gus", "Lindsay", "a", "some really long name here"]) {
      const css = generateGradient(name)
      const hues = [...css.matchAll(hueRegex)].map((m) => Number(m[1]))
      expect(hues).toHaveLength(2)
      for (const hue of hues) {
        expect(hue).toBeGreaterThanOrEqual(60)
        expect(hue).toBeLessThanOrEqual(80)
      }
    }
  })

  it("varies across different names", () => {
    const a = generateGradient("Gener")
    const b = generateGradient("Gus")
    expect(a).not.toBe(b)
  })
})

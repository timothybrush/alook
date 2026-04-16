import { describe, it, expect } from "vitest"
import { parseRetryAfterSeconds } from "./retry-after"

describe("parseRetryAfterSeconds", () => {
  it("reads a positive integer from X-Retry-After", () => {
    const h = new Headers({ "X-Retry-After": "42" })
    expect(parseRetryAfterSeconds(h)).toBe(42)
  })

  it("falls back to Retry-After when X-Retry-After is absent", () => {
    const h = new Headers({ "Retry-After": "7" })
    expect(parseRetryAfterSeconds(h)).toBe(7)
  })

  it("returns null when neither header is set", () => {
    expect(parseRetryAfterSeconds(new Headers())).toBeNull()
  })

  it("returns null when the value is not numeric", () => {
    const h = new Headers({ "X-Retry-After": "soon" })
    expect(parseRetryAfterSeconds(h)).toBeNull()
  })

  it("returns null when the value is zero", () => {
    const h = new Headers({ "X-Retry-After": "0" })
    expect(parseRetryAfterSeconds(h)).toBeNull()
  })

  it("returns null when the value is negative", () => {
    const h = new Headers({ "X-Retry-After": "-5" })
    expect(parseRetryAfterSeconds(h)).toBeNull()
  })
})

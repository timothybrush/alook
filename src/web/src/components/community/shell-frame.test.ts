import { describe, it, expect } from "vitest"
import { resolveProfilePresence } from "./shell-frame"

describe("resolveProfilePresence", () => {
  it("returns online for self regardless of onlineUserIds", () => {
    expect(resolveProfilePresence(true, undefined, new Set())).toBe("online")
    expect(resolveProfilePresence(true, "u1", new Set())).toBe("online")
  })

  it("returns online when targetUserId is in onlineUserIds", () => {
    expect(resolveProfilePresence(false, "u1", new Set(["u1", "u2"]))).toBe("online")
  })

  it("returns offline when targetUserId is resolved but not online", () => {
    expect(resolveProfilePresence(false, "u3", new Set(["u1", "u2"]))).toBe("offline")
  })

  it("returns undefined when targetUserId is undefined (no member/friend match)", () => {
    expect(resolveProfilePresence(false, undefined, new Set(["u1"]))).toBeUndefined()
  })
})

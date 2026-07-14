import { describe, it, expect } from "vitest"
import { hasChannelMenu } from "./sortable-channel"

const noop = () => {}

describe("hasChannelMenu", () => {
  it("is false when no action handlers are provided", () => {
    expect(hasChannelMenu({})).toBe(false)
  })

  it("is true when any one action handler is provided", () => {
    expect(hasChannelMenu({ onEdit: noop })).toBe(true)
    expect(hasChannelMenu({ onManageMembers: noop })).toBe(true)
    expect(hasChannelMenu({ onDelete: noop })).toBe(true)
  })
})

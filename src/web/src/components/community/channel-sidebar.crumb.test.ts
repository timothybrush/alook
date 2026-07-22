import { describe, it, expect, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ChannelSidebar } from "./channel-sidebar"
import type { ChannelTree } from "./use-channel-tree"

const emptyTree = {
  collapsed: new Set<string>(),
  catOrder: [],
  order: {},
  catNames: {},
  catPrivate: {},
  catPending: {},
  catCreators: {},
  toggleCat: vi.fn(),
  removeChannel: vi.fn(),
  renameChannel: vi.fn(),
  markRead: vi.fn(),
  renameCategory: vi.fn(),
  onDragOver: vi.fn(),
  onDragEnd: vi.fn(),
} as unknown as ChannelTree

const render = () =>
  renderToStaticMarkup(
    createElement(ChannelSidebar, {
      tree: emptyTree,
      serverName: "Alpha",
      serverIcon: null,
      serverId: "srv_1",
      activeChannel: "",
      setActiveChannel: vi.fn(),
      onOpenSettings: vi.fn(),
    }),
  )

describe("ChannelSidebar header", () => {
  it("renders the server name as the sole header identity marker (no duplicate ServerCrumb icon)", () => {
    const html = render()
    expect(html).toContain("Alpha")
    expect(html).not.toContain('aria-label="Alpha"')
  })
})

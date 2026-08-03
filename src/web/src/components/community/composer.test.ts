import { describe, it, expect, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { pendingFilesToSendAttachments, popoverStyle, channelRefShowServerPrefix, ChannelRefRow } from "./composer"
import type { PendingFile } from "@/hooks/use-file-attachments"
import type { MentionContext } from "@/lib/community/mention-extension"
import type { ChannelRefCandidate } from "@/lib/community/channel-ref-extension"

function rectAt(top: number, opts: { left?: number; height?: number } = {}): DOMRect {
  const height = opts.height ?? 16
  const left = opts.left ?? 40
  return {
    top,
    bottom: top + height,
    left,
    right: left + 4,
    width: 4,
    height,
    x: left,
    y: top,
    toJSON() {},
  }
}

// `pendingFilesToSendAttachments` is the pure mapping Composer.send() uses
// to build onSend's attachments argument — extracted so the width/height
// threading can be unit-tested without mounting the full tiptap editor
// (Composer itself needs a real DOM; this pure function doesn't).
describe("pendingFilesToSendAttachments", () => {
  it("returns undefined for an empty pendingFiles list", () => {
    expect(pendingFilesToSendAttachments([])).toBeUndefined()
  })

  it("maps each PendingFile to {file, width, height}, preserving width/height when present", () => {
    const file = new File(["x"], "photo.png", { type: "image/png" })
    const pending: PendingFile[] = [
      { file, thumbnailUrl: null, thumbnailBlob: null, width: 1920, height: 1080 },
    ]
    const result = pendingFilesToSendAttachments(pending)
    expect(result).toEqual([{ file, width: 1920, height: 1080 }])
  })

  it("carries width/height through as undefined for a non-image PendingFile", () => {
    const file = new File(["x"], "notes.txt", { type: "text/plain" })
    const pending: PendingFile[] = [
      { file, thumbnailUrl: null, thumbnailBlob: null },
    ]
    const result = pendingFilesToSendAttachments(pending)
    expect(result).toEqual([{ file, width: undefined, height: undefined }])
  })

  it("preserves per-file order and dimensions across multiple files", () => {
    const a = new File(["a"], "a.png", { type: "image/png" })
    const b = new File(["b"], "b.png", { type: "image/png" })
    const pending: PendingFile[] = [
      { file: a, thumbnailUrl: null, thumbnailBlob: null, width: 100, height: 200 },
      { file: b, thumbnailUrl: null, thumbnailBlob: null, width: 300, height: 400 },
    ]
    const result = pendingFilesToSendAttachments(pending)
    expect(result).toEqual([
      { file: a, width: 100, height: 200 },
      { file: b, width: 300, height: 400 },
    ])
  })
})

describe("popoverStyle", () => {
  const VW = 1024
  const VH = 768

  it("anchors above the caret (default) when there's room above", () => {
    const s = popoverStyle(rectAt(500), VW, VH)
    expect(s.transform).toBe("translateY(-100%)")
    expect(s.top).toBe(500 - 4)
  })

  it("flips below the caret when space above is insufficient (caret near viewport top)", () => {
    const s = popoverStyle(rectAt(100, { height: 16 }), VW, VH)
    // 100px above < 240+8, and below has room → flip
    expect(s.transform).toBeUndefined()
    expect(s.top).toBe(116 + 4) // rect.bottom + 4
  })

  it("stays above when neither side fully fits, rather than flipping into a worse spot", () => {
    // Short viewport: no room above (top=100) and no room below either.
    const s = popoverStyle(rectAt(100, { height: 16 }), VW, 200)
    // below would overflow (116+240+8 > 200) → keep the above default
    expect(s.transform).toBe("translateY(-100%)")
  })

  it("clamps left so the 256px popup never runs off the right edge", () => {
    const s = popoverStyle(rectAt(500, { left: 1000 }), VW, VH)
    // maxLeft = 1024 - 256 - 8 = 760
    expect(s.left).toBe(760)
  })

  it("keeps the caret's left when it's within bounds", () => {
    const s = popoverStyle(rectAt(500, { left: 40 }), VW, VH)
    expect(s.left).toBe(40)
  })
})

// The `/`-channel-ref row's server-name prefix ("Alook / general").
//
// INVARIANT under test — the prefix is shown by CONTEXT, independent of how
// many servers the candidate list spans. This nails the bug where the prefix
// was gated on `spansMultipleServers` (`items.some(serverId !== items[0]...)`),
// so a single-server user saw NO prefix in their DMs. These tests assert the
// SEMANTIC invariant ("DM → prefix, regardless of server count; server → no
// prefix"), NOT a mechanical one-off value — so that a future change trying to
// re-gate on server-count breaks here and reads why in this comment. DM is a
// server-*outside* context: a bare "general" is ambiguous ("in which server?")
// no matter how many servers exist, so the prefix supplies server ownership;
// inside a server you already ARE there, so it's pure redundancy.
describe("channelRefShowServerPrefix — DM shows prefix regardless of server count", () => {
  // The candidate list the popup would hold; server COUNT here is what must NOT
  // matter to the decision. (Kept as data the reader can see, even though the
  // pure function ignores it — the point is exactly that it ignores it.)
  const oneServer: ChannelRefCandidate[] = [
    { id: "c1", name: "general", serverId: "s1", serverName: "Alook" },
  ]
  const manyServers: ChannelRefCandidate[] = [
    { id: "c1", name: "general", serverId: "s1", serverName: "Alook" },
    { id: "c2", name: "random", serverId: "s2", serverName: "Beta" },
  ]

  it("DM + a SINGLE server → prefix shown (the exact case the old spansMultipleServers gate broke)", () => {
    expect(channelRefShowServerPrefix("dm")).toBe(true)
    // Sanity: single-server list, yet the decision is still true — server count
    // does not enter into it.
    expect(oneServer.length).toBe(1)
  })

  it("DM + MANY servers → prefix shown (same as single — count-independent)", () => {
    expect(channelRefShowServerPrefix("dm")).toBe(true)
    expect(manyServers.length).toBeGreaterThan(1)
  })

  it("server channel context → prefix hidden (you're already in the server; the other half of the scope)", () => {
    expect(channelRefShowServerPrefix("channel")).toBe(false)
  })

  it("thread context → prefix hidden (same as channel — inside a server)", () => {
    expect(channelRefShowServerPrefix("thread")).toBe(false)
  })

  // Belt-and-braces over all contexts: DM is the ONLY one that shows the prefix.
  it("only the DM context shows the prefix, across every MentionContext", () => {
    const contexts: MentionContext[] = ["dm", "channel", "thread"]
    expect(contexts.filter((c) => channelRefShowServerPrefix(c))).toEqual(["dm"])
  })
})

describe("ChannelRefRow — prefix actually renders the 'serverName / name' text", () => {
  const item: ChannelRefCandidate = { id: "c1", name: "general", serverId: "s1", serverName: "Alook" }
  const render = (showServerPrefix: boolean) =>
    renderToStaticMarkup(
      createElement(ChannelRefRow, { item, selected: false, showServerPrefix, onSelect: vi.fn() }),
    )

  it("renders 'Alook / general' when showServerPrefix is true (real DOM output, not just the flag)", () => {
    const html = render(true)
    expect(html).toContain("Alook")
    expect(html).toContain("/")
    expect(html).toContain("general")
  })

  it("renders bare 'general' (no server prefix) when showServerPrefix is false", () => {
    const html = render(false)
    expect(html).toContain("general")
    expect(html).not.toContain("Alook")
  })
})

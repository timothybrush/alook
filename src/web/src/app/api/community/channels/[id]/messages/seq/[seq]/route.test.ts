import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
}))

const mockGetMessageByChannelAndSeq = vi.fn()
const mockRequireChannelMember = vi.fn()

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }))

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      communityMessage: {
        getMessageByChannelAndSeq: (...a: unknown[]) => mockGetMessageByChannelAndSeq(...a),
      },
    },
  }
})

vi.mock("@/lib/community/permissions", () => ({
  requireChannelMember: (...a: unknown[]) => mockRequireChannelMember(...a),
}))

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params
    return handler(req, { env: { DB: {} }, userId: "u1", email: "u@t.com", params })
  }),
}))

vi.mock("@/lib/middleware/helpers", () => {
  const { NextResponse } = require("next/server")
  return {
    writeJSON: (data: unknown, status = 200) => NextResponse.json(data, { status }),
    writeError: (message: string, status: number) =>
      NextResponse.json({ error: message }, { status }),
  }
})

import { GET } from "./route"

function req() {
  return new NextRequest("http://t/api/community/channels/ch_1/messages/seq/42")
}
const ctx = (channelId: string, seq: string) => ({ params: { id: channelId, seq } })

describe("GET seq-lookup — existence non-disclosure at the ref-resolution boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireChannelMember.mockResolvedValue({ ok: true, value: { id: "ch_1" } })
    mockGetMessageByChannelAndSeq.mockResolvedValue({ id: "m_42" })
  })

  it("member + message exists → 200 { id }", async () => {
    const res = await GET(req(), ctx("ch_1", "42") as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "m_42" })
  })

  it("NON-member (requireChannelMember 403) → 404, NOT 403 — collapses to the same not-found a missing message returns", async () => {
    // A no-access channel must be indistinguishable from a nonexistent one, so a
    // caller resolving a seq by an opaque ref can't use it as an existence
    // oracle (Aigneis security invariant). The channel-membership 403 collapses
    // to 404; genuine 400s (below) are preserved.
    mockRequireChannelMember.mockResolvedValue({ ok: false, status: 403, error: "forbidden" })
    const res = await GET(req(), ctx("ch_1", "42") as never)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "not_found" })
    expect(mockGetMessageByChannelAndSeq).not.toHaveBeenCalled()
  })

  it("member but message not found → 404 not_found (same neutral state as no-access)", async () => {
    mockGetMessageByChannelAndSeq.mockResolvedValue(null)
    const res = await GET(req(), ctx("ch_1", "42") as never)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "not_found" })
  })

  it("a genuine non-403 gate failure is NOT collapsed — status is preserved (guard is exact-403, not catch-all)", async () => {
    // Over-collapse guard (Blondie): only status===403 collapses. A 400 (or any
    // other) from the gate must pass through unchanged, so legitimate errors
    // aren't masked as not-found.
    mockRequireChannelMember.mockResolvedValue({ ok: false, status: 400, error: "bad_request" })
    const res = await GET(req(), ctx("ch_1", "42") as never)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "bad_request" })
  })

  it("invalid seq (non-numeric) → 400 invalid_seq, gate never consulted", async () => {
    const res = await GET(req(), ctx("ch_1", "abc") as never)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "invalid_seq" })
    expect(mockRequireChannelMember).not.toHaveBeenCalled()
  })
})
